# QUICK FIX: Telegram Bot HTTP 404 Error

## Problem
Local Bot API `/file/` endpoint returns HTTP 404 because Local Bot API doesn't serve files the same way as standard API.

## Root Cause
Local Bot API server needs special configuration to serve downloaded files, which is complex and requires persistent storage setup on Railway.

## IMMEDIATE FIX (Recommended)

### Option 1: Disable Local Bot API - Use Standard API Only (20MB limit)

**Best for quick fix!** Files up to 20MB will work perfectly.

#### Railway Backend Variables - SET THIS NOW:

```env
TELEGRAM_USE_LOCAL_API="false"
```

That's it! Remove or set to false, and bot will use standard API which works 100%.

#### Trade-offs:
- ✅ Works immediately, no more 404 errors
- ✅ Files < 20MB upload perfectly
- ❌ Files > 20MB won't work

#### Users can still upload large files via:
- TeraBox links (unlimited size, free)
- Dailymotion links
- Direct links

---

## Option 2: Fix Local Bot API (Complex - Takes Time)

This requires proper file storage setup on Local Bot API server.

### Required Changes on `telegram-bot-api` Railway Service:

1. **Add Environment Variable:**
```env
TELEGRAM_LOCAL=1
```

2. **Update Start Command:**
```bash
telegram-bot-api \
  --api-id=${TELEGRAM_API_ID} \
  --api-hash=${TELEGRAM_API_HASH} \
  --local \
  --http-port=8081 \
  --dir=/app/telegram-bot-api-data
```

3. **Add Volume Mount** (Railway Volumes):
   - Path: `/app/telegram-bot-api-data`
   - Size: At least 5GB (for file caching)

4. **Verify Storage Permissions:**
   - Check Railway logs for write permission errors
   - Files must persist between restarts

### Why This is Complex:
- Railway ephemeral filesystem (files lost on restart)
- Need persistent volume ($5-10/month extra)
- Storage can fill up quickly
- Files expire after time

---

## Recommended Action: Option 1

**Just disable Local Bot API for now:**

1. Go to Railway Dashboard
2. Backend service → Variables
3. Find `TELEGRAM_USE_LOCAL_API`
4. Change to: `"false"`
5. Redeploy (automatic)

Wait 2 minutes, test bot with <20MB video. Will work! ✅

---

## Testing After Fix

### Test 1: Small Video (5MB)
Send to bot → Should upload successfully ✅

### Test 2: Medium Video (15MB)
Send to bot → Should upload successfully ✅

### Test 3: Large Video (50MB)
Send to bot → Will show "file too large" message

**Tell users:** "For videos >20MB, upload to TeraBox and share link"

---

## Alternative: Hybrid Approach

Keep Local API enabled but add better error handling:

```env
# Try Local API first, fallback to standard if fails
TELEGRAM_USE_LOCAL_API="true"
TELEGRAM_LOCAL_API_FALLBACK="true"  # New flag (requires code change)
```

This way:
- Files <20MB: Use standard API (always works)
- Files >20MB: Try Local API, show better error if fails

---

## Summary

**For immediate fix RIGHT NOW:**

Railway → Backend → Variables → `TELEGRAM_USE_LOCAL_API="false"` → Save

Done! Bot works again. 🎉

**For large file support (later):**
- Setup persistent storage on Local Bot API service
- Or use external link imports (TeraBox, etc)
- Or pay for file hosting service

---

**Which option do you prefer?**
1. Quick fix (disable Local API) - 2 minutes
2. Full fix (setup storage) - 1-2 hours

I recommend Option 1 for now, fix Option 2 later when you have time.
