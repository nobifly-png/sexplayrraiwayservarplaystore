# Quick Start: Enable 1GB Video Uploads in Telegram Bot

## Problem
Your Telegram bot can only handle videos up to **20MB** because of Telegram's standard Bot API limitation.

## Solution
Deploy a **Local Bot API Server** to support files up to **2GB**.

---

## 🚀 Quick Setup (5 Steps)

### Step 1: Get Telegram API Credentials

1. Visit: https://my.telegram.org/auth
2. Login with your phone number
3. Click "API Development Tools"
4. Create new application
5. Copy these values:
   - **api_id** (numbers like: 12345678)
   - **api_hash** (32 characters like: abc123...)

### Step 2: Deploy Bot API Server on Railway

**Method A: One-Click Deploy (Easiest)**

1. Go to Railway: https://railway.app
2. New Project → Deploy from Template
3. Search: "telegram-bot-api"
4. Or use this Docker image: `ghcr.io/tdlight-team/tdlight/telegram-bot-api`
5. Set environment variables:
   ```
   TELEGRAM_API_ID=your_api_id_from_step1
   TELEGRAM_API_HASH=your_api_hash_from_step1
   ```
6. Deploy!
7. Copy the deployment URL (e.g., `https://telegram-api-production.up.railway.app`)

**Method B: Using Dockerfile**

Create new Railway service with this `Dockerfile`:

```dockerfile
FROM tdlight/telegram-bot-api:latest

ENV TELEGRAM_API_ID=${TELEGRAM_API_ID}
ENV TELEGRAM_API_HASH=${TELEGRAM_API_HASH}

EXPOSE 8081

CMD telegram-bot-api \
  --api-id=${TELEGRAM_API_ID} \
  --api-hash=${TELEGRAM_API_HASH} \
  --local \
  --http-port=8081
```

### Step 3: Update Your Backend `.env`

Add these lines to your Railway backend environment variables:

```env
# Enable Local Bot API
TELEGRAM_USE_LOCAL_API=true
TELEGRAM_LOCAL_API_URL=https://telegram-api-production.up.railway.app
```

**Full Telegram config should look like:**
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_ENABLED=true
TELEGRAM_USE_LOCAL_API=true
TELEGRAM_LOCAL_API_URL=https://telegram-api-production.up.railway.app
```

### Step 4: Redeploy Backend

1. Changes are already in code (committed)
2. Push to GitHub: `git push`
3. Railway will auto-deploy
4. Wait 2-3 minutes

### Step 5: Test!

1. Open Telegram bot
2. Send a 100MB or 500MB video
3. Bot should process it successfully! 🎉

---

## 📊 Before vs After

| Feature | Before | After |
|---------|--------|-------|
| Max video size | 20 MB ❌ | 2 GB ✅ |
| Setup complexity | Easy | Moderate |
| Extra cost | $0 | ~$5/month |
| Bot API | Standard | Local (self-hosted) |

---

## 🔍 How to Verify It's Working

**Check Bot Logs (Railway):**

```
Using Local Bot API server for large file support (up to 2GB)
apiRoot: https://telegram-api-production.up.railway.app
```

**If you see this, Local API is active!** ✅

**If you see this:**
```
Using standard Telegram Bot API (files limited to 20MB)
```

Then Local API is not configured. Check your `.env` settings.

---

## 💰 Cost Breakdown

- **Railway (Backend):** Already running
- **Railway (Bot API Server):** ~$5/month (Hobby plan)
- **R2 Storage:** Already paying
- **Total Extra Cost:** **$5/month**

Worth it for uploading 1GB videos! 🚀

---

## ❓ Troubleshooting

### Bot still says "file too large"

1. Check Railway logs for Bot API server
2. Verify `TELEGRAM_USE_LOCAL_API=true` in backend `.env`
3. Verify `TELEGRAM_LOCAL_API_URL` is correct
4. Restart backend service

### Bot API server not starting

1. Check you set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`
2. Check Railway logs for errors
3. Try redeploying

### Video upload fails after 20MB

1. Local API server might be down
2. Check Railway logs
3. Verify URL is accessible: `curl https://your-api.railway.app`

---

## 🎯 Alternative: File Links

If you don't want to pay $5/month, users can:

1. Upload video to **TeraBox** (free, unlimited)
2. Share link in bot
3. Bot imports from link (no size limit!)

Your bot already supports this via link detection.

---

## ✅ Summary

1. Get API credentials from my.telegram.org
2. Deploy Bot API server to Railway (Docker image)
3. Set `TELEGRAM_USE_LOCAL_API=true` in backend
4. Test with 100MB+ video
5. Enjoy 2GB file support! 🎉

**Questions? Issues? Let me know!**
