const https = require('https');
const http = require('http');
const crypto = require('crypto');
const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const User = require('../users/user.model');
const linkService = require('../links/link.service');
const { VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');
const { isR2Configured } = require('../../config/r2');
const {
  streamUrlToR2, copyR2Object,
  buildVideoStorageKey, buildThumbnailStorageKey,
  getPublicUrl, uploadBufferToR2
} = require('./r2.utils');
const { generateThumbnailFromUrl, transcodeToCompatible } = require('./ffmpeg.service');
const logger = require('../../config/logger');
const telegramConfig = require('../../config/telegram');

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.zaxgram.com').replace(/\/$/, '');
/* ─── Format message with header/footer ────────────────────────────────── */
const formatMessageWithHeaderFooter = async (userId, shareUrl, videoTitle) => {
  try {
    const user = await User.findById(userId);
    if (!user) return `✅ Upload Complete\n\n📹 ${videoTitle}\n🔗 ${shareUrl}`;
    
    let message = '✅ Upload Complete\n\n';
    
    // Add header if enabled
    if (user.headerEnabled && user.telegramHeader) {
      message += `${user.telegramHeader}\n\n`;
    }
    
    // Video info and link
    message += `📹 ${videoTitle}\n🔗 ${shareUrl}`;
    
    // Add footer if enabled
    if (user.footerEnabled && user.telegramFooter) {
      message += `\n\n${user.telegramFooter}`;
    }
    
    return message;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to format message with header/footer');
    return `✅ Upload Complete\n\n📹 ${videoTitle}\n🔗 ${shareUrl}`;
  }
};

/* ─── Telegram file URL ─────────────────────────────────────────────────── */
const getTelegramFileUrl = (botToken, fileId) =>
  new Promise((resolve, reject) => {
    // Use Local Bot API if configured, otherwise fall back to standard API
    const useLocal = telegramConfig.useLocalApi && telegramConfig.localApiUrl;
    const apiBase = useLocal ? telegramConfig.localApiUrl : 'https://api.telegram.org';

    const url = `${apiBase}/bot${botToken}/getFile?file_id=${fileId}`;
    logger.info({ apiBase, useLocalApi: !!useLocal, fileId }, 'Pipeline: fetching file info from Telegram API');

    // Auto-detect http vs https based on URL
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok || !parsed.result?.file_path) {
            const errorMsg = parsed.description || 'Unknown error';
            
            // Check if it's the "file is too big" error (20MB+ on standard API)
            if (errorMsg.includes('too big') || errorMsg.includes('file_too_large')) {
              logger.error({ 
                err: errorMsg,
                fileId 
              }, 'Pipeline: File exceeds 20MB limit on standard Telegram API');
              return reject(new Error(
                '❌ File too large! Standard Telegram API supports max 20MB.\n\n' +
                '💡 Solutions:\n' +
                '1. Use files under 20MB, OR\n' +
                '2. Setup Local Bot API Server (supports up to 2GB)\n\n' +
                'Contact admin for Local Bot API setup instructions.'
              ));
            }
            
            // Log detailed error info
            logger.error({ 
              err: errorMsg, 
              useLocal, 
              apiBase,
              fileId 
            }, 'Pipeline: getFile API returned error');
            
            // If local API failed, try standard API as fallback
            if (useLocal) {
              logger.warn({ err: errorMsg }, 'Pipeline: Local Bot API getFile failed — falling back to standard API');
              return _getFileFromStandardApi(botToken, fileId).then(resolve).catch(reject);
            }
            return reject(new Error(errorMsg));
          }
          
          const downloadUrl = `${apiBase}/file/bot${botToken}/${parsed.result.file_path}`;
          logger.info({ 
            downloadUrl, 
            filePath: parsed.result.file_path,
            fileSize: parsed.result.file_size || 0,
            useLocal
          }, 'Pipeline: file download URL constructed');
          
          resolve({
            downloadUrl,
            filePath: parsed.result.file_path,
            fileSize: parsed.result.file_size || 0
          });
        } catch (err) { 
          logger.error({ err: err.message, data }, 'Pipeline: failed to parse Telegram getFile response');
          reject(new Error('Failed to parse Telegram getFile response')); 
        }
      });
      res.on('error', (err) => {
        logger.error({ err: err.message, useLocal }, 'Pipeline: getFile response error');
        if (useLocal) {
          logger.warn({ err: err.message }, 'Pipeline: Local Bot API connection error — falling back to standard API');
          return _getFileFromStandardApi(botToken, fileId).then(resolve).catch(reject);
        }
        reject(err);
      });
    });

    req.on('error', (err) => {
      logger.error({ err: err.message, useLocal, apiBase }, 'Pipeline: getFile request error');
      if (useLocal) {
        logger.warn({ err: err.message }, 'Pipeline: Local Bot API request error — falling back to standard API');
        return _getFileFromStandardApi(botToken, fileId).then(resolve).catch(reject);
      }
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      logger.warn({ useLocal, apiBase }, 'Pipeline: getFile request timed out');
      if (useLocal) {
        logger.warn('Pipeline: Local Bot API timed out — falling back to standard API');
        return _getFileFromStandardApi(botToken, fileId).then(resolve).catch(reject);
      }
      reject(new Error('Telegram getFile timed out'));
    });
  });

