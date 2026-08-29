# QUICK FIX: HTTP 404 Error

## Problem
Bot gives: `Upload failed: Download failed: HTTP 404`

## Root Cause
`telegram-bot-api` service doesn't have persistent storage OR file not accessible.

## SOLUTION (Do This NOW):

### Option 1: Add Volume to telegram-bot-api (RECOMMENDED)

1. **Railway Dashboard** → `telegram-bot-api` service
2. **Settings** tab (scroll down)
3. **Volumes** section → Click **"+ New Volume"**
4. Enter:
   ```
   Mount Path: /var/lib/telegram-bot-api
   ```
5. Click **"Add"**
6. Service will **automatically restart** (2-3 min)
7. **WAIT** for restart to complete
8. **Test again** with video

### Option 2: Restart telegram-bot-api Service (Quick Test)

If volume already exists:
1. Railway Dashboard → `telegram-bot-api` service
2. Click **"..."** menu (top right)
3. Click **"Restart"**
4. Wait 1-2 minutes
5. Test again

### Option 3: Check telegram-bot-api Logs

1. Railway Dashboard → `telegram-bot-api` service
2. Click **"Deployments"** tab
3. Click **"View Logs"**
4. Look for errors like:
   ```
   Error: ENOENT: no such file or directory
   Error: Cannot open file
   File not found
   ```

## What Should Happen After Fix:

### Before (Current):
```
Bot → Local Bot API getFile → OK ✅
Bot → Local Bot API download → HTTP 404 ❌ (file missing)
```

### After (Fixed):
```
Bot → Local Bot API getFile → OK ✅
Bot → Local Bot API download → OK ✅ (file exists in volume)
Bot → Stream to R2 → OK ✅
Bot → Share link → OK ✅
```

## Test After Fix:

1. Send **10MB video** to bot
   - Should work: ✅
   
2. Send **25MB video** to bot
   - Should work: ✅ (proves >20MB)

3. Send **100MB video** to bot
   - Should work: ✅ (proves streaming)

## If Still Fails:

### Check Backend Logs:
Look for:
```
Pipeline: Telegram direct upload started
Pipeline: file download URL ready
  downloadUrl: "https://telegram-bot-api..."
  usingLocalApi: true
StreamToR2: download progress
```

If you see `usingLocalApi: false` → Local Bot API not being used.

### Fix Environment Variable:

Add to **backend** service:
```
TELEGRAM_LOCAL_API_INTERNAL_URL=http://telegram-bot-api.railway.internal:8081
```

Then restart backend service.

## Quick Verification Commands:

### Check if telegram-bot-api is running:
1. Railway → `telegram-bot-api` service
2. Should show **"Active"** status
3. Should show **green dot**

### Check if volume exists:
1. Railway → `telegram-bot-api` service  
2. Settings → Volumes
3. Should see: `/var/lib/telegram-bot-api` → **X GB**

### Check backend is using Local Bot API:
1. Railway → backend service → Deployments → Logs
2. Search: `"usingLocalApi"`
3. Should be: `"usingLocalApi": true`

## Expected Timeline:

- **Add volume**: 2-3 min restart
- **First video upload after volume**: ~30 sec for 25MB
- **Subsequent uploads**: faster (cached)

## Important Notes:

1. **Volume is REQUIRED** for Local Bot API on Railway
2. Without volume: files are ephemeral (disappear)
3. **Don't forward videos** - send directly for best results
4. Maximum file size: **2GB** (Telegram limit)

## If Everything Fails:

Last resort - use **standard Telegram API** (20MB limit):

1. Backend service → Variables
2. Change: `TELEGRAM_USE_LOCAL_API=false`
3. Save → Service restarts
4. Test with **<20MB** videos

This proves basic bot functionality works.
