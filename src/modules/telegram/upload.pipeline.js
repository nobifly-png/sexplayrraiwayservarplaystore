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
const getTelegramFileUrl = async (botToken, fileId) => {
  // Use Local Bot API if configured (supports files >20MB up to 2GB)
  // Otherwise use standard API (20MB limit)
  const useLocalApi = telegramConfig.useLocalApi && telegramConfig.localApiUrl;
  const baseUrl = useLocalApi 
    ? telegramConfig.localApiUrl 
    : 'https://api.telegram.org';
  
  logger.info({ 
    fileId, 
    useLocalApi, 
    apiUrl: baseUrl 
  }, 'Pipeline: fetching file info');
  
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}/bot${botToken}/getFile?file_id=${fileId}`;
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok || !parsed.result?.file_path) {
            const errMsg = parsed.description || 'getFile failed';
            
            // Check if it's a file size error
            if (errMsg.toLowerCase().includes('too big') || errMsg.toLowerCase().includes('too large') || errMsg.toLowerCase().includes('file is too big')) {
              return reject(new Error(
                'File too large for standard API (20MB limit). Solutions: 1. Send video DIRECTLY to bot (do not forward from channels). 2. Send as File instead of Video. 3. Compress video to under 20MB. Note: Forwarded videos from other channels cannot exceed 20MB.'
              ));
            }
            
            return reject(new Error(errMsg));
          }
          
          // Build download URL
          const downloadUrl = `${baseUrl}/file/bot${botToken}/${parsed.result.file_path}`;
          
          logger.info({ 
            filePath: parsed.result.file_path,
            fileSize: parsed.result.file_size,
            fileSizeMB: ((parsed.result.file_size || 0) / 1024 / 1024).toFixed(2),
            usingLocalApi: useLocalApi
          }, 'Pipeline: file download URL ready');
          
          resolve({
            downloadUrl,
            filePath: parsed.result.file_path,
            fileSize: parsed.result.file_size || 0
          });
        } catch { 
          reject(new Error('Failed to parse Telegram getFile response')); 
        }
      });
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => { 
      reject(new Error('Telegram getFile timed out')); 
    });
  });
};

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

  logger.info({ userId, fileId, title, fileSize }, 'Pipeline: Telegram direct upload started');

  // Get download URL - handles Local Bot API with fallback to standard API
  const { downloadUrl, filePath: telegramFilePath, fileSize: actualFileSize } = await getTelegramFileUrl(botToken, fileId);
  
  logger.info({ 
    downloadUrl: downloadUrl.substring(0, 100) + '...',
    fileSize: actualFileSize,
    fileSizeMB: (actualFileSize / 1024 / 1024).toFixed(2)
  }, 'Pipeline: file download URL ready');

  const ext = 'mp4'; // always mp4 after transcode
  const storageKey = buildVideoStorageKey(userId, 'mp4');

  // STREAMING UPLOAD: Download from Telegram → Stream to R2 (no buffering)
  // This supports files up to 2GB without memory issues
  logger.info({ storageKey, fileSize: actualFileSize }, 'Pipeline: streaming to R2');
  
  let uploadResult;
  try {
    uploadResult = await streamUrlToR2(downloadUrl, storageKey, 'video/mp4', actualFileSize);
  } catch (err) {
    logger.error({ err: err.message, storageKey }, 'Pipeline: streaming upload failed');
    throw new Error(`Upload failed: ${err.message}`);
  }

  logger.info({ 
    storageKey, 
    uploadedSize: uploadResult.fileSize,
    uploadedSizeMB: (uploadResult.fileSize / 1024 / 1024).toFixed(2)
  }, 'Pipeline: streaming upload complete');

  // Create video record
  const video = await Video.create({
    creatorId: userId,
    title: (title || 'Untitled').slice(0, 200),
    description: 'Uploaded via Telegram Bot',
    type: VIDEO_TYPE.DIRECT_UPLOAD,
    storageKey,
    fileName: title,
    mimeType: 'video/mp4',
    fileSize: uploadResult.fileSize,
    status: VIDEO_STATUS.READY,  // Mark ready immediately
    telegramFileUniqueId: fileUniqueId || undefined,
    uploadSource: 'TELEGRAM_DIRECT',
    createdViaBot: true
  });

  logger.info({ videoId: video._id }, 'Pipeline: video record created');

  // Optional: Thumbnail handling
  if (pendingThumb?.buffer) {
    await attachThumbnail(video, pendingThumb, null);
  } else {
    // Thumbnail generation in background (async, non-blocking)
    attachThumbnail(video, null, downloadUrl).catch(() => {});
  }

  // Create share link
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
