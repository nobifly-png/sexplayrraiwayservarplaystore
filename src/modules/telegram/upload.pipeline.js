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

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.zaxgram.com';

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
    logger.info({ apiBase, useLocalApi: !!useLocal }, 'Pipeline: fetching file info from Telegram API');

    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok || !parsed.result?.file_path) {
            // If local API failed, try standard API as fallback
            if (useLocal) {
              logger.warn({ err: parsed.description }, 'Pipeline: Local Bot API getFile failed — falling back to standard API');
              return _getFileFromStandardApi(botToken, fileId).then(resolve).catch(reject);
            }
            return reject(new Error(parsed.description || 'Telegram getFile failed'));
          }
          resolve({
            downloadUrl: `${apiBase}/file/bot${botToken}/${parsed.result.file_path}`,
            filePath: parsed.result.file_path,
            fileSize: parsed.result.file_size || 0
          });
        } catch { reject(new Error('Failed to parse Telegram getFile response')); }
      });
      res.on('error', (err) => {
        if (useLocal) {
          logger.warn({ err: err.message }, 'Pipeline: Local Bot API connection error — falling back to standard API');
          return _getFileFromStandardApi(botToken, fileId).then(resolve).catch(reject);
        }
        reject(err);
      });
    });

    req.on('error', (err) => {
      if (useLocal) {
        logger.warn({ err: err.message }, 'Pipeline: Local Bot API request error — falling back to standard API');
        return _getFileFromStandardApi(botToken, fileId).then(resolve).catch(reject);
      }
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
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

  const { downloadUrl, filePath } = await getTelegramFileUrl(botToken, fileId);
  const ext = (filePath || '').split('.').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'mp4';
  const storageKey = buildVideoStorageKey(userId, 'mp4'); // always mp4 after transcode

  // Download video buffer
  logger.info({ storageKey }, 'Pipeline: downloading from Telegram');
  const rawBuffer = await new Promise((resolve, reject) => {
    const proto = downloadUrl.startsWith('https') ? https : http;
    proto.get(downloadUrl, { timeout: 120000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Download timed out')));
  });

  // Transcode to H.264 Baseline for ExoPlayer compatibility
  logger.info({ size: rawBuffer.length }, 'Pipeline: transcoding to H.264 Baseline');
  const videoBuffer = await transcodeToCompatible(rawBuffer);

  // Upload transcoded buffer to R2
  logger.info({ storageKey }, 'Pipeline: uploading to R2');
  const { url: _u } = await uploadBufferToR2(videoBuffer, storageKey, 'video/mp4');
  const uploadedSize = videoBuffer.length;

  const video = await Video.create({
    creatorId: userId,
    title: (title || 'Untitled').slice(0, 200),
    description: 'Uploaded via Telegram Bot',
    type: VIDEO_TYPE.DIRECT_UPLOAD,
    storageKey,
    fileName: title,
    mimeType: mimeType || 'video/mp4',
    fileSize: uploadedSize,
    status: VIDEO_STATUS.READY,
    telegramFileUniqueId: fileUniqueId || undefined,
    uploadSource: 'TELEGRAM_DIRECT',
    createdViaBot: true
  });

  logger.info({ videoId: video._id }, 'Pipeline: video record created');

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
