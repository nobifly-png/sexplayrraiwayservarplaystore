const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const { port, env, validateRuntimeConfig } = require('./config/env');
const mongoose = require('mongoose');
const { startJobs, stopJobs } = require('./jobs');
const telegramBot = require('./modules/telegram/telegram.bot');
const telegramBot2 = require('./modules/telegram/telegram.bot2');

let server;
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn(`Received ${signal} — shutting down gracefully`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Force exit after shutdown timeout');
    process.exit(1);
  }, 15000);

  try {
    // 1. Stop Telegram polling first (prevents 409 on restart)
    await telegramBot.stop(signal);
    await telegramBot2.stop(signal);

    // 2. Stop cron jobs
    stopJobs();

    // 3. Stop accepting new HTTP requests
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }

    // 4. Close DB
    await mongoose.connection.close();

    clearTimeout(forceExitTimer);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Graceful shutdown failed');
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    const configErrors = validateRuntimeConfig();
    if (configErrors.length > 0) {
      logger.error({ configErrors }, 'Runtime configuration validation failed');
      process.exit(1);
    }

    await connectDB();

    startJobs();

    // Non-blocking, non-fatal — server starts regardless of bot status
    telegramBot.initialize().catch((err) =>
      logger.error({ err }, 'Telegram bot initialization failed (non-fatal)')
    );

    // Bot2 — TeraBox converter bot (optional, starts only if TELEGRAM_BOT2_TOKEN is set)
    telegramBot2.initialize().catch((err) =>
      logger.error({ err }, 'Telegram bot2 initialization failed (non-fatal)')
    );

    server = app.listen(port, () => {
      logger.info(`Server running in ${env} mode on port ${port}`);
    });

    server.on('error', (err) => {
      logger.error({ err }, 'HTTP server error');
      shutdown('server-error');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
};

// ── Process signal handlers ──────────────────────────────────────────────────
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled Rejection — continuing');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception — continuing');
});

startServer();
