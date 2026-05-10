const { Telegraf, Markup } = require('telegraf');
const telegramConfig = require('../../config/telegram');
const { appUrl } = require('../../config/env');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clipnovawebistefronendvarsel-gyum.vercel.app';
const logger = require('../../config/logger');

const authService = require('../auth/auth.service');
const videoService = require('../videos/video.service');
const linkService = require('../links/link.service');
const analyticsService = require('../analytics/analytics.service');
const walletService = require('../wallet/wallet.service');
const withdrawalService = require('../withdrawals/withdrawal.service');

const ingestService = require('./ingest.service');
const { uploadTelegramFileToR2 } = require('./video.upload.service');
const { enqueue } = require('./bulk.queue');
const { detectVideoLink, SUPPORTED_SOURCES } = require('./link.parser');
const { isRateLimited } = require('./bot.ratelimit');
const { INGEST_STATUS } = require('./ingestJob.model');
const { reshareLink } = require('./reshare.service');

const Video = require('../videos/video.model');
const { VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');

// ─── Session Store ────────────────────────────────────────────────────────────
const MAX_SESSIONS = 5000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

const evictStaleSessions = () => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if ((s.lastActivity || 0) < cutoff) sessions.delete(id);
  }
};

const getSession = (chatId) => sessions.get(String(chatId)) || {};
const setSession = (chatId, data) => {
  const key = String(chatId);
  if (sessions.size >= MAX_SESSIONS) evictStaleSessions();
  sessions.set(key, { ...getSession(chatId), ...data, lastActivity: Date.now() });
};
const clearSession = (chatId) => sessions.delete(String(chatId));

// ─── States ───────────────────────────────────────────────────────────────────
const STATES = {
  IDLE: 'IDLE',
  AWAIT_EMAIL: 'AWAIT_EMAIL',
  AWAIT_PASSWORD: 'AWAIT_PASSWORD',
  AWAIT_WITHDRAWAL_AMOUNT: 'AWAIT_WITHDRAWAL_AMOUNT',
  AWAIT_WITHDRAWAL_METHOD: 'AWAIT_WITHDRAWAL_METHOD'
};

const SOURCE_LABELS = {
  [SUPPORTED_SOURCES.TERABOX]: 'TeraBox',
  [SUPPORTED_SOURCES.DAILYMOTION]: 'Dailymotion',
  [SUPPORTED_SOURCES.DIRECT_MP4]: 'Direct Video',
  [SUPPORTED_SOURCES.STREAMTAPE]: 'Streamtape',
  [SUPPORTED_SOURCES.MIXDROP]: 'Mixdrop',
  [SUPPORTED_SOURCES.DOODSTREAM]: 'DoodStream'
};

// ─── Singleton Bot ────────────────────────────────────────────────────────────
class TelegramBotService {
  constructor() {
    this.bot = null;
    this.enabled = telegramConfig.enabled;
    this._launching = false;
    this._launched = false;
  }

  async initialize() {
    if (!this.enabled || !telegramConfig.botToken) {
      logger.info('Telegram bot disabled or token not set — skipping');
      return;
    }
    if (this._launching || this._launched) {
      logger.warn('Telegram bot already launching — skipping duplicate init');
      return;
    }
    this._launching = true;
    try {
      this.bot = new Telegraf(telegramConfig.botToken);
      this._registerHandlers();
      this.bot.launch().catch((err) => {
        logger.error({ errMsg: err.message }, 'Telegram polling error');
        this._launched = false;
        this._launching = false;
      });
      this._launched = true;
      logger.info('Telegram bot started');
    } catch (err) {
      logger.error({ err }, 'Telegram bot failed to initialize');
      this._launching = false;
    }
  }

  async stop(signal = 'SHUTDOWN') {
    if (this.bot && this._launched) {
      try { await this.bot.stop(signal); } catch (_) {}
      this._launched = false;
      logger.info('Telegram bot stopped');
    }
  }

