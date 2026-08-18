# Telegram Local Bot API Server Setup
## For uploading videos larger than 20MB (up to 2GB)

## Problem
Telegram's standard Bot API has a 20MB download limit. For larger files, you need to run a Local Bot API Server.

## Solution: Deploy Local Bot API Server on Railway

### Step 1: Get API Credentials
1. Go to https://my.telegram.org/auth
2. Login with your phone number
3. Go to "API Development Tools"
4. Create a new application
5. Copy your:
   - **api_id** (e.g., 12345678)
   - **api_hash** (e.g., 0123456789abcdef0123456789abcdef)

### Step 2: Deploy to Railway

#### Option A: Using Docker (Recommended)

1. Create new Railway project
2. Deploy from Docker image: `ghcr.io/tdlight-team/tdlight/telegram-bot-api`
3. Add environment variables:
   ```
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   TELEGRAM_LOCAL=1
   ```
4. Note the deployment URL (e.g., `https://telegram-bot-api.railway.app`)

#### Option B: Using Nixpacks

Create `telegram-bot-api` folder with:

**Dockerfile:**
```dockerfile
FROM tdlight/telegram-bot-api:latest

ENV TELEGRAM_API_ID=${TELEGRAM_API_ID}
ENV TELEGRAM_API_HASH=${TELEGRAM_API_HASH}
ENV TELEGRAM_LOCAL=1

EXPOSE 8081

CMD telegram-bot-api \
  --api-id=${TELEGRAM_API_ID} \
  --api-hash=${TELEGRAM_API_HASH} \
  --local \
  --http-port=8081
```

**railway.json:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": null,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Step 3: Configure Your Bot

Update your backend `.env`:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_ENABLED=true

# Local Bot API Server (for files > 20MB)
TELEGRAM_USE_LOCAL_API=true
TELEGRAM_LOCAL_API_URL=https://telegram-bot-api.railway.app
```

### Step 4: Update Bot Code

**File: `src/config/telegram.js`**

Add:
```javascript
module.exports = {
  enabled: process.env.TELEGRAM_BOT_ENABLED === 'true',
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  useLocalApi: process.env.TELEGRAM_USE_LOCAL_API === 'true',
  localApiUrl: process.env.TELEGRAM_LOCAL_API_URL || 'https://api.telegram.org'
};
```

**File: `src/modules/telegram/telegram.bot.js`**

Update Telegraf initialization:
```javascript
const { Telegraf } = require('telegraf');
const telegramConfig = require('../../config/telegram');

// Use local API server if configured
const botOptions = {};
if (telegramConfig.useLocalApi && telegramConfig.localApiUrl) {
  botOptions.telegram = {
    apiRoot: telegramConfig.localApiUrl
  };
}

this.bot = new Telegraf(telegramConfig.botToken, botOptions);
```

### Step 5: Test

1. Deploy updated backend to Railway
2. Send a 100MB video to your bot
3. Bot should now download and upload it successfully!

## Technical Details

### Standard Bot API vs Local Bot API

| Feature | Standard Bot API | Local Bot API |
|---------|-----------------|---------------|
| Max Download | 20 MB | 2 GB |
| Max Upload | 50 MB | 2 GB |
| Hosting | Telegram servers | Your server |
| Setup | Easy | Moderate |

### How It Works

1. **Standard API Flow:**
   ```
   Telegram → Bot API (20MB limit) → Your Backend → R2
   ```

2. **Local API Flow:**
   ```
   Telegram → Local Bot API (2GB limit) → Your Backend → R2
   ```

### Resource Requirements

- **RAM:** 512MB minimum
- **Disk:** 1GB minimum
- **CPU:** Shared OK
- **Railway Plan:** Hobby ($5/month) recommended

## Alternative: File Link Import

If you don't want to setup Local Bot API, users can:
1. Upload video to TeraBox/Google Drive
2. Share link in bot
3. Bot imports from link (no size limit!)

This is already implemented in your bot via `message.router.js`.

## Cost Estimate

- **Railway (Bot API Server):** $5/month
- **R2 Storage (1TB):** $15/month
- **Total:** ~$20/month for unlimited video uploads

## Support

If you face issues:
1. Check Railway logs: `railway logs`
2. Test API: `curl https://your-api.railway.app`
3. Verify bot token is correct

---

**Ready to implement? Let me know and I'll add the code changes!**
