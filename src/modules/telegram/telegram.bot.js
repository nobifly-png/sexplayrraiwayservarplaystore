const { Telegraf, Markup } = require('telegraf');
const telegramConfig = require('../../config/telegram');
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

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.zaxgram.com';

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
  AWAIT_HEADER: 'AWAIT_HEADER',
  AWAIT_FOOTER: 'AWAIT_FOOTER'
};

/* ─── Bot Service ───────────────────────────────────────────────────────── */
class TelegramBotService {
  constructor() {
    this.bot = null;
    this.enabled = telegramConfig.enabled;
    this._launching = false;
    this._launched = false;
    this._stopped = false;
    this._reconnectTimer = null;
  }

  async initialize() {
    if (!this.enabled || !telegramConfig.botToken) {
      logger.info('Telegram bot disabled or token not set — skipping');
      return;
    }
    if (this._stopped) return;
    if (this._launching || this._launched) {
      logger.warn('Telegram bot already launching — skipping duplicate init');
      return;
    }

    this._launching = true;
    logger.info('Telegram bot initializing');

    try {
      // Configure bot options for Local Bot API (if enabled)
      const botOptions = {};
      if (telegramConfig.useLocalApi && telegramConfig.localApiUrl) {
        botOptions.telegram = {
          apiRoot: telegramConfig.localApiUrl
        };
        logger.info({ 
          useLocalApi: true, 
          apiRoot: telegramConfig.localApiUrl 
        }, 'Using Local Bot API server for large file support (up to 2GB)');
      } else {
        logger.info('Using standard Telegram Bot API (files limited to 20MB)');
      }

      // Always create a fresh Telegraf instance on reconnect
      this.bot = new Telegraf(telegramConfig.botToken, botOptions);

      this.bot.catch((err, ctx) => {
        logger.error({
          errMsg: err.message,
          stack: err.stack,
          updateType: ctx?.updateType,
          chatId: ctx?.chat?.id
        }, 'Telegram bot uncaught handler error');
        ctx?.reply('Something went wrong. Please try again.').catch(() => {});
      });

      this.bot.use(async (ctx, next) => {
        logger.info({
          updateType: ctx.updateType,
          chatId: ctx.chat?.id,
          messageKeys: Object.keys(ctx.message || {})
        }, 'Telegram raw update received');
        return next();
      });

      this._registerHandlers();

      // Set bot menu commands (persistent menu buttons)
      await this._setBotMenuCommands();

      this.bot.launch({ dropPendingUpdates: true }).catch((err) => {
        logger.error({ errMsg: err.message }, 'Telegram bot polling died — scheduling reconnect');
        this._launched = false;
        this._launching = false;
        this._scheduleReconnect();
      });

      this._launched = true;
      this._launching = false;
      logger.info('Telegram bot launched successfully');

    } catch (err) {
      this._launching = false;
      this._launched = false;
      logger.error({ errMsg: err.message, stack: err.stack }, 'Telegram bot failed to initialize — scheduling reconnect');
      this._scheduleReconnect();
    }
  }

  async _setBotMenuCommands() {
    try {
      // Set menu commands that appear in bot menu (hamburger icon)
      await this.bot.telegram.setMyCommands([
        { command: 'login', description: '🔑 Login to your account' },
        { command: 'settings', description: '⚙️ Header & Footer settings' },
        { command: 'help', description: 'ℹ️ Show help and commands' },
        { command: 'videos', description: '📹 List your videos' },
        { command: 'imports', description: '📥 Recent import jobs' },
        { command: 'contact', description: '📞 Contact Us' },
        { command: 'logout', description: '🚪 Logout from account' }
      ]);
      logger.info('Bot menu commands set successfully');
    } catch (err) {
      logger.error({ errMsg: err.message }, 'Failed to set bot menu commands');
    }
  }