  // ─── Register all handlers ─────────────────────────────────────────────────
  _registerHandlers() {
    const bot = this.bot;

    // Commands
    bot.start((ctx) => this._safe(ctx, () => this._onStart(ctx)));
    bot.command('help', (ctx) => this._safe(ctx, () => this._onHelp(ctx)));
    bot.command('login', (ctx) => this._safe(ctx, () => this._onLoginCmd(ctx)));
    bot.command('logout', (ctx) => this._safe(ctx, () => this._onLogout(ctx)));
    bot.command('videos', (ctx) => this._safe(ctx, () => this._onVideos(ctx)));
    bot.command('imports', (ctx) => this._safe(ctx, () => this._onImports(ctx)));
    bot.command('link', (ctx) => this._safe(ctx, () => this._onLink(ctx)));
    bot.command('stats', (ctx) => this._safe(ctx, () => this._onStats(ctx)));
    bot.command('wallet', (ctx) => this._safe(ctx, () => this._onWallet(ctx)));
    bot.command('withdraw', (ctx) => this._safe(ctx, () => this._onWithdrawCmd(ctx)));
    bot.command('cancel', (ctx) => this._safe(ctx, () => this._onCancel(ctx)));

    // ── Video file (Telegram native video) ──────────────────────────────────
    bot.on('video', (ctx) => this._safe(ctx, () => this._onVideoFile(ctx)));

    // ── Document (any file — mkv, avi, mp4, etc.) ───────────────────────────
    bot.on('document', (ctx) => this._safe(ctx, () => this._onDocumentFile(ctx)));

    // ── Text messages (links, state machine) ────────────────────────────────
    bot.on('message', (ctx) => this._safe(ctx, () => this._onMessage(ctx)));

    bot.catch((err, ctx) => {
      logger.error({ errMsg: err.message, chatId: ctx?.chat?.id }, 'Bot handler error');
      ctx?.reply('Something went wrong. Please try again.').catch(() => {});
    });
  }

  _safe = async (ctx, fn) => {
    try { await fn(); } catch (err) {
      logger.error({ err, chatId: ctx?.chat?.id }, 'Handler threw');
      ctx?.reply('An error occurred. Please try again.').catch(() => {});
    }
  };