/* ─── Fallback: standard Telegram API (20MB limit) ─────────────────────── */
const _getFileFromStandardApi = (botToken, fileId) =>
  new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    logger.info('Pipeline: using standard Telegram API (20MB limit applies)');
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok || !parsed.result?.file_path)
            return reject(new Error(parsed.description || 'Telegram getFile failed'));
          resolve({
            downloadUrl: `https://api.telegram.org/file/bot${botToken}/${parsed.result.file_path}`,
            filePath: parsed.result.file_path,
            fileSize: parsed.result.file_size || 0
          });
        } catch { reject(new Error('Failed to parse Telegram getFile response')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Telegram getFile timed out')); });
  });

/* ─── Attach thumbnail (never throws) ──────────────────────────────────── */
const attachThumbnail = async (video, pendingThumb, videoDownloadUrl) => {
  try {
    const userId = video.creatorId.toString();
    const videoId = video._id.toString();
    const thumbKey = buildThumbnailStorageKey(userId, videoId);

    if (pendingThumb?.buffer) {
      const { url } = await uploadBufferToR2(pendingThumb.buffer, thumbKey, pendingThumb.mimeType || 'image/jpeg');
      video.thumbnailUrl = url;
      video.thumbnailKey = thumbKey;
      video.thumbnailSource = 'MANUAL';
      await video.save();
      logger.info({ videoId }, 'Thumbnail: manual pending thumb attached');
      return;
    }

    if (videoDownloadUrl) {
      const imgBuffer = await generateThumbnailFromUrl(videoDownloadUrl, 2);
      if (imgBuffer) {
        const { url } = await uploadBufferToR2(imgBuffer, thumbKey, 'image/jpeg');
        video.thumbnailUrl = url;
        video.thumbnailKey = thumbKey;
        video.thumbnailSource = 'AUTO';
        await video.save();
        logger.info({ videoId }, 'Thumbnail: FFmpeg auto-generated');
        return;
      }
    }

    const defaultUrl = process.env.DEFAULT_THUMBNAIL_URL || null;
    if (defaultUrl) {
      video.thumbnailUrl = defaultUrl;
      await video.save();
    }
  } catch (err) {
    logger.warn({ err, videoId: video._id }, 'Thumbnail: attachment failed — continuing');
  }
};

