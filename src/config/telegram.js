const { telegram } = require('./env');

// Telegram bot configuration
// Supports Local Bot API for files larger than 20MB (up to 2GB)

const telegramConfig = {
  enabled: telegram.enabled,
  botToken: telegram.botToken,
  
  // Local Bot API Server (for files > 20MB)
  // Priority: internal Railway URL > public URL > fallback to standard API
  // TELEGRAM_LOCAL_API_INTERNAL_URL: http://telegram-bot-api.railway.internal:8081 (recommended for Railway)
  // TELEGRAM_LOCAL_API_URL: https://telegram-bot-api-production-67c9.up.railway.app (public fallback)
  useLocalApi: process.env.TELEGRAM_USE_LOCAL_API === 'true',
  localApiUrl: (() => {
    // Prefer internal Railway networking for better performance and reliability
    const internalUrl = (process.env.TELEGRAM_LOCAL_API_INTERNAL_URL || '').trim().replace(/\/+$/, '');
    const publicUrl = (process.env.TELEGRAM_LOCAL_API_URL || '').trim().replace(/\/+$/, '');
    return internalUrl || publicUrl || null;
  })()
};

module.exports = telegramConfig;
