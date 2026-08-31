/**
 * telegram.bot2.js
 * Second Telegram bot — TeraBox → Zaxgram converter.
 * Token: TELEGRAM_BOT2_TOKEN (8938976671:AAEn8BfwyDkQaOPK44nL3-HN1BsecJUfm7A)
 *
 * Shares the same backend, database, and R2 storage as bot1.
 * Separate session store to avoid conflicts with bot1 sessions.
 * All features identical to bot1 (upload, duplicate, TeraBox, settings, etc.)
 */

const { Telegraf, Markup } = require('telegraf');
const logger = require('../../config/logger');

const authService = require('../auth/auth.service');
const videoService = require('../videos/video.service');
const linkService = require('../links/link.service');
const ingestService = require('./ingest.service');
const User = require('../users/user.model');

const { routeMessage } = require('./message.router');
const { detectVideoLink } = require('./link.parser');
const { INGEST_STATUS } = require('./ingestJob.model');

const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const { VIDEO_STATUS } = require('../../common/enums');

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.zaxgram.com').replace(/\/$/, '');
const BOT2_TOKEN = process.env.TELEGRAM_BOT2_TOKEN;

/* ─── No web preview helper ─────────────────────────────────────────────── */
const noPreview = (extra = {}) => ({ disable_web_page_preview: true, ...extra });

/* ─── Session Store (separate from bot1) ────────────────────────────────── */
const MAX_SESSIONS = 5000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions2 = new Map();

const evictStaleSessions = () => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions2) {
    if ((s.lastActivity || 0) < cutoff) sessions2.delete(id);
  }
};

const getSession = (chatId) => sessions2.get(String(chatId)) || {};
const setSession = (chatId, data) => {
  const key = String(chatId);
  if (sessions2.size >= MAX_SESSIONS) evictStaleSessions();
  sessions2.set(key, { ...getSession(chatId), ...data, lastActivity: Date.now() });
};
const clearSession = (chatId) => sessions2.delete(String(chatId));

/* ─── States ────────────────────────────────────────────────────────────── */
const STATES = {
  IDLE: 'IDLE',
  AWAIT_EMAIL: 'AWAIT_EMAIL',
  AWAIT_PASSWORD: 'AWAIT_PASSWORD',
  AWAIT_HEADER: 'AWAIT_HEADER',
  AWAIT_FOOTER: 'AWAIT_FOOTER'
};

/* ─── Bot2 Service ───────────────────────────────────────────────────────── */
class TelegramBot2Service {
  constructor() {
    this.bot = null;
    this._launching = false;
    this._launched = false;
    this._stopped = false;
    this._reconnectTimer = null;
  }

  get enabled() {
    return Boolean(BOT2_TOKEN);
  }

  async initialize() {
    if (!BOT2_TOKEN) {
      logger.info('Bot2: TELEGRAM_BOT2_TOKEN not set — skipping');
      return;
    }
    if (this._stopped) return;
    if (this._launching || this._launched) {
      logger.warn('Bot2: already launching — skipping duplicate init');
      return;
    }

    this._launching = true;
    logger.info('Bot2: initializing');

    try {
      this.bot = new Telegraf(BOT2_TOKEN);

      this.bot.catch((err, ctx) => {
        logger.error({
          errMsg: err.message,
          stack: err.stack,
          updateType: ctx?.updateType,
          chatId: ctx?.chat?.id
        }, 'Bot2: uncaught handler error');
        const userMsg = err.message?.includes('login') ? '🔐 Please /login first.' :
                        `❌ Error: ${err.message?.slice(0, 100) || 'Unknown error'}`;
        ctx?.reply(userMsg).catch(() => {});
      });

      this.bot.use(async (ctx, next) => {
        logger.info({
          bot: 'bot2',
          updateType: ctx.updateType,
          chatId: ctx.chat?.id,
        }, 'Bot2: raw update received');
        return next();
      });

      this._registerHandlers();
      await this._setBotMenuCommands();

      this.bot.launch({ dropPendingUpdates: true }).catch((err) => {
        logger.error({ errMsg: err.message }, 'Bot2: polling died — scheduling reconnect');
        this._launched = false;
        this._launching = false;
        const isLoggedOut = err.message?.includes('Logged out') || err.message?.includes('logged out');
        this._scheduleReconnect(isLoggedOut ? 10 * 60 * 1000 : 15000);
      });

      this._launched = true;
      this._launching = false;
      logger.info('Bot2: launched successfully');

    } catch (err) {
      this._launching = false;
      this._launched = false;
      logger.error({ errMsg: err.message }, 'Bot2: failed to initialize — scheduling reconnect');
      this._scheduleReconnect();
    }
  }