/* ─── PIPELINE 1: Direct Telegram upload ───────────────────────────────── */
const uploadTelegramVideo = async ({ userId, fileId, fileUniqueId, title, mimeType, fileSize, pendingThumb }) => {
  const botToken = telegramConfig.botToken;
  if (!botToken) throw new Error('Telegram bot token not configured');
  if (!isR2Configured()) throw new Error('R2 storage not configured');

  logger.info({ userId, fileId, title }, 'Pipeline: Telegram direct upload started');

  // Use Telegraf's getFileLink which automatically uses Local Bot API if configured
  const telegramBot = require('./telegram.bot');
  let downloadUrl;
  try {
    downloadUrl = await telegramBot.getBotFileLink(fileId);
    logger.info({ downloadUrl: downloadUrl.substring(0, 100) + '...' }, 'Pipeline: got download URL via Telegraf (respects Local API config)');
  } catch (err) {
    logger.error({ err: err.message }, 'Pipeline: failed to get file link via Telegraf');
    throw new Error(`Failed to get file download link: ${err.message}`);
  }

  const ext = 'mp4'; // always mp4 after transcode
  const storageKey = buildVideoStorageKey(userId, 'mp4');

  // Download video buffer with retry logic (10 min timeout per attempt for large files)
  logger.info({ storageKey, fileSize }, 'Pipeline: downloading from Telegram');
  
  let rawBuffer;
  let attempt = 0;
  const maxAttempts = 3;
  const DOWNLOAD_TIMEOUT = 600000; // 10 minutes per attempt
  
  while (attempt < maxAttempts) {
    attempt++;
    try {
      rawBuffer = await new Promise((resolve, reject) => {
        const proto = downloadUrl.startsWith('https') ? https : http;
        
        logger.info({ 
          attempt, 
          maxAttempts, 
          downloadUrl: downloadUrl.substring(0, 100) + '...', 
          timeout: DOWNLOAD_TIMEOUT 
        }, 'Pipeline: starting download attempt');
        
        const req = proto.get(downloadUrl, { timeout: DOWNLOAD_TIMEOUT }, (res) => {
          if (res.statusCode !== 200) {
            logger.error({ 
              statusCode: res.statusCode, 
              attempt, 
              downloadUrl: downloadUrl.substring(0, 100) + '...',
              headers: res.headers 
            }, 'Pipeline: download failed with non-200 status');
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          
          const chunks = [];
          let downloaded = 0;
          
          res.on('data', (chunk) => {
            chunks.push(chunk);
            downloaded += chunk.length;
            // Log progress every 10MB
            if (downloaded % (10 * 1024 * 1024) < chunk.length) {
              logger.info({ downloaded: `${(downloaded / 1024 / 1024).toFixed(1)}MB` }, 'Pipeline: download progress');
            }
          });
          
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            logger.info({ totalSize: `${(buffer.length / 1024 / 1024).toFixed(1)}MB`, attempt }, 'Pipeline: download complete');
            resolve(buffer);
          });
          
          res.on('error', (err) => {
            logger.error({ err: err.message, attempt }, 'Pipeline: download response error');
            reject(err);
          });
        });
        
        req.on('error', (err) => {
          logger.error({ err: err.message, attempt }, 'Pipeline: download request error');
          reject(err);
        });
        
        req.on('timeout', () => {
          req.destroy();
          logger.error({ attempt, timeout: DOWNLOAD_TIMEOUT }, 'Pipeline: download timeout');
          reject(new Error('Download timed out after 10 minutes'));
        });
      });
      
      break; // Success, exit retry loop
      
    } catch (err) {
      logger.warn({ attempt, maxAttempts, errMsg: err.message, errDetail: err.toString() }, 'Pipeline: download attempt failed');
      
      if (attempt >= maxAttempts) {
        throw new Error(`Download failed after ${maxAttempts} attempts: ${err.message}`);
      }
      
      // Wait before retry (exponential backoff: 2s, 4s, 8s)
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
      logger.info({ delay, nextAttempt: attempt + 1 }, 'Pipeline: retrying download');
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Upload ORIGINAL video immediately to R2 - transcode later in background
  logger.info({ storageKey, originalSize: rawBuffer.length }, 'Pipeline: uploading original to R2 (will transcode async)');
  const { url: _u } = await uploadBufferToR2(rawBuffer, storageKey, 'video/mp4');

  const video = await Video.create({
    creatorId: userId,
    title: (title || 'Untitled').slice(0, 200),
    description: 'Uploaded via Telegram Bot',
    type: VIDEO_TYPE.DIRECT_UPLOAD,
    storageKey,
    fileName: title,
    mimeType: 'video/mp4',
    fileSize: rawBuffer.length,
    status: VIDEO_STATUS.READY,  // Mark ready immediately
    telegramFileUniqueId: fileUniqueId || undefined,
    uploadSource: 'TELEGRAM_DIRECT',
    createdViaBot: true
  });

  logger.info({ videoId: video._id }, 'Pipeline: video record created, starting background transcode');

  // Start background transcode - don't wait for it
  (async () => {
    try {
      logger.info({ videoId: video._id, size: rawBuffer.length }, 'Background: transcoding to H.264 Baseline');
      const transcodedBuffer = await transcodeToCompatible(rawBuffer);
      
      // Only replace if transcode actually worked
      if (transcodedBuffer.length !== rawBuffer.length || transcodedBuffer !== rawBuffer) {
        const transcodedKey = storageKey.replace(/\.mp4$/, '_transcoded.mp4');
        await uploadBufferToR2(transcodedBuffer, transcodedKey, 'video/mp4');
        
        // Update video to use transcoded version
        video.storageKey = transcodedKey;
        video.fileSize = transcodedBuffer.length;
        await video.save();
        
        logger.info({ videoId: video._id, originalSize: rawBuffer.length, transcodedSize: transcodedBuffer.length }, 'Background: transcode complete, video updated');
      } else {
        logger.warn({ videoId: video._id }, 'Background: transcode returned original - FFmpeg failed');
      }
    } catch (err) {
      logger.error({ videoId: video._id, err: err.message }, 'Background: transcode failed, keeping original');
    }
  })().catch(() => {});  // Async fire-and-forget

  if (pendingThumb?.buffer) {
    await attachThumbnail(video, pendingThumb, null);
  } else {
    attachThumbnail(video, null, downloadUrl).catch(() => {});
  }

  const link = await linkService.createLink(userId, video._id.toString());
  const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

  // Re-fetch thumbnailUrl from DB in case async attachment updated it
  const finalVideo = await Video.findById(video._id).lean();

  // Format message with header/footer
  const formattedMessage = await formatMessageWithHeaderFooter(userId, shareUrl, finalVideo.title);

  logger.info({ videoId: video._id, shareUrl }, 'Pipeline: Telegram upload complete');
  return { video: finalVideo, link, shareUrl, message: formattedMessage };
};

/* ─── PIPELINE 2: ClipNova link duplication ────────────────────────────── */
const duplicateClipNovaVideo = async ({ userId, shortCode, pendingThumb }) => {
  logger.info({ userId, shortCode }, 'Pipeline: ClipNova duplication started');

  const originalLink = await Link.findOne({ shortCode }).populate('videoId');
  if (!originalLink) throw new Error('ClipNova link not found');

  const orig = originalLink.videoId;
  if (!orig || orig.isDeleted || orig.status !== VIDEO_STATUS.READY)
    throw new Error('Original video is not available');

  // Already duplicated by this user?
  const existingDup = await Video.findOne({ creatorId: userId, duplicatedFrom: orig._id, isDeleted: false });
  if (existingDup) {
    const existingLink = await Link.findOne({ videoId: existingDup._id, isActive: true }).sort({ createdAt: -1 });
    const shareUrl = existingLink ? `${FRONTEND_URL}/watch/${existingLink.shortCode}` : null;
    const formattedMessage = await formatMessageWithHeaderFooter(userId, shareUrl, existingDup.title);
    logger.info({ videoId: existingDup._id }, 'Pipeline: duplicate already exists');
    return { video: existingDup, link: existingLink, shareUrl, message: formattedMessage, wasAlreadyOwned: true };
  }

  // R2 server-side copy
  let newStorageKey = orig.storageKey;
  let newVideoUrl = null;
  if (orig.storageKey && isR2Configured()) {
    try {
      const ext = orig.storageKey.split('.').pop() || 'mp4';
      newStorageKey = buildVideoStorageKey(userId, ext);
      await copyR2Object(orig.storageKey, newStorageKey);
      newVideoUrl = getPublicUrl(newStorageKey);
      logger.info({ newStorageKey }, 'Pipeline: R2 video copy complete');
    } catch (err) {
      logger.warn({ err }, 'Pipeline: R2 copy failed — referencing original key');
      newStorageKey = orig.storageKey;
    }
  }

  const newVideo = await Video.create({
    creatorId: userId,
    title: orig.title,
    description: orig.description || 'Duplicated via Telegram Bot',
    type: VIDEO_TYPE.DIRECT_UPLOAD,
    storageKey: newStorageKey,
    fileName: orig.fileName,
    mimeType: orig.mimeType,
    fileSize: orig.fileSize,
    durationSeconds: orig.durationSeconds,
    status: VIDEO_STATUS.READY,
    uploadSource: 'TELEGRAM_RESHARE',
    duplicatedFrom: orig._id,
    createdViaBot: true
  });

  logger.info({ newVideoId: newVideo._id, origId: orig._id }, 'Pipeline: new video record created');

  // Thumbnail handling
  if (pendingThumb?.buffer) {
    await attachThumbnail(newVideo, pendingThumb, null);
  } else if (orig.thumbnailKey && isR2Configured()) {
    try {
      const newThumbKey = buildThumbnailStorageKey(userId, newVideo._id.toString());
      await copyR2Object(orig.thumbnailKey, newThumbKey);
      newVideo.thumbnailUrl = getPublicUrl(newThumbKey);
      newVideo.thumbnailKey = newThumbKey;
      newVideo.thumbnailSource = 'AUTO';
      await newVideo.save();
      logger.info({ newThumbKey }, 'Pipeline: thumbnail R2 copy complete');
    } catch {
      newVideo.thumbnailUrl = orig.thumbnailUrl || process.env.DEFAULT_THUMBNAIL_URL || null;
      await newVideo.save();
    }
  } else if (orig.thumbnailUrl) {
    newVideo.thumbnailUrl = orig.thumbnailUrl;
    await newVideo.save();
  } else {
    attachThumbnail(newVideo, null, newVideoUrl).catch(() => {});
  }

  const link = await linkService.createLink(userId, newVideo._id.toString());
  const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

  // Re-fetch to get latest thumbnailUrl
  const finalVideo = await Video.findById(newVideo._id).lean();

  // Format message with header/footer
  const formattedMessage = await formatMessageWithHeaderFooter(userId, shareUrl, finalVideo.title);

  logger.info({ newVideoId: newVideo._id, shareUrl }, 'Pipeline: duplication complete');
  return { video: finalVideo, link, shareUrl, message: formattedMessage, wasAlreadyOwned: false };
};

module.exports = { uploadTelegramVideo, duplicateClipNovaVideo, attachThumbnail, getTelegramFileUrl };
