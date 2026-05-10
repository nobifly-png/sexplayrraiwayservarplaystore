const { detectVideoLink, SUPPORTED_SOURCES } = require('./link.parser');
const { setPending, consumePending, hasPending } = require('./pendingThumb.cache');
const { uploadTelegramVideo, duplicateClipNovaVideo } = require('./upload.pipeline');
const { enqueue } = require('./bulk.queue');
const { isRateLimited } = require('./bot.ratelimit');
const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const logger = require('../../config/logger');
const telegramConfig = require('../../config/telegram');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clipnovawebistefronendvarsel-gyum.vercel.app';
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

/* ─── Download Telegram photo to buffer ────────────────────────────────── */
const downloadTelegramPhoto = async (ctx, photoArray) => {
  try {
    const https = require('https');
    // Pick highest resolution photo
    const photo = photoArray[photoArray.length - 1];
    const botToken = telegramConfig.botToken;

    const fileInfo = await new Promise((resolve, reject) => {
      https.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${photo.file_id}`, (res) => {
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

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;

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
    logger.warn({ err }, 'MessageRouter: failed to download photo');
    return null;
  }
};

/* ─── Route: Photo received ─────────────────────────────────────────────── */
const handlePhoto = async (ctx, session) => {
  if (!session.userId) return ctx.reply('🔐 Please /login first.');

  const photo = ctx.message.photo;
  if (!photo?.length) return;

  await ctx.reply('🖼 Thumbnail received! Now send your video or ClipNova link within 5 minutes.');

  const downloaded = await downloadTelegramPhoto(ctx, photo);
  if (downloaded) {
    setPending(ctx.chat.id, downloaded.buffer, downloaded.mimeType);
    logger.info({ chatId: ctx.chat.id }, 'MessageRouter: pending thumbnail cached');
  }
};

/* ─── Route: Video/Document file received ───────────────────────────────── */
const handleVideoFile = (ctx, session, fileInfo) => {
  const { fileId, fileUniqueId, title, mimeType, fileSize } = fileInfo;
  const chatId = ctx.chat.id;

  if (!session.userId) return ctx.reply('🔐 Please /login first.');
  if (isRateLimited(chatId)) return ctx.reply('⚠️ Too many uploads. Please wait a minute.');
  if (fileSize && fileSize > MAX_FILE_SIZE) return ctx.reply('❌ File too large. Maximum 2GB allowed.');

  const pendingThumb = consumePending(chatId);

  enqueue(ctx, String(chatId), title, async () => {
    // Duplicate check
    if (fileUniqueId) {
      const existing = await Video.findOne({
        creatorId: session.userId,
        telegramFileUniqueId: fileUniqueId,
        isDeleted: false
      });
      if (existing) {
        const existingLink = await Link.findOne({ videoId: existing._id, isActive: true }).sort({ createdAt: -1 });
        const shareUrl = existingLink ? `${FRONTEND_URL}/watch/${existingLink.shortCode}` : null;
        logger.info({ fileUniqueId }, 'MessageRouter: duplicate file skipped');
        return { skipped: true, title: existing.title, shareUrl, thumbnailUrl: existing.thumbnailUrl || null };
      }
    }

    const { video, shareUrl } = await uploadTelegramVideo({
      userId: session.userId,
      fileId, fileUniqueId, title, mimeType, fileSize,
      pendingThumb
    });

    return { title: video.title, shareUrl, thumbnailUrl: video.thumbnailUrl || null };
  });
};

/* ─── Route: ClipNova link received ────────────────────────────────────── */
const handleClipNovaLink = async (ctx, session, shortCode) => {
  const chatId = ctx.chat.id;

  if (!session.userId) return ctx.reply('🔐 Please /login first.');
  if (isRateLimited(chatId)) return ctx.reply('⚠️ Too many requests. Please wait a minute.');

  const pendingThumb = consumePending(chatId);
  const ackMsg = await ctx.reply('⏳ Processing ClipNova link...');

  try {
    const { video, shareUrl, wasAlreadyOwned } = await duplicateClipNovaVideo({
      userId: session.userId,
      shortCode,
      pendingThumb
    });

    const thumbUrl = video.thumbnailUrl || process.env.DEFAULT_THUMBNAIL_URL || null;
    const caption = wasAlreadyOwned
      ? `🔁 You already have this video!\n\n🎬 ${video.title}\n🔗 ${shareUrl}`
      : `✅ Upload Complete\n\n🎬 ${video.title}\n🔗 ${shareUrl}`;

    await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, caption, {})
      .catch(() => {});

    if (thumbUrl) {
      await ctx.telegram.sendPhoto(chatId, thumbUrl, { caption }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err, shortCode }, 'MessageRouter: ClipNova duplication failed');
    const errMsg = err.message?.includes('not found') || err.message?.includes('not available')
      ? `❌ ${err.message}`
      : '❌ Upload failed. Please try again.';
    await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, errMsg, {}).catch(() => {});
  }
};

/* ─── Route: External link (TeraBox, Dailymotion, etc.) ────────────────── */
const handleExternalLink = async (ctx, session, detected, ingestService, linkService) => {
  const chatId = ctx.chat.id;

  if (!session.userId) return ctx.reply('🔐 Please /login first.');
  if (isRateLimited(chatId)) return ctx.reply('⚠️ Too many requests. Please wait a minute.');

  const { INGEST_STATUS } = require('./ingestJob.model');
  const SOURCE_LABELS = {
    TERABOX: 'TeraBox', DAILYMOTION: 'Dailymotion',
    DIRECT_MP4: 'Direct Video', STREAMTAPE: 'Streamtape',
    MIXDROP: 'Mixdrop', DOODSTREAM: 'DoodStream'
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
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, reply, {}).catch(() => ctx.reply(reply));

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
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, dupMsg, {}).catch(() => ctx.reply(dupMsg));

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

module.exports = { handlePhoto, handleVideoFile, handleClipNovaLink, handleExternalLink };
