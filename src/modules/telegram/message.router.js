const { detectVideoLink, SUPPORTED_SOURCES, detectAllVideoLinks } = require('./link.parser');
const { setPending, consumePending } = require('./pendingThumb.cache');
const { uploadTelegramVideo, uploadLargeVideoViaGramJS, duplicateClipNovaVideo } = require('./upload.pipeline');
const { LARGE_FILE_THRESHOLD } = require('./gramjs.client');
const { enqueue } = require('./bulk.queue');
const { isRateLimited } = require('./bot.ratelimit');
const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const logger = require('../../config/logger');
const telegramConfig = require('../../config/telegram');
const teraboxService = require('../terabox/terabox.service');

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.zaxgram.com').replace(/\/$/, '');
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

// Use Local Bot API base URL if configured, otherwise standard API
const getTelegramApiBase = () =>
  (telegramConfig.useLocalApi && telegramConfig.localApiUrl)
    ? telegramConfig.localApiUrl
    : 'https://api.telegram.org';

/* ─── Get Telegram file info with fallback ──────────────────────────────── */
const _getPhotoFileInfo = async (botToken, fileId) => {
  const https = require('https');
  const http = require('http');
  const useLocal = telegramConfig.useLocalApi && telegramConfig.localApiUrl;
  const apiBase = useLocal ? telegramConfig.localApiUrl.replace(/\/$/, '') : 'https://api.telegram.org';

  const tryFetch = (base) => new Promise((resolve, reject) => {
    // Auto-detect protocol based on URL
    const proto = base.startsWith('https') ? https : http;
    const req = proto.get(`${base}/bot${botToken}/getFile?file_id=${fileId}`, { timeout: 15000 }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          if (!p.ok) return reject(new Error('getFile failed'));
          resolve({ result: p.result, apiBase: base });
        } catch { reject(new Error('parse error')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });

  try {
    return await tryFetch(apiBase);
  } catch (err) {
    if (useLocal) {
      logger.warn({ err: err.message }, 'MessageRouter: Local API photo fetch failed — falling back to standard API');
      return tryFetch('https://api.telegram.org');
    }
    throw err;
  }
};

/* ─── Download Telegram photo to buffer ─────────────────────────────────── */
const downloadTelegramPhoto = async (photoArray) => {
  try {
    const https = require('https');
    const http = require('http');
    const photo = photoArray[photoArray.length - 1]; // highest resolution
    const botToken = telegramConfig.botToken;

    const { result: fileInfo, apiBase } = await _getPhotoFileInfo(botToken, photo.file_id);
    const downloadUrl = `${apiBase}/file/bot${botToken}/${fileInfo.file_path}`;

    // Auto-detect protocol based on URL
    const proto = downloadUrl.startsWith('https') ? https : http;

    const buffer = await new Promise((resolve, reject) => {
      proto.get(downloadUrl, (res) => {
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
  // No thumbnail — send text only, with preview disabled so OG image doesn't show
  await ctx.telegram.sendMessage(chatId, caption, { disable_web_page_preview: true }).catch(() => {});
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
  if (content) {
    const allDetected = detectAllVideoLinks(msg);
    const clipnovaLinks = allDetected.filter(d => d.source === SUPPORTED_SOURCES.CLIPNOVA);
    
    if (clipnovaLinks.length > 0) {
      const hasPhotoWithLink = !!msg.photo?.length;
      const isForwarded = !!(msg.forward_from_chat || msg.forward_from);

      // Download thumbnail from this message (if any)
      let overrideThumb = null;
      if (msg.photo?.length) {
        overrideThumb = await downloadTelegramPhoto(msg.photo);
      }

      // ── SINGLE link in message ────────────────────────────────────────────
      // Forward immediately with its own thumbnail (old clean behavior)
      if (clipnovaLinks.length === 1 && (hasPhotoWithLink || isForwarded)) {
        logger.info({ chatId }, 'MessageRouter: single photo+link → immediate process');
        const originalCaption = msg.caption || msg.text || null;
        await _handleClipNovaLink(ctx, session, clipnovaLinks[0].shortCode, overrideThumb, originalCaption);
        return true;
      }

      // ── MULTIPLE links in ONE message ────────────────────────────────────
      // Process all in parallel → send ONE combined response
      if (clipnovaLinks.length > 1 && (hasPhotoWithLink || isForwarded)) {
        logger.info({ chatId, count: clipnovaLinks.length }, 'MessageRouter: multi-link single message → combined response');
        
        // Process all links in parallel
        const originalCaption = msg.caption || msg.text || null;
        const results = await Promise.allSettled(
          clipnovaLinks.map(detected =>
            duplicateClipNovaVideo({
              userId: session.userId,
              shortCode: detected.shortCode,
              pendingThumb: overrideThumb,
              originalCaption
            })
          )
        );

        // Collect successful share URLs
        const shareUrls = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            shareUrls.push(result.value.shareUrl);
          }
        }

        if (shareUrls.length === 0) {
          await ctx.reply('❌ All links failed. Please try again.').catch(() => {});
          return true;
        }

        // Build combined message using first result's formatted message as template
        const firstSuccess = results.find(r => r.status === 'fulfilled');
        const firstMsg = firstSuccess?.value?.message || '';
        
        // Extract header/footer from first message, replace single URL with all URLs
        let combinedMessage;
        if (firstMsg) {
          const firstUrl = firstSuccess.value.shareUrl;
          combinedMessage = firstMsg.replace(firstUrl, shareUrls.join('\n'));
        } else {
          combinedMessage = shareUrls.join('\n');
        }

        // Send ONE message with thumbnail + all links
        const thumbUrl = firstSuccess?.value?.video?.thumbnailUrl || overrideThumb?.buffer
          ? null  // overrideThumb is buffer not URL, thumbnail from video record
          : process.env.DEFAULT_THUMBNAIL_URL || null;
        
        const videoThumbUrl = firstSuccess?.value?.video?.thumbnailUrl || process.env.DEFAULT_THUMBNAIL_URL || null;

        if (videoThumbUrl) {
          await ctx.telegram.sendPhoto(chatId, videoThumbUrl, {
            caption: combinedMessage,
            disable_web_page_preview: true
          }).catch(() =>
            ctx.telegram.sendMessage(chatId, combinedMessage, { disable_web_page_preview: true }).catch(() => {})
          );
        } else {
          await ctx.telegram.sendMessage(chatId, combinedMessage, { disable_web_page_preview: true }).catch(() => {});
        }

        return true;
      }

      // ── Plain text with link(s) only (no photo, not forwarded) ───────────
      // Batch queue with shared pending thumbnail
      logger.info({ chatId, count: clipnovaLinks.length }, 'MessageRouter: text link(s) → batch queue');
      const pendingThumb = consumePending(chatId);
      
      clipnovaLinks.forEach(detected => {
        enqueue(ctx, String(chatId), `Link ${detected.shortCode}`, async () => {
          const { video, shareUrl, message, wasAlreadyOwned } = await duplicateClipNovaVideo({
            userId: session.userId,
            shortCode: detected.shortCode,
            pendingThumb: pendingThumb ? { buffer: pendingThumb.buffer, mimeType: pendingThumb.mimeType } : null
          });
          return { 
            title: video.title, 
            shareUrl, 
            message, 
            thumbnailUrl: video.thumbnailUrl || null,
            skipped: wasAlreadyOwned 
          };
        });
      });
      
      return true;
    }

    // External link (TeraBox, Dailymotion, etc.)
    // TeraBox: process even if photo is present (photo = thumbnail from channel post, not our thumbnail)
    // Other sources: only if no photo/video/document in same message
    const detected = allDetected.length > 0 ? allDetected[0] : null;
    if (detected) {
      if (detected.source === SUPPORTED_SOURCES.TERABOX) {
        // TeraBox with photo — process link, ignore the photo (it's the channel's thumbnail)
        await _handleExternalLink(ctx, session, detected, ingestService, linkService);
        return true;
      }
      if (!msg.photo && !msg.video && !msg.document) {
        await _handleExternalLink(ctx, session, detected, ingestService, linkService);
        return true;
      }
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
    const replaced = setPending(ctx.chat.id, downloaded.buffer, downloaded.mimeType);
    logger.info({ chatId: ctx.chat.id, replaced }, 'MessageRouter: pending thumbnail cached');
    
    if (replaced) {
      await ctx.reply('🖼 New thumbnail set! Previous thumbnail cleared.\n\n💡 This thumbnail will apply to all videos you send (until cleared with /clearthumb or 5min expiry).');
    } else {
      await ctx.reply('🖼 Thumbnail set! Send videos — this thumbnail will apply to all of them.\n\n💡 Send a new photo to replace, or use /clearthumb to clear.');
    }
  } else {
    await ctx.reply('⚠️ Could not process thumbnail. Please try again.');
  }
};

/* ─── ClipNova link → duplicate pipeline ────────────────────────────────── */
const _handleClipNovaLink = async (ctx, session, shortCode, pendingThumb, originalCaption = null) => {
  const chatId = ctx.chat.id;

  if (!session.userId) return ctx.reply('🔐 Please /login first.');
  if (isRateLimited(chatId)) return ctx.reply('⚠️ Too many requests. Please wait a minute.');

  logger.info({ chatId, shortCode }, 'MessageRouter: duplicate pipeline triggered');

  try {
    const { video, shareUrl, message, wasAlreadyOwned } = await duplicateClipNovaVideo({
      userId: session.userId,
      shortCode,
      pendingThumb,
      originalCaption
    });

    const thumbUrl = video.thumbnailUrl || process.env.DEFAULT_THUMBNAIL_URL || null;

    // message from formatMessageWithHeaderFooter already contains the share link
    const finalCaption = message || (wasAlreadyOwned
      ? `🔁 You already have this video!\n\n🎬 ${video.title}${shareUrl ? `\n\n🔗 ${shareUrl}` : ''}`
      : `✅ Upload Complete\n\n🎬 ${video.title}${shareUrl ? `\n\n🔗 ${shareUrl}` : ''}`);

    // Send result directly — no ackMsg, supports multiple concurrent calls
    if (thumbUrl) {
      await ctx.telegram.sendPhoto(chatId, thumbUrl, {
        caption: finalCaption,
        disable_web_page_preview: true
      }).catch(() =>
        ctx.telegram.sendMessage(chatId, finalCaption, { disable_web_page_preview: true }).catch(() => {})
      );
    } else {
      await ctx.telegram.sendMessage(chatId, finalCaption, { disable_web_page_preview: true }).catch(() => {});
    }

  } catch (err) {
    logger.error({ err, shortCode }, 'MessageRouter: ClipNova duplication failed');
    const errMsg = err.message?.includes('not found') || err.message?.includes('not available')
      ? `❌ ${err.message}`
      : '❌ Upload failed. Please try again.';
    await ctx.reply(errMsg).catch(() => {});
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

  // Capture message_id BEFORE the async enqueue closure runs so it stays correct
  // even if ctx.message is mutated later by Telegraf internals.
  const originalMsgId = ctx.message.message_id;
  const originalChatId = chatId;

  // Is this a large file that needs the GramJS path?
  // Telegram omits file_size (or sends 0) for files >20MB — treat missing/zero
  // as "potentially large" and route to GramJS (safe default).
  // Only use the standard Bot API when size is explicitly known to be ≤ threshold.
  const isLargeFile = !fileSize || fileSize > LARGE_FILE_THRESHOLD;

  enqueue(ctx, String(chatId), title, async () => {
    // ── Duplicate check (both paths) ──────────────────────────────────────
    if (fileUniqueId) {
      const existing = await Video.findOne({
        creatorId: session.userId,
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

    // ── Large file (>19MB) → GramJS forward+download path ────────────────
    if (isLargeFile) {
      logger.info({
        userId: session.userId,
        fileSizeMB: fileSize ? (fileSize / 1024 / 1024).toFixed(1) : 'unknown (Telegram omitted)',
        originalMsgId,
      }, 'MessageRouter: routing to GramJS large-file pipeline');

      const { video, shareUrl, message } = await uploadLargeVideoViaGramJS({
        userId: session.userId,
        fileId, fileUniqueId, title, mimeType, fileSize,
        pendingThumb,
        telegrafCtx: ctx,
        originalChatId,
        originalMsgId,
      });
      return { title: video.title, shareUrl, message, thumbnailUrl: video.thumbnailUrl || null };
    }

    // ── Small file (≤19MB) → existing Bot API path (unchanged) ───────────
    const { video, shareUrl, message } = await uploadTelegramVideo({
      userId: session.userId,
      fileId, fileUniqueId, title, mimeType, fileSize,
      pendingThumb
    });

    return { title: video.title, shareUrl, message, thumbnailUrl: video.thumbnailUrl || null };
  });
};

/* ─── External link → ingest or TeraBox pipeline ────────────────────────── */
const _handleExternalLink = async (ctx, session, detected, ingestService, linkService) => {
  const chatId = ctx.chat.id;

  if (!session.userId) return ctx.reply('🔐 Please /login first.');
  if (isRateLimited(chatId)) return ctx.reply('⚠️ Too many requests. Please wait a minute.');

  // ── TeraBox: full download → R2 upload ───────────────────────────────────
  if (detected.source === SUPPORTED_SOURCES.TERABOX) {
    const ackMsg = await ctx.reply('⏳ Downloading from TeraBox...');
    try {
      const { VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');
      const { storageKey, publicUrl, filename, fileSize, mimeType, duration, thumbUrl } = await teraboxService.convertToR2(detected.url, session.userId);

      const video = await Video.create({
        creatorId: session.userId,
        title: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 200) || 'TeraBox Video',
        description: 'Imported from TeraBox',
        type: VIDEO_TYPE.DIRECT_UPLOAD,
        storageKey,
        fileName: filename,
        mimeType,
        fileSize,
        durationSeconds: duration || undefined,
        thumbnailUrl: thumbUrl || undefined,
        status: VIDEO_STATUS.READY,
        uploadSource: 'TELEGRAM_LINK',
        createdViaBot: true
      });

      const link = await linkService.createLink(session.userId, video._id.toString());
      const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

      const reply = `✅ TeraBox video uploaded!\n\n📹 ${video.title}\n🔗 ${shareUrl}`;
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, reply, { disable_web_page_preview: true })
        .catch(() => ctx.reply(reply, { disable_web_page_preview: true }).catch(() => {}));

    } catch (err) {
      logger.error({ err: err.message }, 'MessageRouter: TeraBox conversion failed');
      const errMsg = err.message.includes('quota') ? '❌ TeraBox daily quota exceeded. Try again tomorrow.' :
                     err.message.includes('rate limit') ? '❌ Too many requests. Please wait.' :
                     err.message.includes('no files') ? '❌ No downloadable files found in this TeraBox link.' :
                     err.message.includes('API key') ? '❌ TeraBox API not configured.' :
                     '❌ TeraBox download failed. Please try again.';
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, errMsg, {})
        .catch(() => ctx.reply(errMsg).catch(() => {}));
    }
    return;
  }

  // ── Other external links (Dailymotion, Streamtape, etc.) → EXTERNAL_REF ─
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
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, reply, { disable_web_page_preview: true })
        .catch(() => ctx.reply(reply, { disable_web_page_preview: true }).catch(() => {}));

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
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, dupMsg, { disable_web_page_preview: true })
        .catch(() => ctx.reply(dupMsg, { disable_web_page_preview: true }).catch(() => {}));

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
