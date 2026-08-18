const { telegram } = require('./env');

// Telegram bot configuration
// Supports Local Bot API for files larger than 20MB (up to 2GB)

const telegramConfig = {
  enabled: telegram.enabled,
  botToken: telegram.botToken,
  
  // Local Bot API Server (for files > 20MB)
  // Set TELEGRAM_USE_LOCAL_API=true and TELEGRAM_LOCAL_API_URL in .env
  // See TELEGRAM_LOCAL_BOT_SETUP.md for setup instructions
  useLocalApi: process.env.TELEGRAM_USE_LOCAL_API === 'true',
  localApiUrl: process.env.TELEGRAM_LOCAL_API_URL || null
};

module.exports = telegramConfig;
