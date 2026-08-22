# Railway Environment Setup for Zexgram

**⚠️ IMPORTANT: This file contains placeholder values. Replace them with your actual credentials from Railway dashboard.**

## Main Backend Service (zexplayrraiwayservarplaystore)

Copy all these variables to Railway → Variables → Raw Editor:

```env
NODE_ENV=production
PORT=5000
BACKEND_URL=https://zexgram.up.railway.app
APP_URL=https://zaxgram.com
FRONTEND_URL=https://zaxgram.com
MONGODB_URI=[YOUR_MONGODB_CONNECTION_STRING]
JWT_ACCESS_SECRET=[YOUR_JWT_ACCESS_SECRET_MIN_32_CHARS]
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=[YOUR_JWT_REFRESH_SECRET_MIN_32_CHARS]
JWT_REFRESH_EXPIRES_IN=7d
R2_ACCOUNT_ID=[YOUR_CLOUDFLARE_R2_ACCOUNT_ID]
R2_ACCESS_KEY_ID=[YOUR_R2_ACCESS_KEY_ID]
R2_SECRET_ACCESS_KEY=[YOUR_R2_SECRET_ACCESS_KEY]
R2_BUCKET_NAME=clipnova
R2_ENDPOINT=[YOUR_R2_ENDPOINT_URL]
R2_PUBLIC_BASE_URL=[YOUR_R2_PUBLIC_URL]
R2_REGION=auto
CORS_ORIGIN=https://zaxgram.com,https://www.zaxgram.com,http://localhost:5173,http://localhost:5175
ALLOWED_ORIGINS=https://zaxgram.com,https://www.zaxgram.com,http://localhost:5173,http://localhost:5175
SUPER_ADMIN_ALLOWLIST=admin@zexgram.local
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=[YOUR_TELEGRAM_BOT_TOKEN]
TRUST_PROXY=1
DEFAULT_EARNINGS_PER_VIEW=0.001
MIN_WITHDRAWAL_AMOUNT=1
MAX_VIEWS_PER_IP_PER_HOUR=10
MIN_WATCH_SECONDS=5
MAX_UPLOAD_SIZE_BYTES=1073741824
GMAIL_CLIENT_ID=[YOUR_GOOGLE_CLIENT_ID]
GMAIL_CLIENT_SECRET=[YOUR_GOOGLE_CLIENT_SECRET]
GMAIL_REFRESH_TOKEN=[YOUR_GOOGLE_REFRESH_TOKEN]
GMAIL_USER=zexgram@gmail.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=50
ADMIN_RATE_LIMIT_MAX=200
WITHDRAWAL_RATE_LIMIT_MAX=40
TELEGRAM_USE_LOCAL_API=true
TELEGRAM_LOCAL_API_URL=https://telegram-bot-api-production-67c9.up.railway.app
```

## Telegram Local Bot API Service (telegram-bot-api)

Copy these variables to Railway → telegram-bot-api service → Variables → Raw Editor:

```env
TELEGRAM_API_ID=[YOUR_TELEGRAM_API_ID]
TELEGRAM_API_HASH=[YOUR_TELEGRAM_API_HASH]
TELEGRAM_LOCAL=1
```

**NOTE:** Get your TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org/apps

## Steps to Apply:

### 1. Main Backend Service:
1. Go to Railway dashboard
2. Select `zexplayrraiwayservarplaystore` service
3. Click "Variables" tab
4. Click "Raw Editor" button
5. **Copy your EXISTING variables first** (backup)
6. **Replace placeholders** in the template above with your actual values
7. Paste into Raw Editor
8. Click "Update Variables"
9. Service will auto-restart

### 2. Telegram Bot API Service:
1. Go to Railway dashboard
2. Select `telegram-bot-api` service
3. Click "Variables" tab
4. Click "Raw Editor" button
5. **Add** the 3 Telegram API variables above
6. Click "Update Variables"
7. Service will auto-restart

### 3. Verify:
- Wait 2-3 minutes for both services to restart
- Check Railway logs for "Telegram bot launched successfully"
- Check logs for "Local Bot API configured for file operations"
- Test uploading 20MB+ video to bot

## Troubleshooting:

### CORS still failing?
- Check Railway logs: should see "CORS allowed origins: https://zaxgram.com,..."
- If not showing, **redeploy** (not restart) the backend service

### Bot not using Local API?
- Check telegram-bot-api service logs for errors
- Make sure TELEGRAM_LOCAL_API_URL is accessible (try curl from backend service)
- Check backend logs for "using Local Bot API" message

### File upload still failing?
- Check file size: standard API = 20MB max, Local API = 2GB max
- Check telegram-bot-api service is running (should show green in Railway)
- Check logs for "Pipeline: fetching file info" message
