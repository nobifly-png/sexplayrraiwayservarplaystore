const { detectVideoLink, SUPPORTED_SOURCES } = require('./link.parser');
const { setPending, consumePending } = require('./pendingThumb.cache');
const { uploadTelegramVideo, duplicateClipNovaVideo } = require('./upload.pipeline');
const { enqueue } = require('./bulk.queue');
const { isRateLimited } = require('./bot.ratelimit');
const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const logger = require('../../config/logger');
const telegramConfig = require('../../config/telegram');

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://clipnovawebistefronendvarsel.vercel.app';
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

// Use Local Bot API base URL if configured, otherwise standard API
const getTelegramApiBase = () =>
  (telegramConfig.useLocalApi && telegramConfig.localApiUrl)
    ? telegramConfig.localApiUrl
    : 'https://api.telegram.org';

/* ─── Download Telegram photo to buffer ─────────────────────────────────── */
const downloadTelegramPhoto = async (photoArray) => {
  try {
    const https = require('https');
    const photo = photoArray[photoArray.length - 1]; // highest resolution
    const botToken = telegramConfig.botToken;
    const apiBase = getTelegramApiBase();

    const fileInfo = await new Promise((resolve, reject) => {
      https.get(`${apiBase}/bot${botToken}/getFile?file_id=${photo.file_id}`, (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => {
          try {
            const p = JSON.parse(d);
            if (!p.ok) return reject(new Error('getFile failed'));
            resolve(p.result);
          } catch { reject(new Error('parse error')); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });

    const downloadUrl = `${apiBase}/file/bot${botToken}/${fileInfo.file_path}`;

    const buffer = await new Promise((resolve, reject) => {
      https.get(downloadUrl, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

    return { buffer, mimeType: 'image/jpeg' };
  } catch (err) {
    logger.warn({ errMsg: err.message }, 'MessageRouter: failed to download photo');
    return null;
  }
};

/* ─── Safe sendPhoto with text fallback ─────────────────────────────────── */
const safeSendPhoto = async (ctx, chatId, thumbUrl, caption) => {
  if (thumbUrl) {
    try {
      await ctx.telegram.sendPhoto(chatId, thumbUrl, { caption });
      return;
    } catch (err) {
      logger.warn({ errMsg: err.message }, 'MessageRouter: sendPhoto failed, falling back to sendMessage');
    }
  }
  await ctx.telegram.sendMessage(chatId, caption).catch(() => {});
};

/* ─── MASTER ROUTER ──────────────────────────────────────────────────────── */
/**
 * Single entry point for ALL incoming messages.
 * Priority order:
 *   1. ClipNova link in text OR caption  → duplicate pipeline immediately
 *   2. Photo only (no link)              → cache pending thumbnail
 *   3. Video / Document                  → upload pipeline
 *   4. Text with external link           → ingest pipeline
 *   5. Unknown text                      → help message
 */
const routeMessage = async (ctx, session, { ingestService, linkService } = {}) => {
  const msg = ctx.message;
  if (!msg) return;

  const chatId = ctx.chat.id;

  // Extract all text content from message (text, caption, forwarded caption)
  const content = (msg.text || msg.caption || '').trim();

  // ── PRIORITY 1: ClipNova link detection (text OR caption) ────────────────
  // Must run BEFORE photo handler so forwarded posts with photo+caption work
  if (content) {
    const detected = detectVideoLink(msg);

    if (detected && detected.source === SUPPORTED_SOURCES.CLIPNOVA) {
      logger.info({ chatId, shortCode: detected.shortCode }, 'MessageRouter: Zexgram caption detected');

      let overrideThumb = null;
      if (msg.photo?.length) {
        logger.info({ chatId }, 'MessageRouter: forwarded thumbnail attached');
        overrideThumb = await downloadTelegramPhoto(msg.photo);
      }

      const pendingThumb = overrideThumb || consumePending(chatId);
      await _handleClipNovaLink(ctx, session, detected.shortCode, pendingThumb);
      return true;
    }

    // External link (TeraBox, Dailymotion, etc.) — only if no photo/video in same message
    if (detected && !msg.photo && !msg.video && !msg.document) {
      await _handleExternalLink(ctx, session, detected, ingestService, linkService);
      return true;
    }
  }

  // ── PRIORITY 2: Photo only (no ClipNova link) ────────────────────────────
  if (msg.photo?.length && !msg.video && !msg.document) {
    await _handlePhotoOnly(ctx, session);
    return true;
  }

  // ── PRIORITY 3: Video file ───────────────────────────────────────────────
  if (msg.video) {
    const v = msg.video;
    const title = (msg.caption || '').trim() || v.file_name || `Video ${new Date().toISOString().slice(0, 10)}`;
    _handleVideoFile(ctx, session, {
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id,
      title,
      mimeType: v.mime_type || 'video/mp4',
      fileSize: v.file_size
    });
    return true;
  }

  // ── PRIORITY 4: Document file ────────────────────────────────────────────
  if (msg.document) {
    const doc = msg.document;
    const title = (msg.caption || '').trim() ||
      (doc.file_name ? doc.file_name.replace(/\.[^.]+$/, '') : '') ||
      `Video ${new Date().toISOString().slice(0, 10)}`;
    _handleVideoFile(ctx, session, {
      fileId: doc.file_id,
      fileUniqueId: doc.file_unique_id,
      title,
      mimeType: doc.mime_type || 'application/octet-stream',
      fileSize: doc.file_size
    });
    return true;
  }

  // ── PRIORITY 5: Plain text with external link ────────────────────────────
  if (content) {
    const detected = detectVideoLink(msg);
    if (detected) {
      await _handleExternalLink(ctx, session, detected, ingestService, linkService);
      return true;
    }
  }

  return false;
};

/* ─── Photo only → cache pending thumbnail ───────────────────────────────── */
const _handlePhotoOnly = async (ctx, session) => {
  if (!session.userId) return ctx.reply('🔐 Please /login first.');

  const downloaded = await downloadTelegramPhoto(ctx.message.photo);
  if (downloaded) {
    setPending(ctx.chat.id, downloaded.buffer, downloaded.mimeType);
    logger.info({ chatId: ctx.chat.id }, 'MessageRouter: pending thumbnail cached');
    await ctx.reply('🖼 Thumbnail received! Now send your video or ClipNova link within 5 minutes.');
  } else {
    await ctx.reply('⚠️ Could not process thumbnail. Please try again.');
  }
};

/* ─── ClipNova link → duplicate pipeline ────────────────────────────────── */
const _handleClipNovaLink = async (ctx, session, shortCode, pendingThumb) => {
  const chatId = ctx.chat.id;

  if (!session.userId) return ctx.reply('🔐 Please /login first.');
  if (isRateLimited(chatId)) return ctx.reply('⚠️ Too many requests. Please wait a minute.');

  logger.info({ chatId, shortCode }, 'MessageRouter: duplicate pipeline triggered');

  const ackMsg = await ctx.reply('⏳ Processing ClipNova link...');

  try {
    const { video, shareUrl, message, wasAlreadyOwned } = await duplicateClipNovaVideo({
      userId: session.userId,
      shortCode,
      pendingThumb
    });

    const thumbUrl = video.thumbnailUrl || process.env.DEFAULT_THUMBNAIL_URL || null;
    const caption = message || (wasAlreadyOwned
      ? `🔁 You already have this video!\n\n🎬 ${video.title}\n🔗 ${shareUrl}`
      : `✅ Upload Complete\n\n🎬 ${video.title}\n🔗 ${shareUrl}`);

    await ctx.telegram.deleteMessage(chatId, ackMsg.message_id).catch(() => {});
    await safeSendPhoto(ctx, chatId, thumbUrl, caption);

  } catch (err) {
    logger.error({ err, shortCode }, 'MessageRouter: ClipNova duplication failed');
    const errMsg = err.message?.includes('not found') || err.message?.includes('not available')
      ? `❌ ${err.message}`
      : '❌ Upload failed. Please try again.';
    await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, errMsg, {})
      .catch(() => ctx.reply(errMsg).catch(() => {}));
  }
};

/* ─── Video/Document file → upload pipeline ─────────────────────────────── */
const _handleVideoFile = (ctx, session, fileInfo) => {
  const { fileId, fileUniqueId, title, mimeType, fileSize } = fileInfo;
  const chatId = ctx.chat.id;

  if (!session.userId) { ctx.reply('🔐 Please /login first.').catch(() => {}); return; }
  if (isRateLimited(chatId)) { ctx.reply('⚠️ Too many uploads. Please wait a minute.').catch(() => {}); return; }
  if (fileSize && fileSize > MAX_FILE_SIZE) { ctx.reply('❌ File too large. Maximum 2GB allowed.').catch(() => {}); return; }

  // Consume pending thumb NOW before async enqueue — prevents cross-user collision
  const pendingThumb = consumePending(chatId);

  enqueue(ctx, String(chatId), title, async () => {
    // Duplicate check: userId + fileUniqueId (NOT global — different users can repost same file)
    if (fileUniqueId) {
      const existing = await Video.findOne({
        creatorId: session.userId,        // scoped to THIS user only
        telegramFileUniqueId: fileUniqueId,
        isDeleted: false
      });
      if (existing) {
        const existingLink = await Link.findOne({ videoId: existing._id, isActive: true }).sort({ createdAt: -1 });
        const shareUrl = existingLink ? `${FRONTEND_URL}/watch/${existingLink.shortCode}` : null;
        logger.info({ fileUniqueId, userId: session.userId }, 'MessageRouter: duplicate file skipped (same user)');
        return { skipped: true, title: existing.title, shareUrl, thumbnailUrl: existing.thumbnailUrl || null };
      }
    }

    const { video, shareUrl, message } = await uploadTelegramVideo({
      userId: session.userId,
      fileId, fileUniqueId, title, mimeType, fileSize,
      pendingThumb
    });

    return { title: video.title, shareUrl, message, thumbnailUrl: video.thumbnailUrl || null };
  });
};

/* ─── External link → ingest pipeline ───────────────────────────────────── */
const _handleExternalLink = async (ctx, session, detected, ingestService, linkService) => {
  const chatId = ctx.chat.id;

  if (!session.userId) return ctx.reply('🔐 Please /login first.');
  if (isRateLimited(chatId)) return ctx.reply('⚠️ Too many requests. Please wait a minute.');

  const { INGEST_STATUS } = require('./ingestJob.model');
  const SOURCE_LABELS = {
    TERABOX: 'TeraBox', DAILYMOTION: 'Dailymotion',
    DIRECT_MP4: 'Direct Video', STREAMTAPE: 'Streamtape',
    MIXDROP: 'Mixdrop', DOODSTREAM: 'DoodStream',
    ZEXGRAM: 'Zexgram'
  };

  const sourceLabel = SOURCE_LABELS[detected.source] || detected.source;
  const ackMsg = await ctx.reply(`⏳ Processing ${sourceLabel} link...`);

  try {
    const result = await ingestService.ingest(
      session.userId, detected.url, detected.source,
      { chatId, messageId: ctx.message.message_id }
    );

    if (result.status === INGEST_STATUS.DONE) {
      const shareLink = await linkService.createLink(session.userId, result.video._id.toString()).catch(() => null);
      const shareUrl = shareLink ? `${FRONTEND_URL}/watch/${shareLink.shortCode}` : null;
      const reply = `✅ Imported!\n\n📹 ${result.video.title}\n${shareUrl ? `🔗 ${shareUrl}` : ''}`;
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, reply, {})
        .catch(() => ctx.reply(reply).catch(() => {}));

    } else if (result.status === INGEST_STATUS.DUPLICATE) {
      const existingVideo = result.job?.videoId
        ? await Video.findById(result.job.videoId).catch(() => null) : null;
      let dupMsg = '✅ Already Imported\n\n';
      if (existingVideo) {
        const existingLink = await Link.findOne({ videoId: existingVideo._id, isActive: true }).sort({ createdAt: -1 });
        dupMsg += existingLink ? `🔗 ${FRONTEND_URL}/watch/${existingLink.shortCode}` : 'Use /videos to find your link.';
      } else {
        dupMsg += 'Use /videos to find your link.';
      }
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, dupMsg, {})
        .catch(() => ctx.reply(dupMsg).catch(() => {}));

    } else {
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined,
        `❌ Import failed: ${result.error || 'Unknown error'}`, {}).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, 'MessageRouter: external link ingest failed');
    await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined,
      '❌ Import failed. Please try again.', {}).catch(() => {});
  }
};

// Keep named exports for backward compat
const handlePhoto = (ctx, session) => routeMessage(ctx, session);
const handleVideoFile = (ctx, session, fileInfo) => { ctx.message = { ...ctx.message, ...fileInfo }; return routeMessage(ctx, session); };
const handleClipNovaLink = (ctx, session, shortCode) => _handleClipNovaLink(ctx, session, shortCode, consumePending(ctx.chat.id));
const handleExternalLink = (ctx, session, detected, ingestService, linkService) => _handleExternalLink(ctx, session, detected, ingestService, linkService);

module.exports = { routeMessage, handlePhoto, handleVideoFile, handleClipNovaLink, handleExternalLink };
