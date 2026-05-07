const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const { port, env, validateRuntimeConfig } = require('./config/env');
const mongoose = require('mongoose');
const { startJobs } = require('./jobs');
const telegramBot = require('./modules/telegram/telegram.bot');

let server;
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn(`Received ${signal}, shutting down gracefully`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Force exiting after shutdown timeout');
    process.exit(1);
  }, 10000);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await mongoose.connection.close();
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    logger.error('Graceful shutdown failed:', error);
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
    telegramBot.initialize().catch((err) =>
      logger.error({ err }, 'Telegram bot initialization failed (non-fatal)')
    );

    server = app.listen(port, () => {
      logger.info(`Server running in ${env} mode on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