  // ─── /start ───────────────────────────────────────────────────────────────
  async _onStart(ctx) {
    clearSession(ctx.chat.id);
    await ctx.reply(
      `👋 *Welcome to ClipNova Bot\\!*\n\n` +
      `Monetize your videos and track earnings\\.\n\n` +
      `📌 *Quick Start:*\n` +
      `1\\. Use /login to connect your account\n` +
      `2\\. Forward any video directly to this bot\n` +
      `3\\. Bot will upload to R2 and give you a share link\n` +
      `4\\. Share the link — earn on every view\\!\n\n` +
      `Use /help to see all commands\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  // ─── /help ────────────────────────────────────────────────────────────────
  async _onHelp(ctx) {
    await ctx.reply(
      `*ClipNova Bot — Commands*\n\n` +
      `🔐 *Account*\n` +
      `/login — Connect your account\n` +
      `/logout — Disconnect\n\n` +
      `📹 *Videos*\n` +
      `/videos — List your videos\n` +
      `/imports — Recent import jobs\n` +
      `/link <videoId> — Generate share link\n\n` +
      `📊 *Earnings*\n` +
      `/stats — Analytics overview\n` +
      `/wallet — Wallet balance\n` +
      `/withdraw — Request withdrawal\n\n` +
      `🚀 *Auto Import*\n` +
      `Forward any video file → Bot uploads to R2 automatically\\!\n` +
      `Send TeraBox/Dailymotion links → Bot imports them\\!\n` +
      `Bulk supported — forward 100 videos at once\\!\n\n` +
      `/cancel — Cancel current action`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  // ─── /cancel ──────────────────────────────────────────────────────────────
  async _onCancel(ctx) {
    const session = getSession(ctx.chat.id);
    if (session.state && session.state !== STATES.IDLE) {
      setSession(ctx.chat.id, { state: STATES.IDLE });
      await ctx.reply('✅ Action cancelled.', Markup.removeKeyboard());
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  }

  // ─── /login ───────────────────────────────────────────────────────────────
  async _onLoginCmd(ctx) {
    const session = getSession(ctx.chat.id);
    if (session.userId) return ctx.reply('Already logged in. Use /logout first.');
    setSession(ctx.chat.id, { state: STATES.AWAIT_EMAIL });
    await ctx.reply('📧 Enter your ClipNova email:');
  }

  // ─── /logout ──────────────────────────────────────────────────────────────
  async _onLogout(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('You are not logged in.');
    clearSession(ctx.chat.id);
    await ctx.reply('✅ Logged out successfully.');
  }

  // ─── /videos ──────────────────────────────────────────────────────────────
  async _onVideos(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('🔐 Please /login first.');

    let videos;
    try {
      videos = await videoService.getCreatorVideos(session.userId, { page: 1, limit: 5 });
    } catch (err) {
      logger.error({ err, userId: session.userId }, 'Bot: /videos fetch failed');
      return ctx.reply('❌ Could not fetch videos. Please try again.');
    }

    if (!videos || !videos.length) return ctx.reply('📭 No videos uploaded yet.');

    const Link = require('../links/link.model');
    const lines = await Promise.all(videos.map(async (v, i) => {
      let watchLine = '';
      if (v.status === VIDEO_STATUS.READY) {
        const link = await Link.findOne({ videoId: v._id, isActive: true }).sort({ createdAt: -1 });
        if (link) watchLine = `\n🔗 ${FRONTEND_URL}/watch/${link.shortCode}`;
      }
      return `${i + 1}. ${v.title}\n📊 ${v.status}${watchLine}`;
    }));

    await ctx.reply(`🎬 Your Videos\n\n${lines.join('\n\n')}`);
  }

  // ─── /imports ─────────────────────────────────────────────────────────────
  async _onImports(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const jobs = await ingestService.getCreatorJobs(session.userId, 10);
    if (!jobs.length) return ctx.reply('No imports yet. Forward a video to start!');

    const list = jobs.map((j, i) => {
      const icon = j.status === INGEST_STATUS.DONE ? '✅' :
                   j.status === INGEST_STATUS.FAILED ? '❌' :
                   j.status === INGEST_STATUS.DUPLICATE ? '🔁' : '⏳';
      return `${i + 1}. ${icon} ${this._esc(j.title || j.source)} — ${j.status}`;
    }).join('\n');

    await ctx.reply(`📋 *Recent Imports:*\n\n${list}`, { parse_mode: 'MarkdownV2' });
  }

  // ─── /link ────────────────────────────────────────────────────────────────
  async _onLink(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const parts = (ctx.message.text || '').trim().split(/\s+/);
    const videoId = parts[1];
    if (!videoId) return ctx.reply('Usage: /link <videoId>\n\nGet IDs from /videos');

    const link = await linkService.createLink(session.userId, videoId);
    const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

    await ctx.reply(
      `✅ *Share Link Created!*\n\n🔗 ${shareUrl}`,
      { parse_mode: 'Markdown' }
    );
  }

  // ─── /stats ───────────────────────────────────────────────────────────────
  async _onStats(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const stats = await analyticsService.getCreatorOverview(session.userId);
    await ctx.reply(
      `📊 *Your Analytics:*\n\n` +
      `👁 Total Views: ${stats.totalViews}\n` +
      `✅ Valid Views: ${stats.validViews}\n` +
      `❌ Rejected: ${stats.rejectedViews}\n` +
      `💰 Earnings: ₹${stats.totalEarnings.toFixed(2)}`,
      { parse_mode: 'Markdown' }
    );
  }

  // ─── /wallet ──────────────────────────────────────────────────────────────
  async _onWallet(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const wallet = await walletService.getWallet(session.userId);
    await ctx.reply(
      `💰 *Wallet:*\n\n` +
      `Available: ₹${wallet.availableBalance.toFixed(2)}\n` +
      `Pending: ₹${wallet.pendingBalance.toFixed(2)}\n` +
      `Total Earned: ₹${wallet.totalEarnings.toFixed(2)}\n` +
      `Withdrawn: ₹${wallet.lifetimeWithdrawn.toFixed(2)}`,
      { parse_mode: 'Markdown' }
    );
  }

  // ─── /withdraw ────────────────────────────────────────────────────────────
  async _onWithdrawCmd(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');
    setSession(ctx.chat.id, { state: STATES.AWAIT_WITHDRAWAL_AMOUNT });
    await ctx.reply('💸 Enter amount to withdraw (minimum ₹100):');
  }

  // ─── VIDEO FILE HANDLER ───────────────────────────────────────────────────
  async _onVideoFile(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('🔐 Please /login first to upload videos.');

    const msg = ctx.message;
    const video = msg.video;
    const caption = msg.caption || '';
    const title = caption.trim() || video.file_name || `Video ${new Date().toISOString().slice(0, 10)}`;

    logger.info({ chatId: ctx.chat.id, fileId: video.file_id, title }, 'Bot: video file received');
    this._enqueueUpload(ctx, session.userId, video.file_id, video.file_unique_id, title, video.mime_type || 'video/mp4', video.file_size);
  }

  // ─── DOCUMENT FILE HANDLER ────────────────────────────────────────────────
  async _onDocumentFile(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('🔐 Please /login first to upload videos.');

    const msg = ctx.message;
    const doc = msg.document;
    const caption = msg.caption || '';
    const title = caption.trim() || (doc.file_name ? doc.file_name.replace(/\.[^.]+$/, '') : '') || `Video ${new Date().toISOString().slice(0, 10)}`;

    logger.info({ chatId: ctx.chat.id, fileId: doc.file_id, title }, 'Bot: document file received');
    this._enqueueUpload(ctx, session.userId, doc.file_id, doc.file_unique_id, title, doc.mime_type || 'application/octet-stream', doc.file_size);
  }

  // ─── Enqueue upload job ───────────────────────────────────────────────────
  _enqueueUpload(ctx, userId, fileId, fileUniqueId, title, mimeType, fileSize) {
    const chatId = ctx.chat.id;
    const botToken = telegramConfig.botToken;

    enqueue(ctx, String(chatId), title, async () => {
      // 1. Duplicate check via file_unique_id
      if (fileUniqueId) {
        const existing = await Video.findOne({ creatorId: userId, telegramFileUniqueId: fileUniqueId, isDeleted: false });
        if (existing) {
          logger.info({ fileUniqueId, videoId: existing._id }, 'Bot: duplicate video skipped');
          // Fetch existing watch link
          const Link = require('../links/link.model');
          const existingLink = await Link.findOne({ videoId: existing._id, isActive: true }).sort({ createdAt: -1 });
          const shareUrl = existingLink ? `${FRONTEND_URL}/watch/${existingLink.shortCode}` : null;
          return { skipped: true, title: existing.title, shareUrl, thumbnailUrl: existing.thumbnailUrl || null };
        }
      }

      // 2. Upload Telegram file → R2
      const { storageKey, fileSize: uploadedSize, publicUrl } = await uploadTelegramFileToR2({
        botToken, fileId, creatorId: userId, fileName: title, mimeType
      });

      // 3. Create Video record
      const video = await Video.create({
        creatorId: userId,
        title: title.slice(0, 200),
        description: 'Uploaded via Telegram Bot',
        type: VIDEO_TYPE.DIRECT_UPLOAD,
        storageKey,
        fileName: title,
        mimeType,
        fileSize: uploadedSize || fileSize,
        status: VIDEO_STATUS.READY,
        telegramFileUniqueId: fileUniqueId || undefined
      });

      // 4. Generate share link
      const link = await linkService.createLink(userId, video._id.toString());
      const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

      logger.info({ videoId: video._id, shareUrl }, 'Bot: video uploaded and link created');
      return { title: video.title, shareUrl, thumbnailUrl: video.thumbnailUrl || null };
    });
  }

  // ─── TEXT MESSAGE HANDLER ─────────────────────────────────────────────────
  async _onMessage(ctx) {
    const msg = ctx.message;
    if (!msg) return;

    // Skip if already handled by video/document handlers
    if (msg.video || msg.document) return;

    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    const text = (msg.text || msg.caption || '').trim();

    // ── State machine ────────────────────────────────────────────────────────
    if (session.state === STATES.AWAIT_EMAIL) {
      if (!text) return ctx.reply('Please enter your email:');
      setSession(chatId, { email: text, state: STATES.AWAIT_PASSWORD });
      return ctx.reply('🔑 Enter your password:');
    }

    if (session.state === STATES.AWAIT_PASSWORD) {
      if (!text) return ctx.reply('Please enter your password:');
      return this._processLogin(ctx, chatId, session.email, text);
    }

    if (session.state === STATES.AWAIT_WITHDRAWAL_AMOUNT) {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) return ctx.reply('Invalid amount. Enter a valid number:');
      setSession(chatId, { pendingWithdrawalAmount: amount, state: STATES.AWAIT_WITHDRAWAL_METHOD });
      return ctx.reply('💳 Choose payment method:', Markup.keyboard([['UPI', 'BANK_TRANSFER']]).oneTime().resize());
    }

    if (session.state === STATES.AWAIT_WITHDRAWAL_METHOD) {
      return this._processWithdrawal(ctx, chatId, session, text);
    }

    // ── Link detection ───────────────────────────────────────────────────────
    const detected = detectVideoLink(msg);
    if (detected) {
      return this._handleLinkIngest(ctx, chatId, session, detected);
    }

    // ── No match ─────────────────────────────────────────────────────────────
    if (text) {
      await ctx.reply(
        `I didn't understand that.\n\n` +
        `📹 *To import a video:*\n` +
        `• Forward any video file directly\n` +
        `• Send a TeraBox / Dailymotion link\n\n` +
        `Use /help to see all commands.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // ─── Link ingest (ClipNova reshare + TeraBox, Dailymotion, etc.) ──────────
  async _handleLinkIngest(ctx, chatId, session, detected) {
    if (!session.userId) {
      return ctx.reply(
        `🔐 Please /login first.\n\nLink detected: \`${detected.url}\``,
        { parse_mode: 'Markdown' }
      );
    }

