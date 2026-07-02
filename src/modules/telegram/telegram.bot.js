const { Telegraf, Markup } = require('telegraf');
const telegramConfig = require('../../config/telegram');
const logger = require('../../config/logger');

const authService = require('../auth/auth.service');
const videoService = require('../videos/video.service');
const linkService = require('../links/link.service');
const analyticsService = require('../analytics/analytics.service');
const walletService = require('../wallet/wallet.service');
const withdrawalService = require('../withdrawals/withdrawal.service');
const ingestService = require('./ingest.service');

const { routeMessage } = require('./message.router');
const { detectVideoLink } = require('./link.parser');
const { INGEST_STATUS } = require('./ingestJob.model');

const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const { VIDEO_STATUS } = require('../../common/enums');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clipnovawebistefronendvarsel-gyum.vercel.app';

/* ─── Session Store ─────────────────────────────────────────────────────── */
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

/* ─── States ────────────────────────────────────────────────────────────── */
const STATES = {
  IDLE: 'IDLE',
  AWAIT_EMAIL: 'AWAIT_EMAIL',
  AWAIT_PASSWORD: 'AWAIT_PASSWORD',
  AWAIT_WITHDRAWAL_AMOUNT: 'AWAIT_WITHDRAWAL_AMOUNT',
  AWAIT_WITHDRAWAL_METHOD: 'AWAIT_WITHDRAWAL_METHOD'
};