  async _setBotMenuCommands() {
    try {
      const commands = [
        { command: 'login',      description: '🔑 Login to your account' },
        { command: 'settings',   description: '⚙️ Output settings' },
        { command: 'help',       description: 'ℹ️ Show help and commands' },
        { command: 'videos',     description: '📹 List your videos' },
        { command: 'imports',    description: '📥 Recent import jobs' },
        { command: 'contact',    description: '📞 Contact Us' },
        { command: 'clearthumb', description: '🖼 Clear cached thumbnail' },
        { command: 'logout',     description: '🚪 Logout from account' }
      ];
      await this.bot.telegram.setMyCommands(commands, { scope: { type: 'all_private_chats' } });
      await this.bot.telegram.setMyCommands(commands);
      logger.info('Bot2: menu commands set');
    } catch (err) {
      logger.error({ errMsg: err.message }, 'Bot2: failed to set menu commands');
    }
  }

  _scheduleReconnect(delayMs = 15000) {
    if (this._stopped || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.initialize();
    }, delayMs);
  }

  async stop(signal = 'SHUTDOWN') {
    this._stopped = true;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.bot && this._launched) {
      try { await this.bot.stop(signal); } catch (_) {}
      this._launched = false;
      logger.info('Bot2: stopped');
    }
  }

  _registerHandlers() {
    const bot = this.bot;

    bot.start((ctx)                   => this._safe(ctx, () => this._onStart(ctx)));
    bot.command('help',               (ctx) => this._safe(ctx, () => this._onHelp(ctx)));
    bot.command('login',              (ctx) => this._safe(ctx, () => this._onLoginCmd(ctx)));
    bot.command('logout',             (ctx) => this._safe(ctx, () => this._onLogout(ctx)));
    bot.command('settings',           (ctx) => this._safe(ctx, () => this._onSettings(ctx)));
    bot.command('contact',            (ctx) => this._safe(ctx, () => this._onContact(ctx)));
    bot.command('videos',             (ctx) => this._safe(ctx, () => this._onVideos(ctx)));
    bot.command('imports',            (ctx) => this._safe(ctx, () => this._onImports(ctx)));
    bot.command('link',               (ctx) => this._safe(ctx, () => this._onLink(ctx)));
    bot.command('cancel',             (ctx) => this._safe(ctx, () => this._onCancel(ctx)));
    bot.command('clearthumb',         (ctx) => this._safe(ctx, () => this._onClearThumb(ctx)));

    bot.action('settings_menu',       (ctx) => this._safe(ctx, () => this._onSettingsMenu(ctx)));
    bot.action('set_header',          (ctx) => this._safe(ctx, () => this._onSetHeader(ctx)));
    bot.action('set_footer',          (ctx) => this._safe(ctx, () => this._onSetFooter(ctx)));
    bot.action('toggle_header',       (ctx) => this._safe(ctx, () => this._onToggleHeader(ctx)));
    bot.action('toggle_footer',       (ctx) => this._safe(ctx, () => this._onToggleFooter(ctx)));
    bot.action('toggle_clean_output', (ctx) => this._safe(ctx, () => this._onToggleCleanOutput(ctx)));

    bot.on('message', (ctx) => this._safe(ctx, () => this._onAnyMessage(ctx)));
  }

  _safe = async (ctx, fn) => {
    try {
      await fn();
    } catch (err) {
      logger.error({ errMsg: err.message, stack: err.stack, chatId: ctx?.chat?.id, bot: 'bot2' }, 'Bot2: handler threw');
      const userMsg = err.message?.includes('login') ? '🔐 Please /login first.' :
                      err.message?.includes('not found') ? `❌ ${err.message}` :
                      err.message?.includes('not available') ? `❌ ${err.message}` :
                      `❌ Error: ${err.message?.slice(0, 100) || 'Unknown error'}`;
      ctx?.reply(userMsg).catch(() => {});
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
      '💡 Tip: Send a photo BEFORE videos to set a custom thumbnail for all uploads!',
      { disable_web_page_preview: true, ...Markup.removeKeyboard() }
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
      '🚀 Upload Methods\n' +
      '• Forward any video file → auto upload to R2\n' +
      '• Forward a Zexgram post (photo+link) → duplicate instantly\n' +
      '• Send a Zexgram /watch/ link → duplicate to your account\n' +
      '• Send TeraBox links → download & convert to Zaxgram link\n' +
      '• Send a photo FIRST → sets thumbnail for ALL next uploads\n\n' +
      '🖼 Thumbnail\n' +
      '/clearthumb — Clear cached thumbnail\n\n' +
      '/cancel — Cancel current action',
      noPreview()
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

  /* ─── /clearthumb ─────────────────────────────────────────────────────── */
  async _onClearThumb(ctx) {
    const { clearPending } = require('./pendingThumb.cache');
    clearPending(ctx.chat.id);
    await ctx.reply('✅ Thumbnail cache cleared.');
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
      return ctx.reply('❌ Could not fetch videos. Please try again.');
    }

    if (!videos?.length) return ctx.reply('📭 No videos uploaded yet.');

    const lines = await Promise.all(videos.map(async (v, i) => {
      let watchLine = '';
      if (v.status === VIDEO_STATUS.READY) {
        const link = await Link.findOne({ videoId: v._id, isActive: true }).sort({ createdAt: -1 });
        if (link) watchLine = `\n🔗 ${FRONTEND_URL}/watch/${link.shortCode}`;
      }
      return `${i + 1}. ${v.title || '(untitled)'}\n📊 ${v.status}${watchLine}`;
    }));

    await ctx.reply(`🎬 Your Videos\n\n${lines.join('\n\n')}`, noPreview());
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

      const user = await User.findById(session.userId);
      let message;
      if (user.cleanOutput) {
        message = '';
        if (user.headerEnabled && user.telegramHeader) message += `${user.telegramHeader}\n\n`;
        message += shareUrl;
        if (user.footerEnabled && user.telegramFooter) message += `\n\n${user.telegramFooter}`;
      } else {
        message = '✅ Share Link Created!\n\n';
        if (user.headerEnabled && user.telegramHeader) message += `${user.telegramHeader}\n\n`;
        message += `🔗 ${shareUrl}`;
        if (user.footerEnabled && user.telegramFooter) message += `\n\n${user.telegramFooter}`;
      }

      await ctx.reply(message, noPreview());
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  }

  /* ─── /settings ──────────────────────────────────────────────────────── */
  async _onSettings(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');
    await this._showSettingsMenu(ctx, session.userId);
  }

  /* ─── /contact ───────────────────────────────────────────────────────── */
  async _onContact(ctx) {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('📢 New Updates', 'https://t.me/+bjnJaxlgdvxkM2Vl')],
      [Markup.button.url('💬 Telegram Support', 'https://t.me/zexgram_support')],
      [Markup.button.url('🌐 Visit Website', FRONTEND_URL)]
    ]);
    await ctx.reply(
      '📞 Contact Us\n\n' +
      '💬 Telegram Support: t.me/zexgram_support\n' +
      '🌐 Website: ' + FRONTEND_URL,
      noPreview(keyboard)
    );
  }

  /* ─── Settings menu ──────────────────────────────────────────────────── */
  async _showSettingsMenu(ctx, userId) {
    const user = await User.findById(userId);

    const headerStatus = user.headerEnabled ? '✅ Enabled' : '❌ Disabled';
    const footerStatus = user.footerEnabled ? '✅ Enabled' : '❌ Disabled';
    const cleanStatus  = user.cleanOutput   ? '✅ ON'      : '❌ OFF';

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(`📄 Header: ${headerStatus}`, 'toggle_header')],
      [Markup.button.callback(`📝 Footer: ${footerStatus}`, 'toggle_footer')],
      [
        Markup.button.callback('✏️ Set Header Text', 'set_header'),
        Markup.button.callback('✏️ Set Footer Text', 'set_footer')
      ],
      [Markup.button.callback(`✂️ Clean Output: ${cleanStatus}`, 'toggle_clean_output')]
    ]);

    const message =
      '⚙️ Bot Output Settings\n\n' +
      `📄 Header: ${headerStatus}\n` +
      `${user.telegramHeader || '(not set)'}\n\n` +
      `📝 Footer: ${footerStatus}\n` +
      `${user.telegramFooter || '(not set)'}\n\n` +
      `✂️ Clean Output: ${cleanStatus}\n` +
      (user.cleanOutput
        ? '  → Only header + link + footer sent\n\n'
        : '  → Full message with title + header + footer\n\n') +
      '💡 Tip: Enable Clean Output for just the raw link.';

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { disable_web_page_preview: true, ...keyboard });
    } else {
      await ctx.reply(message, noPreview(keyboard));
    }
  }

  async _onSettingsMenu(ctx) {
    await ctx.answerCbQuery();
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    await this._showSettingsMenu(ctx, session.userId);
  }

  async _onToggleHeader(ctx) {
    await ctx.answerCbQuery();
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    const user = await User.findById(session.userId);
    user.headerEnabled = !user.headerEnabled;
    await user.save();
    await this._showSettingsMenu(ctx, session.userId);
  }

  async _onToggleFooter(ctx) {
    await ctx.answerCbQuery();
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    const user = await User.findById(session.userId);
    user.footerEnabled = !user.footerEnabled;
    await user.save();
    await this._showSettingsMenu(ctx, session.userId);
  }

  async _onToggleCleanOutput(ctx) {
    await ctx.answerCbQuery();
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    const user = await User.findById(session.userId);
    user.cleanOutput = !user.cleanOutput;
    await user.save();
    await this._showSettingsMenu(ctx, session.userId);
  }

  async _onSetHeader(ctx) {
    await ctx.answerCbQuery('Enter header text...');
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    setSession(ctx.chat.id, { state: STATES.AWAIT_HEADER });
    await ctx.reply('✏️ Enter header text:\n\nSend /cancel to cancel.');
  }

  async _onSetFooter(ctx) {
    await ctx.answerCbQuery('Enter footer text...');
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    setSession(ctx.chat.id, { state: STATES.AWAIT_FOOTER });
    await ctx.reply('✏️ Enter footer text:\n\nSend /cancel to cancel.');
  }

  /* ─── All non-command messages ───────────────────────────────────────── */
  async _onAnyMessage(ctx) {
    const msg = ctx.message;
    if (!msg) return;

    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    const text = (msg.text || msg.caption || '').trim();

    // State machine
    if (session.state === STATES.AWAIT_EMAIL) {
      if (!text) return ctx.reply('Please enter your email:');
      setSession(chatId, { email: text, state: STATES.AWAIT_PASSWORD });
      return ctx.reply('🔑 Enter your password:');
    }
    if (session.state === STATES.AWAIT_PASSWORD) {
      if (!text) return ctx.reply('Please enter your password:');
      return this._processLogin(ctx, chatId, session.email, text);
    }
    if (session.state === STATES.AWAIT_HEADER) {
      if (!text) return ctx.reply('Please enter header text:');
      const user = await User.findById(session.userId);
      user.telegramHeader = text;
      await user.save();
      setSession(chatId, { state: STATES.IDLE });
      await ctx.reply('✅ Header updated!');
      return this._showSettingsMenu(ctx, session.userId);
    }
    if (session.state === STATES.AWAIT_FOOTER) {
      if (!text) return ctx.reply('Please enter footer text:');
      const user = await User.findById(session.userId);
      user.telegramFooter = text;
      await user.save();
      setSession(chatId, { state: STATES.IDLE });
      await ctx.reply('✅ Footer updated!');
      return this._showSettingsMenu(ctx, session.userId);
    }

    // Route all media + links
    const handled = await routeMessage(ctx, session, { ingestService, linkService });

    if (!handled && text && !msg.photo && !msg.video && !msg.document && !detectVideoLink(msg)) {
      await ctx.reply(
        "I didn't understand that.\n\n" +
        '📹 To upload a video:\n' +
        '• Forward any video file directly\n' +
        '• Forward a Zexgram post (photo + link) to duplicate it\n' +
        '• Send a Zexgram /watch/ link\n' +
        '• Send a TeraBox link → converts to Zaxgram link\n' +
        '• Send a photo FIRST to set a custom thumbnail\n\n' +
        'Use /help to see all commands.'
      );
    }
  }

  /* ─── Login processor ────────────────────────────────────────────────── */
  async _processLogin(ctx, chatId, email, password) {
    setSession(chatId, { state: STATES.IDLE, email: undefined });

    const result = await authService.login(
      email, password, 'telegram-bot2', `TelegramBot2/${chatId}`
    ).catch((err) => ({ error: err.message }));

    if (result.error) {
      return ctx.reply(`❌ Login failed: ${result.error}\n\nUse /login to try again.`);
    }

    setSession(chatId, { userId: result.user.id.toString() });
    await ctx.reply(
      `✅ Logged in as ${result.user.name}!\n\n` +
      "Now forward any video or TeraBox link — I'll convert it automatically!\n\n" +
      '💡 Tip: Send a photo first to set a custom thumbnail.'
    );
  }
}

module.exports = new TelegramBot2Service();
