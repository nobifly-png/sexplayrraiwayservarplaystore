const { telegram } = require('./env');

// Telegram bot configuration
// This is a placeholder for future Telegram bot integration
// Bot logic will be implemented in src/modules/telegram/

const telegramConfig = {
  enabled: telegram.enabled,
  botToken: telegram.botToken
};

module.exports = telegramConfig;