/* ─── Bot Service ───────────────────────────────────────────────────────── */
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
    logger.info('Telegram bot initializing');

    try {
      this.bot = new Telegraf(telegramConfig.botToken);

      // ── Global error handler — MUST be registered before launch ──────────
      // Without this, any handler error silently kills polling.
      this.bot.catch((err, ctx) => {
        logger.error({
          errMsg: err.message,
          stack: err.stack,
          updateType: ctx?.updateType,
          chatId: ctx?.chat?.id
        }, 'Telegram bot uncaught handler error');
        ctx?.reply('Something went wrong. Please try again.').catch(() => {});
      });

      // ── Raw update logger — confirms updates are reaching the bot ─────────
      this.bot.use(async (ctx, next) => {
        logger.info({
          updateType: ctx.updateType,
          chatId: ctx.chat?.id,
          messageKeys: Object.keys(ctx.message || {})
        }, 'Telegram raw update received');
        return next();
      });

      this._registerHandlers();

      // ── CRITICAL FIX: bot.launch() in polling mode NEVER resolves ─────────
      // Do NOT await it — it blocks forever. Use .catch() for error handling.
      this.bot.launch({ dropPendingUpdates: true }).catch((err) => {
        logger.error({ errMsg: err.message }, 'Telegram bot launch error');
        this._launched = false;
        this._launching = false;
      });

      // Mark as launched immediately after calling launch()
      this._launched = true;
      this._launching = false;
      logger.info('Telegram bot launched successfully');

    } catch (err) {
      this._launching = false;
      this._launched = false;
      logger.error({ errMsg: err.message, stack: err.stack }, 'Telegram bot failed to initialize');
    }
  }

  async stop(signal = 'SHUTDOWN') {
    if (this.bot && this._launched) {
      try { await this.bot.stop(signal); } catch (_) {}
      this._launched = false;
      logger.info('Telegram bot stopped');
    }
  }

  _registerHandlers() {
    const bot = this.bot;

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

    // Single entry point for ALL non-command messages
    bot.on('message', (ctx) => this._safe(ctx, () => this._onAnyMessage(ctx)));
  }

  _safe = async (ctx, fn) => {
    try {
      await fn();
    } catch (err) {
      logger.error({ errMsg: err.message, stack: err.stack, chatId: ctx?.chat?.id }, 'Handler threw');
      ctx?.reply('An error occurred. Please try again.').catch(() => {});
    }
  };

  /* ─── /start ──────────────────────────────────────────────────────────── */
  async _onStart(ctx) {
    clearSession(ctx.chat.id);
    await ctx.reply(
      '👋 Welcome to Zexgram Bot!\n\n' +
      'Monetize your videos and track earnings.\n\n' +
      '📌 Quick Start:\n' +
      '1. Use /login to connect your account\n' +
      '2. Forward any video directly to this bot\n' +
      '3. Bot uploads to R2 and gives you a share link\n' +
      '4. Share the link — earn on every view!\n\n' +
      '💡 Tip: Send a photo BEFORE a video to set a custom thumbnail!\n\n' +
      'Use /help to see all commands.'
    );
  }

  /* ─── /help ───────────────────────────────────────────────────────────── */
  async _onHelp(ctx) {
    await ctx.reply(
      'Zexgram Bot — Commands\n\n' +
      '🔐 Account\n' +
      '/login — Connect your account\n' +
      '/logout — Disconnect\n\n' +
      '📹 Videos\n' +
      '/videos — List your videos\n' +
      '/imports — Recent import jobs\n' +
      '/link <videoId> — Generate share link\n\n' +
      '📊 Earnings\n' +
      '/stats — Analytics overview\n' +
      '/wallet — Wallet balance\n' +
      '/withdraw — Request withdrawal\n\n' +
      '🚀 Upload Methods\n' +
      '• Forward any video file → auto upload to R2\n' +
      '• Forward a Zexgram post (photo+link) → duplicate instantly\n' +
      '• Send a Zexgram /watch/ link → duplicate to your account\n' +
      '• Send TeraBox/Dailymotion links → import as external ref\n' +
      '• Send a photo FIRST → sets thumbnail for next upload\n\n' +
      '/cancel — Cancel current action'
    );
  }

  /* ─── /cancel ─────────────────────────────────────────────────────────── */
  async _onCancel(ctx) {
    const session = getSession(ctx.chat.id);
    if (session.state && session.state !== STATES.IDLE) {
      setSession(ctx.chat.id, { state: STATES.IDLE });
      await ctx.reply('✅ Action cancelled.', Markup.removeKeyboard());
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  }

  /* ─── /login ──────────────────────────────────────────────────────────── */
  async _onLoginCmd(ctx) {
    const session = getSession(ctx.chat.id);
    if (session.userId) return ctx.reply('Already logged in. Use /logout first.');
    setSession(ctx.chat.id, { state: STATES.AWAIT_EMAIL });
    await ctx.reply('📧 Enter your Zexgram email:');
  }

  /* ─── /logout ─────────────────────────────────────────────────────────── */
  async _onLogout(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('You are not logged in.');
    clearSession(ctx.chat.id);
    await ctx.reply('✅ Logged out successfully.');
  }

  /* ─── /videos ─────────────────────────────────────────────────────────── */
  async _onVideos(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('🔐 Please /login first.');

    let videos;
    try {
      videos = await videoService.getCreatorVideos(session.userId, { page: 1, limit: 5 });
    } catch (err) {
      logger.error({ err }, 'Bot: /videos fetch failed');
      return ctx.reply('❌ Could not fetch videos. Please try again.');
    }

    if (!videos?.length) return ctx.reply('📭 No videos uploaded yet.');

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

  /* ─── /imports ────────────────────────────────────────────────────────── */
  async _onImports(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const jobs = await ingestService.getCreatorJobs(session.userId, 10);
    if (!jobs.length) return ctx.reply('No imports yet. Forward a video to start!');

    const list = jobs.map((j, i) => {
      const icon = j.status === INGEST_STATUS.DONE ? '✅' :
                   j.status === INGEST_STATUS.FAILED ? '❌' :
                   j.status === INGEST_STATUS.DUPLICATE ? '🔁' : '⏳';
      return `${i + 1}. ${icon} ${j.title || j.source} — ${j.status}`;
    }).join('\n');

    await ctx.reply(`📋 Recent Imports:\n\n${list}`);
  }

  /* ─── /link ───────────────────────────────────────────────────────────── */
  async _onLink(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const parts = (ctx.message.text || '').trim().split(/\s+/);
    const videoId = parts[1];
    if (!videoId) return ctx.reply('Usage: /link <videoId>\n\nGet IDs from /videos');

    try {
      const link = await linkService.createLink(session.userId, videoId);
      const shareUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;
      await ctx.reply(`✅ Share Link Created!\n\n🔗 ${shareUrl}`);
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  }

  /* ─── /stats ──────────────────────────────────────────────────────────── */
  async _onStats(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const stats = await analyticsService.getCreatorOverview(session.userId);
    await ctx.reply(
      '📊 Your Analytics:\n\n' +
      `👁 Total Views: ${stats.totalViews}\n` +
      `✅ Valid Views: ${stats.validViews}\n` +
      `❌ Rejected: ${stats.rejectedViews}\n` +
      `💰 Earnings: ₹${stats.totalEarnings.toFixed(2)}`
    );
  }

  /* ─── /wallet ─────────────────────────────────────────────────────────── */
  async _onWallet(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    const wallet = await walletService.getWallet(session.userId);
    await ctx.reply(
      '💰 Wallet:\n\n' +
      `Available: ₹${wallet.availableBalance.toFixed(2)}\n` +
      `Pending: ₹${wallet.pendingBalance.toFixed(2)}\n` +
      `Total Earned: ₹${wallet.totalEarnings.toFixed(2)}\n` +
      `Withdrawn: ₹${wallet.lifetimeWithdrawn.toFixed(2)}`
    );
  }

  /* ─── /withdraw ───────────────────────────────────────────────────────── */
  async _onWithdrawCmd(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');
    setSession(ctx.chat.id, { state: STATES.AWAIT_WITHDRAWAL_AMOUNT });
    await ctx.reply('💸 Enter amount to withdraw (minimum ₹100):');
  }

  /* ─── All non-command messages ────────────────────────────────────────── */
  async _onAnyMessage(ctx) {
    const msg = ctx.message;
    if (!msg) return;

    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    const text = (msg.text || msg.caption || '').trim();

    // State machine first — login/withdrawal flow
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

    // Delegate to routeMessage — handles all media + links with correct priority
    const handled = await routeMessage(ctx, session, { ingestService, linkService });

    // Unknown plain text — no link, no media, not handled by routeMessage
    if (!handled && text && !msg.photo && !msg.video && !msg.document && !detectVideoLink(msg)) {
      await ctx.reply(
        "I didn't understand that.\n\n" +
        '📹 To upload a video:\n' +
        '• Forward any video file directly\n' +
        '• Forward a Zexgram post (photo + link) to duplicate it\n' +
        '• Send a Zexgram /watch/ link\n' +
        '• Send a TeraBox / Dailymotion link\n' +
        '• Send a photo FIRST to set a custom thumbnail\n\n' +
        'Use /help to see all commands.'
      );
    }
  }

  /* ─── Login processor ─────────────────────────────────────────────────── */
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
      `✅ Logged in as ${result.user.name}!\n\n` +
      "Now forward any video — I'll upload it to R2 and give you a share link automatically!\n\n" +
      '💡 Tip: Send a photo first to set a custom thumbnail.'
    );
  }

  /* ─── Withdrawal processor ────────────────────────────────────────────── */
  async _processWithdrawal(ctx, chatId, session, method) {
    const normalized = method.toUpperCase().replace(/\s+/g, '_');
    if (!['UPI', 'BANK_TRANSFER'].includes(normalized)) {
      return ctx.reply('Choose UPI or BANK_TRANSFER:', Markup.keyboard([['UPI', 'BANK_TRANSFER']]).oneTime().resize());
    }

    setSession(chatId, { state: STATES.IDLE });

    const result = await withdrawalService.createWithdrawal(
      session.userId, session.pendingWithdrawalAmount, { type: normalized }
    ).catch((err) => ({ error: err.message }));

    if (result.error) {
      return ctx.reply(`❌ Failed: ${result.error}`, Markup.removeKeyboard());
    }

    await ctx.reply(
      `✅ Withdrawal Requested!\n\nAmount: ₹${result.amount}\nMethod: ${normalized}\nStatus: PENDING`,
      Markup.removeKeyboard()
    );
  }
}

module.exports = new TelegramBotService();