  _scheduleReconnect(delayMs = 10000) {
    if (this._stopped || this._reconnectTimer) return;
    logger.info({ delayMs }, 'Telegram bot: reconnect scheduled');
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
      logger.info('Telegram bot stopped');
    }
  }

  _registerHandlers() {
    const bot = this.bot;

    bot.start((ctx) => this._safe(ctx, () => this._onStart(ctx)));
    bot.command('help', (ctx) => this._safe(ctx, () => this._onHelp(ctx)));
    bot.command('login', (ctx) => this._safe(ctx, () => this._onLoginCmd(ctx)));
    bot.command('logout', (ctx) => this._safe(ctx, () => this._onLogout(ctx)));
    bot.command('settings', (ctx) => this._safe(ctx, () => this._onSettings(ctx)));
    bot.command('contact', (ctx) => this._safe(ctx, () => this._onContact(ctx)));
    bot.command('videos', (ctx) => this._safe(ctx, () => this._onVideos(ctx)));
    bot.command('imports', (ctx) => this._safe(ctx, () => this._onImports(ctx)));
    bot.command('link', (ctx) => this._safe(ctx, () => this._onLink(ctx)));
    bot.command('cancel', (ctx) => this._safe(ctx, () => this._onCancel(ctx)));

    // Inline button callbacks for settings
    bot.action('settings_menu', (ctx) => this._safe(ctx, () => this._onSettingsMenu(ctx)));
    bot.action('set_header', (ctx) => this._safe(ctx, () => this._onSetHeader(ctx)));
    bot.action('set_footer', (ctx) => this._safe(ctx, () => this._onSetFooter(ctx)));
    bot.action('toggle_header', (ctx) => this._safe(ctx, () => this._onToggleHeader(ctx)));
    bot.action('toggle_footer', (ctx) => this._safe(ctx, () => this._onToggleFooter(ctx)));

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
      '1. Click menu button (☰) below and select "Login"\n' +
      '2. Forward any video directly to this bot\n' +
      '3. Bot uploads to R2 and gives you a share link\n' +
      '4. Share the link — earn on every view!\n\n' +
      '💡 Tip: Send a photo BEFORE a video to set a custom thumbnail!\n\n' +
      '🌐 Website: ' + FRONTEND_URL
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
      
      // Get user settings for header/footer
      const user = await User.findById(session.userId);
      let message = '✅ Share Link Created!\n\n';
      
      if (user.headerEnabled && user.telegramHeader) {
        message += `${user.telegramHeader}\n\n`;
      }
      
      message += `🔗 ${shareUrl}`;
      
      if (user.footerEnabled && user.telegramFooter) {
        message += `\n\n${user.telegramFooter}`;
      }
      
      await ctx.reply(message);
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  }

  /* ─── /settings ────────────────────────────────────────────────────────── */
  async _onSettings(ctx) {
    const session = getSession(ctx.chat.id);
    if (!session.userId) return ctx.reply('Please /login first.');

    await this._showSettingsMenu(ctx, session.userId);
  }

  /* ─── /contact ─────────────────────────────────────────────────────────── */
  async _onContact(ctx) {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url('📢 New Updates', 'https://t.me/+bjnJaxlgdvxkM2Vl')
      ],
      [
        Markup.button.url('💬 Telegram Support', 'https://t.me/zexgram_support')
      ],
      [
        Markup.button.url('🌐 Visit Website', FRONTEND_URL)
      ]
    ]);

    await ctx.reply(
      '📞 Contact Us\n\n' +
      '📢 New Updates: https://t.me/+bjnJaxlgdvxkM2Vl\n' +
      '💬 Telegram Support: t.me/zexgram_support\n' +
      '🌐 Website: ' + FRONTEND_URL + '\n\n' +
      'Click buttons below to visit:',
      keyboard
    );
  }

  async _showSettingsMenu(ctx, userId) {
    const user = await User.findById(userId);
    
    const headerStatus = user.headerEnabled ? '✅ Enabled' : '❌ Disabled';
    const footerStatus = user.footerEnabled ? '✅ Enabled' : '❌ Disabled';
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          `📄 Header: ${headerStatus}`, 
          'toggle_header'
        )
      ],
      [
        Markup.button.callback(
          `📝 Footer: ${footerStatus}`, 
          'toggle_footer'
        )
      ],
      [
        Markup.button.callback('✏️ Set Header Text', 'set_header'),
        Markup.button.callback('✏️ Set Footer Text', 'set_footer')
      ]
    ]);
    
    const message = 
      '⚙️ Header & Footer Settings\n\n' +
      `Current Header: ${headerStatus}\n` +
      `${user.telegramHeader || '(not set)'}\n\n` +
      `Current Footer: ${footerStatus}\n` +
      `${user.telegramFooter || '(not set)'}\n\n` +
      '💡 Header/Footer will be automatically added to all your video uploads!';
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, keyboard);
    } else {
      await ctx.reply(message, keyboard);
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

  async _onSetHeader(ctx) {
    await ctx.answerCbQuery('Enter header text...');
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    
    setSession(ctx.chat.id, { state: STATES.AWAIT_HEADER });
    await ctx.reply('✏️ Enter header text (e.g., channel name, backup link):\n\nSend /cancel to cancel.');
  }

  async _onSetFooter(ctx) {
    await ctx.answerCbQuery('Enter footer text...');
    const session = getSession(ctx.chat.id);
    if (!session.userId) return;
    
    setSession(ctx.chat.id, { state: STATES.AWAIT_FOOTER });
    await ctx.reply('✏️ Enter footer text (e.g., backup channel link):\n\nSend /cancel to cancel.');
  }

  /* ─── All non-command messages ────────────────────────────────────────── */
  async _onAnyMessage(ctx) {
    const msg = ctx.message;
    if (!msg) return;

    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    const text = (msg.text || msg.caption || '').trim();

    // State machine — login flow and settings
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
      return ctx.reply(
        `❌ Login failed: ${result.error}\n\nUse menu button (☰) and select /login to try again.`
      );
    }

    setSession(chatId, { userId: result.user.id.toString() });
    await ctx.reply(
      `✅ Logged in as ${result.user.name}!\n\n` +
      "Now forward any video — I'll upload it to R2 and give you a share link automatically!\n\n" +
      '💡 Tip: Send a photo first to set a custom thumbnail.'
    );
  }

}

module.exports = new TelegramBotService();
