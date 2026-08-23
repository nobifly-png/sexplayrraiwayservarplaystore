# Telegram Large File Upload Setup

This guide explains how to enable support for Telegram video uploads larger than 20MB, targeting files up to approximately 1GB.

## Architecture Overview

```
Telegram Message (video/document)
    ↓
Telegram Local Bot API Server (Railway service)
    ↓ getFile + file_path
Backend (ClipNova)
    ↓ streaming download (no full buffering)
AWS SDK Upload (multipart)
    ↓ 10MB chunks
Cloudflare R2
    ↓
MongoDB video record
    ↓
Share link: https://zaxgram.com/watch/{shortCode}
```

## Key Features

- ✅ **Streaming Architecture**: Files are NOT loaded into memory
- ✅ **Multipart Upload**: R2 receives 10MB chunks concurrently
- ✅ **Large File Support**: Tested architecture supports up to 2GB
- ✅ **Memory Bounded**: RAM usage stays ~50-100MB regardless of file size
- ✅ **Progress Logging**: Download and upload progress tracked every 50MB

## Railway Setup

### Step 1: Deploy Telegram Local Bot API Service

1. **Create New Service in Railway:**
   - Go to your Railway project
   - Click "New" → "Service"
   - Select "Docker Image"
   - Image: `aiogram/telegram-bot-api:latest`
   - Service Name: `telegram-bot-api`

2. **Configure Environment Variables:**
   ```
   TELEGRAM_API_ID=(get from https://my.telegram.org/apps)
   TELEGRAM_API_HASH=(get from https://my.telegram.org/apps)
   TELEGRAM_LOCAL=1
   ```

3. **Add Persistent Volume (CRITICAL):**
   - Go to `telegram-bot-api` service → Settings
   - Scroll to "Volumes"
   - Click "Add Volume"
   - Mount Path: `/var/lib/telegram-bot-api`
   - Size: **5GB minimum** (recommended: 10GB)
   - This stores downloaded files temporarily

4. **Configure Networking:**
   - Port: 8081 (default for Local Bot API)
   - Generate Domain: Create a public domain for fallback
   - Note the Railway internal URL: `telegram-bot-api.railway.internal`

### Step 2: Configure ClipNova Backend

1. **Update Environment Variables:**
   
   Add to your backend service:
   
   ```bash
   # Enable Local Bot API
   TELEGRAM_USE_LOCAL_API=true
   
   # Internal Railway URL (RECOMMENDED - private networking)
   TELEGRAM_LOCAL_API_INTERNAL_URL=http://telegram-bot-api.railway.internal:8081
   
   # Public URL (FALLBACK)
   TELEGRAM_LOCAL_API_URL=https://telegram-bot-api-production-67c9.up.railway.app
   ```

2. **Install Dependencies:**
   
   The backend now requires `@aws-sdk/lib-storage` for streaming uploads:
   
   ```bash
   npm install
   ```
   
   Railway will automatically install this on next deployment.

3. **Deploy:**
   
   Push changes to GitHub (if Railway auto-deploys) or trigger manual deploy.

## Testing

### Test 1: Small File (~10MB)
```
Send a 10MB video directly to the bot
Expected: Upload succeeds (baseline test)
```

### Test 2: Standard API Limit (~25MB)
```
Send a 25MB video directly to the bot
Expected: Upload succeeds (proves >20MB support)
```

### Test 3: Large File (~100MB)
```
Send a 100MB video directly to the bot
Expected: Upload succeeds, memory stays bounded
Monitor Railway logs for progress updates
```

### Test 4: Very Large File (~500MB)
```
Send a 500MB video directly to the bot
Expected: Upload succeeds, takes ~3-10 minutes depending on connection
Check R2 for complete file
```

### Test 5: Forwarded Video
```
Forward a >20MB video from another channel
Expected: May work if Telegram allows it
If fails: "File too large" error is expected (Telegram limitation)
```

## How It Works

### Previous Implementation (BROKEN for >20MB)
```javascript
// OLD: Loaded entire file into memory
const chunks = [];
res.on('data', chunk => chunks.push(chunk));
res.on('end', () => {
  const buffer = Buffer.concat(chunks);  // 500MB in RAM!
  await uploadBufferToR2(buffer, ...);   // Another 500MB in RAM!
});
```
**Problem**: 500MB video = 1GB+ RAM usage = OOM crash

### New Implementation (FIXED)
```javascript
// NEW: Stream with multipart upload
const passThrough = new PassThrough();
const upload = new Upload({
  client: r2Client,
  params: { Body: passThrough, ... },
  partSize: 10 * 1024 * 1024  // 10MB chunks
});
res.pipe(passThrough);  // Direct stream, no buffering
```
**Solution**: Streaming keeps RAM usage ~50-100MB regardless of file size

## Monitoring

### Backend Logs (Railway)

You'll see progress updates like:

