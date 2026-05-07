const { Telegraf, Markup } = require('telegraf');
const telegramConfig = require('../../config/telegram');
const logger = require('../../config/logger');
const authService = require('../auth/auth.service');
const videoService = require('../videos/video.service');
const linkService = require('../links/link.service');
const analyticsService = require('../analytics/analytics.service');
const walletService = require('../wallet/wallet.service');
const withdrawalService = require('../withdrawals/withdrawal.service');
const User = require('../users/user.model');

// In-memory session store: chatId -> { state, userId, email, pendingWithdrawalAmount, lastActivity }
// Max 5000 sessions; LRU eviction on overflow to prevent unbounded RAM growth on Render.
const MAX_SESSIONS = 5000;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle eviction
const sessions = new Map();

const evictStaleSessions = () => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if ((s.lastActivity || 0) < cutoff) sessions.delete(id);
  }
};

const getSession = (chatId) => sessions.get(chatId) || {};
const setSession = (chatId, data) => {
  if (sessions.size >= MAX_SESSIONS) evictStaleSessions();
  sessions.set(chatId, { ...getSession(chatId), ...data, lastActivity: Date.now() });
};
const clearSession = (chatId) => sessions.delete(chatId);

const STATES = {
  IDLE: 'IDLE',
  AWAIT_EMAIL: 'AWAIT_EMAIL',
  AWAIT_PASSWORD: 'AWAIT_PASSWORD',
  AWAIT_WITHDRAWAL_AMOUNT: 'AWAIT_WITHDRAWAL_AMOUNT',
  AWAIT_WITHDRAWAL_METHOD: 'AWAIT_WITHDRAWAL_METHOD'
};

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.enabled = telegramConfig.enabled;
  }

  async initialize() {
    if (!this.enabled || !telegramConfig.botToken) {
      logger.info('Telegram bot disabled or token not set');
      return;
    }

    try {
      this.bot = new Telegraf(telegramConfig.botToken);
      this._registerHandlers();

      // launch() starts long-polling in background — do NOT await it.
      // Attach rejection handler so polling errors never reach uncaughtException.
      this.bot.launch().catch((err) =>
        logger.error({ err }, 'Telegram bot polling error')
      );

      logger.info('Telegram bot started');

      process.once('SIGINT', () => this.bot.stop('SIGINT').catch(() => {}));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM').catch(() => {}));
    } catch (err) {
      logger.error({ err }, 'Telegram bot failed to start');
    }
  }

  _registerHandlers() {
    const bot = this.bot;

    bot.start((ctx) => this._handleStart(ctx));
    bot.command('login', (ctx) => this._handleLoginCmd(ctx));
    bot.command('logout', (ctx) => this._handleLogout(ctx));
    bot.command('videos', (ctx) => this._handleVideos(ctx));
    bot.command('link', (ctx) => this._handleLink(ctx));
    bot.command('stats', (ctx) => this._handleStats(ctx));
    bot.command('wallet', (ctx) => this._handleWallet(ctx));
    bot.command('withdraw', (ctx) => this._handleWithdrawCmd(ctx));
    bot.command('help', (ctx) => this._handleHelp(ctx));
    bot.command('cancel', (ctx) => this._handleCancel(ctx));

    bot.on('text', (ctx) => this._handleText(ctx));

    bot.catch((err, ctx) => {
      logger.error({ err, chatId: ctx.chat?.id }, 'Telegram bot error');
      ctx.reply('An error occurred. Please try again.').catch(() => {});
    });
  }

  async _handleStart(ctx) {
    const chatId = ctx.chat.id;
    clearSession(chatId);
    await ctx.reply(
      `👋 Welcome to *ClipNova Bot*!\n\nMonetize your videos and track earnings right here.\n\n` +
      `Use /login to connect your account.\nUse /help to see all commands.`,
      { parse_mode: 'Markdown' }
    );
  }

  async _handleHelp(ctx) {
    await ctx.reply(
      `*Available Commands:*\n\n` +
      `/login — Connect your ClipNova account\n` +
      `/logout — Disconnect account\n` +
      `/videos — List your videos\n` +
      `/link <videoId> — Generate share link\n` +
      `/stats — View your analytics\n` +
      `/wallet — Check wallet balance\n` +
      `/withdraw — Request withdrawal\n` +
      `/cancel — Cancel current action`,
      { parse_mode: 'Markdown' }
    );
  }

  async _handleCancel(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    if (session.state && session.state !== STATES.IDLE) {
      setSession(chatId, { state: STATES.IDLE });
      await ctx.reply('Action cancelled.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  }

  async _handleLoginCmd(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);

    if (session.userId) {
      await ctx.reply('You are already logged in. Use /logout first.');
      return;
    }

    setSession(chatId, { state: STATES.AWAIT_EMAIL });
    await ctx.reply('Please enter your ClipNova email:');
  }

  async _handleLogout(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);

    if (!session.userId) {
      await ctx.reply('You are not logged in.');
      return;
    }

    clearSession(chatId);
    await ctx.reply('✅ Logged out successfully.');
  }

  async _handleVideos(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    if (!session.userId) return ctx.reply('Please /login first.');

    try {
      const videos = await videoService.getCreatorVideos(session.userId, { page: 1, limit: 10 });
      if (!videos.length) return ctx.reply('You have no videos yet.');

      const list = videos.map((v, i) =>
        `${i + 1}. *${v.title}* — ${v.type} — ${v.status}\nID: \`${v._id}\``
      ).join('\n\n');

      await ctx.reply(`*Your Videos:*\n\n${list}`, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error({ err }, 'Telegram /videos error');
      await ctx.reply('Failed to fetch videos.');
    }
  }

  async _handleLink(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    if (!session.userId) return ctx.reply('Please /login first.');

    const parts = ctx.message.text.trim().split(/\s+/);
    const videoId = parts[1];

    if (!videoId) return ctx.reply('Usage: /link <videoId>');

    try {
      const link = await linkService.createLink(session.userId, videoId);
      const { appUrl } = require('../../config/env');
      await ctx.reply(
        `✅ *Link created!*\n\nShare URL: \`${appUrl}/api/l/${link.shortCode}\`\nCode: \`${link.shortCode}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await ctx.reply(`Failed: ${err.message}`);
    }
  }

  async _handleStats(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    if (!session.userId) return ctx.reply('Please /login first.');

    try {
      const stats = await analyticsService.getCreatorOverview(session.userId);
      await ctx.reply(
        `📊 *Your Stats:*\n\n` +
        `Total Views: ${stats.totalViews}\n` +
        `Valid Views: ${stats.validViews}\n` +
        `Rejected: ${stats.rejectedViews}\n` +
        `Total Earnings: ₹${stats.totalEarnings.toFixed(2)}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error({ err }, 'Telegram /stats error');
      await ctx.reply('Failed to fetch stats.');
    }
  }

  async _handleWallet(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    if (!session.userId) return ctx.reply('Please /login first.');

    try {
      const wallet = await walletService.getWallet(session.userId);
      await ctx.reply(
        `💰 *Wallet Balance:*\n\n` +
        `Available: ₹${wallet.availableBalance.toFixed(2)}\n` +
        `Pending: ₹${wallet.pendingBalance.toFixed(2)}\n` +
        `Total Earned: ₹${wallet.totalEarnings.toFixed(2)}\n` +
        `Lifetime Withdrawn: ₹${wallet.lifetimeWithdrawn.toFixed(2)}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      logger.error({ err }, 'Telegram /wallet error');
      await ctx.reply('Failed to fetch wallet.');
    }
  }

  async _handleWithdrawCmd(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    if (!session.userId) return ctx.reply('Please /login first.');

    setSession(chatId, { state: STATES.AWAIT_WITHDRAWAL_AMOUNT });
    await ctx.reply('Enter the amount you want to withdraw (minimum ₹100):');
  }

  async _handleText(ctx) {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    const text = ctx.message.text.trim();

    switch (session.state) {
      case STATES.AWAIT_EMAIL:
        setSession(chatId, { email: text, state: STATES.AWAIT_PASSWORD });
        await ctx.reply('Enter your password:');
        break;

      case STATES.AWAIT_PASSWORD:
        await this._processLogin(ctx, chatId, session.email, text);
        break;

      case STATES.AWAIT_WITHDRAWAL_AMOUNT: {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('Invalid amount. Please enter a valid number:');
          return;
        }
        setSession(chatId, { pendingWithdrawalAmount: amount, state: STATES.AWAIT_WITHDRAWAL_METHOD });
        await ctx.reply(
          'Choose payment method:',
          Markup.keyboard([['UPI', 'BANK_TRANSFER']]).oneTime().resize()
        );
        break;
      }

      case STATES.AWAIT_WITHDRAWAL_METHOD:
        await this._processWithdrawal(ctx, chatId, session, text);
        break;

      default:
        await ctx.reply('Use /help to see available commands.');
    }
  }

  async _processLogin(ctx, chatId, email, password) {
    try {
      const result = await authService.login(email, password, 'telegram', `TelegramBot/${chatId}`);
      setSession(chatId, { userId: result.user.id.toString(), state: STATES.IDLE, email: undefined });
      await ctx.reply(
        `✅ *Logged in as ${result.user.name}!*\n\nUse /help to see what you can do.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      setSession(chatId, { state: STATES.IDLE, email: undefined });
      await ctx.reply(`❌ Login failed: ${err.message}\n\nUse /login to try again.`);
    }
  }

  async _processWithdrawal(ctx, chatId, session, method) {
    const validMethods = ['UPI', 'BANK_TRANSFER'];
    const normalizedMethod = method.toUpperCase();

    if (!validMethods.includes(normalizedMethod)) {
      await ctx.reply('Invalid method. Choose UPI or BANK_TRANSFER:');
      return;
    }

    setSession(chatId, { state: STATES.IDLE });

    try {
      const withdrawal = await withdrawalService.createWithdrawal(
        session.userId,
        session.pendingWithdrawalAmount,
        { type: normalizedMethod }
      );
      await ctx.reply(
        `✅ *Withdrawal Requested!*\n\nAmount: ₹${withdrawal.amount}\nMethod: ${normalizedMethod}\nStatus: PENDING`,
        { parse_mode: 'Markdown', ...Markup.removeKeyboard() }
      );
    } catch (err) {
      await ctx.reply(`❌ Withdrawal failed: ${err.message}`, Markup.removeKeyboard());
    }
  }
}

module.exports = new TelegramBotService();
