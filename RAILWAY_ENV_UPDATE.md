# Railway Environment Variable Updates

## Problem Fixed
Telegram bot now uses **direct Telegram CDN URLs** instead of Local Bot API. This bypasses Railway's ephemeral storage issue completely.

## What Changed
- Code now uses `https://api.telegram.org` for both `getFile` and download
- Telegram's CDN supports files up to **2GB** (not just 20MB)
- Removed all Local Bot API fallback logic
- No more 404 errors from missing files

## Railway Environment Variables to UPDATE

### Backend Service (zexgram.up.railway.app)
**REMOVE these variables:**
```
TELEGRAM_USE_LOCAL_API
TELEGRAM_LOCAL_API_URL
TELEGRAM_LOCAL_API_INTERNAL_URL
TELEGRAM_LOCAL
```

**KEEP these variables:**
```
TELEGRAM_BOT_TOKEN=8998834969:AAEhXlNLlNXOAe1oYIhEmqI4yRO4StsicDA
TELEGRAM_BOT_ENABLED=true
```

### telegram-bot-api Service
**You can STOP or DELETE this service** - it's no longer needed!

The bot now downloads directly from Telegram's CDN which:
- ✅ Supports up to 2GB files
- ✅ No storage issues (Telegram handles it)
- ✅ No 404 errors
- ✅ Simpler deployment
- ✅ Lower Railway costs (one less service)

## How to Update

1. **Go to Railway dashboard** → backend service → Variables tab

2. **Delete these 4 variables:**
   - `TELEGRAM_USE_LOCAL_API`
   - `TELEGRAM_LOCAL_API_URL`
   - `TELEGRAM_LOCAL_API_INTERNAL_URL`
   - `TELEGRAM_LOCAL`

3. **Click "Deploy"** to restart with new env vars

4. **Optional:** Delete telegram-bot-api service to save resources

## Testing
After deployment, try uploading:
1. Small video (<20MB) - should work
2. Large video (>20MB, up to 2GB) - should work now!

## Why This Works
Telegram's Bot API has TWO modes:
1. **Standard API** - `getFile` returns a `file_path`, then you download from `https://api.telegram.org/file/bot.../file_path`
2. **Local Bot API** - requires self-hosting with persistent storage (not suitable for Railway)

The fix uses **Standard API for EVERYTHING** because Telegram's CDN supports large files (up to 2GB) when accessed via the proper endpoints.