    if (isRateLimited(chatId)) {
      return ctx.reply('⚠️ Too many requests. Wait a minute.');
    }

    // ── ClipNova own link — reshare flow ─────────────────────────────────────
    if (detected.source === SUPPORTED_SOURCES.CLIPNOVA) {
      return this._handleReshare(ctx, chatId, session, detected.shortCode);
    }

    // ── External link — ingest flow ──────────────────────────────────────────
    const sourceLabel = SOURCE_LABELS[detected.source] || detected.source;
    const ackMsg = await ctx.reply(`⏳ Processing your ${sourceLabel} link...`);

    const result = await ingestService.ingest(
      session.userId, detected.url, detected.source,
      { chatId, messageId: ctx.message.message_id }
    );

    const editOpts = { parse_mode: 'Markdown' };

    if (result.status === INGEST_STATUS.DONE) {
      const shareLink = await linkService.createLink(session.userId, result.video._id.toString()).catch(() => null);
      const shareUrl = shareLink ? `${FRONTEND_URL}/watch/${shareLink.shortCode}` : null;

      const reply =
        `✅ *Imported!*\n\n` +
        `📹 ${this._esc(result.video.title)}\n` +
        (shareUrl ? `🔗 \`${shareUrl}\`` : '');

      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, reply, editOpts)
        .catch(() => ctx.reply(reply, editOpts));

    } else if (result.status === INGEST_STATUS.DUPLICATE) {
      // Fetch existing video's watch link
      const existingVideo = result.job?.videoId ? await Video.findById(result.job.videoId).catch(() => null) : null;
      let dupMsg = '✅ Already Imported\n\n🔗 Watch:\n';
      if (existingVideo) {
        const Link = require('../links/link.model');
        const existingLink = await Link.findOne({ videoId: existingVideo._id, isActive: true }).sort({ createdAt: -1 });
        dupMsg += existingLink ? `${FRONTEND_URL}/watch/${existingLink.shortCode}` : '(link not found — use /videos)';
      } else {
        dupMsg = '✅ Already Imported\n\nUse /videos to find your link.';
      }
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, dupMsg, {})
        .catch(() => ctx.reply(dupMsg));

    } else {
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined,
        `❌ Import failed: ${result.error || 'Unknown error'}`, {})
        .catch(() => {});
    }
  }

  // ─── ClipNova reshare handler ─────────────────────────────────────────────
  async _handleReshare(ctx, chatId, session, shortCode) {
    const ackMsg = await ctx.reply('⏳ Generating your personal share link...');

    const result = await reshareLink(shortCode, session.userId)
      .catch((err) => ({ error: err.message }));

    if (result.error) {
      await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined,
        `❌ Failed: ${result.error}`, {})
        .catch(() => ctx.reply(`❌ Failed: ${result.error}`));
      return;
    }

    const { link, video, isNew } = result;
    const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

    const reply =
      `${isNew ? '✅ *Your Personal Link Created!*' : '🔁 *You already have a link for this video:*'}\n\n` +
      `📹 *${this._esc(video.title)}*\n` +
      `🔗 \`${shareUrl}\`\n\n` +
      `Share this link and earn on every view! 💰`;

    await ctx.telegram.editMessageText(chatId, ackMsg.message_id, undefined, reply,
      { parse_mode: 'Markdown' })
      .catch(() => ctx.reply(reply, { parse_mode: 'Markdown' }));
  }

  // ─── Login processor ──────────────────────────────────────────────────────
  async _processLogin(ctx, chatId, email, password) {
    setSession(chatId, { state: STATES.IDLE, email: undefined });

    const result = await authService.login(
      email, password, 'telegram-bot', `TelegramBot/${chatId}`
    ).catch((err) => ({ error: err.message }));

    if (result.error) {
      return ctx.reply(`❌ Login failed: ${result.error}\n\nUse /login to try again.`);
    }

    setSession(chatId, { userId: result.user.id.toString() });
    await ctx.reply(
      `✅ *Logged in as ${result.user.name}!*\n\n` +
      `Now forward any video — I'll upload it to R2 and give you a share link automatically!`,
      { parse_mode: 'Markdown' }
    );
  }

  // ─── Withdrawal processor ─────────────────────────────────────────────────
  async _processWithdrawal(ctx, chatId, session, method) {
    const normalizedMethod = method.toUpperCase().replace(/\s+/g, '_');
    if (!['UPI', 'BANK_TRANSFER'].includes(normalizedMethod)) {
      return ctx.reply('Choose UPI or BANK_TRANSFER:', Markup.keyboard([['UPI', 'BANK_TRANSFER']]).oneTime().resize());
    }

    setSession(chatId, { state: STATES.IDLE });

    const result = await withdrawalService.createWithdrawal(
      session.userId, session.pendingWithdrawalAmount, { type: normalizedMethod }
    ).catch((err) => ({ error: err.message }));

    if (result.error) {
      return ctx.reply(`❌ Failed: ${result.error}`, Markup.removeKeyboard());
    }

    await ctx.reply(
      `✅ *Withdrawal Requested!*\n\nAmount: ₹${result.amount}\nMethod: ${normalizedMethod}\nStatus: PENDING`,
      { parse_mode: 'Markdown', ...Markup.removeKeyboard() }
    );
  }

  // ─── Escape MarkdownV2 ────────────────────────────────────────────────────
  _esc(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
  }
}

module.exports = new TelegramBotService();