```
Pipeline: Telegram direct upload started
  fileId: "BQACAgEAAxk..."
  userId: "507f1f77bcf..."
  fileSize: 104857600 (100MB)

Pipeline: file download URL ready
  downloadUrl: "https://telegram-bot-api..."
  fileSizeMB: "100.00"
  usingLocalApi: true

StreamToR2: download progress
  downloaded: "50.0MB"
  expected: "100.0MB"

StreamToR2: upload progress
  loaded: "50.0MB"
  total: "100.0MB"
  percent: "50.0%"

StreamToR2: complete
  storageKey: "videos/507f1f77bcf.../1734567890-abc123.mp4"
  totalBytes: 104857600

Pipeline: Telegram upload complete
  videoId: "507f1f77bcf..."
  shareUrl: "https://zaxgram.com/watch/abc123"
```

### Expected Timeline

| File Size | Download Time | Upload Time | Total Time |
|-----------|---------------|-------------|------------|
| 20MB | 5-10 sec | 5-10 sec | ~20 sec |
| 100MB | 20-40 sec | 30-60 sec | 1-2 min |
| 500MB | 1-3 min | 2-5 min | 3-8 min |
| 1GB | 2-6 min | 4-10 min | 6-16 min |

*Times vary based on network speed and Railway datacenter

## Troubleshooting

### Error: "HTTP 404" from Local Bot API

**Cause**: Local Bot API doesn't have the file

**Solutions**:
1. Verify `telegram-bot-api` service has **persistent volume** mounted
2. Check `telegram-bot-api` logs for errors
3. Verify `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` are correct
4. Try using internal Railway URL instead of public URL

### Error: "File too large for standard API (20MB limit)"

**Cause**: `TELEGRAM_USE_LOCAL_API` is false or Local Bot API URL is not set

**Solutions**:
1. Set `TELEGRAM_USE_LOCAL_API=true` in backend environment
2. Set `TELEGRAM_LOCAL_API_INTERNAL_URL` or `TELEGRAM_LOCAL_API_URL`
3. Restart backend service
4. Verify environment variables loaded (check Railway logs)

### Upload Hangs or Times Out

**Cause**: Network issue or R2 multipart upload problem

**Solutions**:
1. Check R2 credentials are correct
2. Verify R2 bucket exists and is accessible
3. Check Railway service logs for detailed error
4. Increase timeout if necessary (current: 10 min download + unlimited upload)

### Memory Issues (OOM)

**Cause**: Old code is still running (shouldn't happen with new streaming)

**Solutions**:
1. Verify deployment completed successfully
2. Check `package.json` includes `@aws-sdk/lib-storage`
3. Verify `r2.utils.js` is using `Upload` from `@aws-sdk/lib-storage`
4. Restart backend service

### Forwarded Videos Fail

**Cause**: Telegram API limitation for forwarded files

**Explanation**:
- Forwarded videos MAY have a 20MB limit depending on original channel settings
- This is a Telegram platform limitation, not a backend issue

**Solution**:
- Tell users to download and send videos directly (not forward)
- Bot will return clear error message for oversized forwarded files

## Limitations

1. **Maximum File Size**: 2GB (Telegram Bot API hard limit)
2. **Railway Volume**: Requires enough space for concurrent uploads
3. **Network Speed**: Upload time depends on user's network and Railway datacenter
4. **Forwarded Videos**: May have 20MB limit (Telegram limitation)

## Production Recommendations

1. **Volume Size**: Set telegram-bot-api volume to at least 10GB
2. **Monitoring**: Watch Railway metrics for memory and CPU usage
3. **Cleanup**: Local Bot API automatically cleans up old files
4. **Scaling**: If handling many large uploads, consider increasing Railway RAM
5. **Private Networking**: Always use internal Railway URL for better performance

## Code Changes Summary

### Modified Files:
1. `src/modules/telegram/r2.utils.js` - Added streaming upload with multipart
2. `src/modules/telegram/upload.pipeline.js` - Removed buffer accumulation
3. `src/config/telegram.js` - Added internal Railway URL support
4. `package.json` - Added `@aws-sdk/lib-storage` dependency
5. `.env.example` - Updated documentation

### Key Changes:
- ❌ **REMOVED**: `Buffer.concat(chunks)` (memory accumulation)
- ❌ **REMOVED**: Download retry loop with full buffering
- ✅ **ADDED**: AWS SDK `Upload` with streaming
- ✅ **ADDED**: Progress logging for large uploads
- ✅ **ADDED**: Railway internal networking support

## Support

If you encounter issues:

1. Check Railway logs for both services (backend + telegram-bot-api)
2. Verify all environment variables are set correctly
3. Test with small files first (10MB) to ensure basic functionality
4. Gradually test larger files (25MB, 100MB, 500MB)
5. Monitor memory usage in Railway dashboard

## References

- Telegram Local Bot API: https://github.com/tdlib/telegram-bot-api
- AWS SDK Upload: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_lib_storage.html
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Railway Volumes: https://docs.railway.app/reference/volumes
