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
const {
  LARGE_FILE_THRESHOLD,
  downloadLargeFileToR2,
  deleteStorageChannelMessage,
} = require('./gramjs.client');

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.zaxgram.com').replace(/\/$/, '');
/* ─── Format message with header/footer ────────────────────────────────── */
const formatMessageWithHeaderFooter = async (userId, shareUrl, videoTitle) => {
  try {
    const user = await User.findById(userId);
    if (!user) return `✅ Upload Complete\n\n📹 ${videoTitle}\n🔗 ${shareUrl}`;

    // Clean Output: when enabled, return only the share link — no header, no footer,
    // no "✅ Upload Complete" prefix, no filename. Just the raw URL.
    if (user.cleanOutput) {
      return shareUrl;
    }

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

/* ─── Helper: getFile from one API base ─────────────────────────────────── */
const _getFileFromBase = (botToken, fileId, apiBase) => {
  return new Promise((resolve, reject) => {
    const url = `${apiBase}/bot${botToken}/getFile?file_id=${fileId}`;
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok || !parsed.result?.file_path) {
            return reject(new Error(parsed.description || 'getFile failed'));
          }

          // ── Build correct download URL ───────────────────────────────────
          // Local Bot API: file_path is an ABSOLUTE filesystem path
          //   e.g.  /var/lib/telegram-bot-api/<TOKEN>/files/video_123.mp4
          //   Download URL → <localApiBase><filePath>         (no /file/bot<TOKEN>/ prefix)
          //
          // Standard API: file_path is a RELATIVE path
          //   e.g.  videos/file_0.mp4
          //   Download URL → https://api.telegram.org/file/bot<TOKEN>/<filePath>
          const filePath = parsed.result.file_path;
          const isAbsolutePath = filePath.startsWith('/');

          let downloadUrl;
          if (isAbsolutePath) {
            // Local Bot API absolute path — serve directly (no token in URL)
            downloadUrl = `${apiBase}${filePath}`;
          } else {
            downloadUrl = `${apiBase}/file/bot${botToken}/${filePath}`;
          }

          resolve({
            downloadUrl,
            filePath,
            fileSize: parsed.result.file_size || 0,
            apiBase
          });
        } catch {
          reject(new Error('Failed to parse Telegram getFile response'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Telegram getFile timed out'));
    });
  });
};

/* ─── Telegram file URL ─────────────────────────────────────────────────── */
const getTelegramFileUrl = async (botToken, fileId) => {
  const useLocalApi = telegramConfig.useLocalApi && telegramConfig.localApiUrl;

  // Always try local API first when configured
  if (useLocalApi) {
    const localBase = telegramConfig.localApiUrl.replace(/\/+$/, '');
    logger.info({ fileId, apiUrl: localBase }, 'Pipeline: fetching file info via local API');

    try {
      const result = await _getFileFromBase(botToken, fileId, localBase);
      logger.info({
        filePath: result.filePath,
        isAbsolute: result.filePath.startsWith('/'),
        downloadUrl: result.downloadUrl.substring(0, 120),
        fileSizeMB: (result.fileSize / 1024 / 1024).toFixed(2)
      }, 'Pipeline: file URL ready (local API)');
      return result;
    } catch (localErr) {
      logger.warn({ err: localErr.message, fileId }, 'Pipeline: local API getFile failed — trying standard API fallback');

      // Fallback to standard Telegram API (only works for files ≤ 20MB)
      try {
        const result = await _getFileFromBase(botToken, fileId, 'https://api.telegram.org');
        logger.info({
          filePath: result.filePath,
          fileSizeMB: (result.fileSize / 1024 / 1024).toFixed(2)
        }, 'Pipeline: file URL ready (standard API fallback)');
        return result;
      } catch (stdErr) {
        // Check for file-too-big error from standard API
        const msg = stdErr.message || '';
        if (msg.toLowerCase().includes('too big') || msg.toLowerCase().includes('too large')) {
          throw new Error(
            'File too large for standard API (20MB limit) and local API is unreachable. ' +
            'Check that the telegram-bot-api Railway service is running and accessible.'
          );
        }
        throw new Error(`Upload failed: local API error: ${localErr.message} | standard API error: ${stdErr.message}`);
      }
    }
  }

  // Local API not configured — use standard API only
  logger.info({ fileId, apiUrl: 'https://api.telegram.org' }, 'Pipeline: fetching file info via standard API');
  try {
    const result = await _getFileFromBase(botToken, fileId, 'https://api.telegram.org');
    logger.info({
      filePath: result.filePath,
      fileSizeMB: (result.fileSize / 1024 / 1024).toFixed(2)
    }, 'Pipeline: file URL ready (standard API)');
    return result;
  } catch (err) {
    const msg = err.message || '';
    if (msg.toLowerCase().includes('too big') || msg.toLowerCase().includes('too large')) {
      throw new Error(
        'File too large for standard API (20MB limit). ' +
        'Solutions: 1. Configure TELEGRAM_USE_LOCAL_API=true with a local bot API server. ' +
        '2. Send video as File instead of Video. 3. Compress to under 20MB.'
      );
    }
    throw err;
  }
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

/* ─── PIPELINE 3: Large-file via GramJS (>19MB) ─────────────────────────── */
/**
 * Called by message.router when file_size > LARGE_FILE_THRESHOLD.
 *
 * Steps:
 *  1. Forward original message to storage channel via Telegraf Bot API.
 *  2. Use GramJS to stream-download the media from that forwarded message.
 *  3. Pipe chunks into R2 multipart upload (reuses gramjs.client downloadLargeFileToR2).
 *  4. On success: delete the forwarded message from storage channel.
 *  5. On failure: leave the forwarded message for manual recovery; return clean error.
 *
 * @param {object} opts
 * @param {string}  opts.userId
 * @param {string}  opts.fileId          - original Telegram file_id (for dedup only)
 * @param {string}  opts.fileUniqueId    - original file_unique_id (dedup key)
 * @param {string}  opts.title
 * @param {string}  opts.mimeType
 * @param {number}  opts.fileSize        - bytes as reported by Telegram
 * @param {object}  [opts.pendingThumb]  - { buffer, mimeType }
 * @param {object}  opts.telegrafCtx     - live Telegraf ctx (for forwardMessage)
 * @param {number}  opts.originalChatId  - chat the original message came from
 * @param {number}  opts.originalMsgId   - message_id of the original video message
 */
const uploadLargeVideoViaGramJS = async ({
  userId, fileId, fileUniqueId, title, mimeType, fileSize,
  pendingThumb, telegrafCtx, originalChatId, originalMsgId,
}) => {
  const botToken = telegramConfig.botToken;
  if (!botToken) throw new Error('Telegram bot token not configured');
  if (!isR2Configured()) throw new Error('R2 storage not configured');

  const storageChannelId = process.env.STORAGE_CHANNEL_ID;
  if (!storageChannelId) throw new Error('STORAGE_CHANNEL_ID is not configured');

  logger.info({
    userId,
    fileUniqueId,
    fileSizeMB: fileSize ? (fileSize / 1024 / 1024).toFixed(1) : 'unknown (Telegram omitted)',
    originalMsgId,
    originalChatId,
  }, 'Pipeline[GramJS]: large-file upload started');

  // ── Step 1: Forward original message to storage channel ──────────────────
  let forwardedMsgId = null;
  try {
    const forwarded = await telegrafCtx.telegram.forwardMessage(
      storageChannelId,   // destination
      originalChatId,     // from chat
      originalMsgId,      // message id
    );
    forwardedMsgId = forwarded.message_id;
    logger.info({ forwardedMsgId, storageChannelId }, 'Pipeline[GramJS]: message forwarded to storage channel');
  } catch (err) {
    logger.error({ err: err.message, originalChatId, originalMsgId }, 'Pipeline[GramJS]: forward to storage channel failed');
    throw new Error(`Could not forward message to storage channel: ${err.message}`);
  }

  // ── Step 2 + 3: GramJS stream-download → R2 multipart upload ─────────────
  const storageKey = buildVideoStorageKey(userId, 'mp4');
  let uploadResult;
  try {
    uploadResult = await downloadLargeFileToR2(forwardedMsgId, storageKey, fileSize);
    logger.info({
      storageKey,
      uploadedMB: (uploadResult.fileSize / 1024 / 1024).toFixed(1),
    }, 'Pipeline[GramJS]: R2 upload complete');
  } catch (err) {
    // Upload failed — leave forwarded message for manual recovery
    logger.error({
      err: err.message,
      forwardedMsgId,
      storageChannelId,
    }, 'Pipeline[GramJS]: R2 upload failed — forwarded message kept for manual recovery');
    throw new Error(`Large-file upload failed: ${err.message}`);
  }

  // ── Step 4: Delete the forwarded message from storage channel ────────────
  // Fire-and-forget — if this fails the file is still uploaded successfully.
  deleteStorageChannelMessage(forwardedMsgId).catch(() => {});

  // ── Step 5: Create video record ───────────────────────────────────────────
  const video = await Video.create({
    creatorId: userId,
    title: (title || 'Untitled').slice(0, 200),
    description: 'Uploaded via Telegram Bot',
    type: VIDEO_TYPE.DIRECT_UPLOAD,
    storageKey,
    fileName: title,
    mimeType: 'video/mp4',
    fileSize: uploadResult.fileSize,
    status: VIDEO_STATUS.READY,
    telegramFileUniqueId: fileUniqueId || undefined,
    uploadSource: 'TELEGRAM_GRAMJS',
    createdViaBot: true,
  });

  logger.info({ videoId: video._id }, 'Pipeline[GramJS]: video record created');

  // ── Step 6: Thumbnail ─────────────────────────────────────────────────────
  if (pendingThumb?.buffer) {
    await attachThumbnail(video, pendingThumb, null);
  } else {
    // Attempt ffmpeg thumbnail from R2 public URL (async, non-blocking)
    const videoPublicUrl = getPublicUrl(storageKey);
    attachThumbnail(video, null, videoPublicUrl).catch(() => {});
  }

  // ── Step 7: Create share link ─────────────────────────────────────────────
  const link = await linkService.createLink(userId, video._id.toString());
  const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

  const finalVideo = await Video.findById(video._id).lean();
  const formattedMessage = await formatMessageWithHeaderFooter(userId, shareUrl, finalVideo.title);

  logger.info({ videoId: video._id, shareUrl }, 'Pipeline[GramJS]: large-file upload complete');
  return { video: finalVideo, link, shareUrl, message: formattedMessage };
};

module.exports = { uploadTelegramVideo, uploadLargeVideoViaGramJS, duplicateClipNovaVideo, attachThumbnail, getTelegramFileUrl };
