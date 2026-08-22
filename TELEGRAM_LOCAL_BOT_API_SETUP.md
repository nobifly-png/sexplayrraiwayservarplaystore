# Telegram Local Bot API Setup Guide

This guide will help you setup Telegram Local Bot API Server to support files up to **2GB** (vs standard 20MB limit).

## 🎯 Why Local Bot API?

**Standard Telegram Bot API:**
- ❌ 20MB file download limit
- ❌ 50MB file upload limit

**Local Bot API Server:**
- ✅ **2GB** file download/upload limit
- ✅ Faster file handling
- ✅ No external rate limits

---

## 📋 Prerequisites

Your Telegram App credentials (already have):
```
API_ID: 39393207
API_HASH: 3c4a53eb3ab8d184bfdbd12acb519b98
```

Your Bot Token from @BotFather (get from Telegram)

---

## 🐳 Option 1: Docker Setup (Recommended)

### Step 1: Install Docker

**Ubuntu/Debian:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**Railway/VPS:** Most providers have Docker pre-installed

### Step 2: Run Local Bot API Server

```bash
docker run -d \
  --name telegram-bot-api \
  --restart=always \
  -p 8081:8081 \
  -e TELEGRAM_API_ID=39393207 \
  -e TELEGRAM_API_HASH=3c4a53eb3ab8d184bfdbd12acb519b98 \
  -v telegram-bot-api-data:/var/lib/telegram-bot-api \
  aiogram/telegram-bot-api:latest
```

**Parameters explained:**
- `-p 8081:8081` - Expose port 8081 (you can change this)
- `-e TELEGRAM_API_ID` - Your app ID
- `-e TELEGRAM_API_HASH` - Your app hash
- `-v telegram-bot-api-data` - Persistent storage for downloaded files
- `--restart=always` - Auto-restart on server reboot

### Step 3: Verify Server is Running

```bash
# Check if container is running
docker ps | grep telegram-bot-api

# Check logs
docker logs telegram-bot-api

# Test API endpoint
curl http://localhost:8081/healthz
```

You should see logs like:
```
Telegram Bot API server is running
Listening on port 8081
```

### Step 4: Update Your .env File

Add these lines to your `.env`:

```env
# Telegram Local Bot API (for files > 20MB up to 2GB)
TELEGRAM_USE_LOCAL_API=true
TELEGRAM_LOCAL_API_URL=http://localhost:8081
```

**Important:** 
- If Bot API server is on a different machine, use that IP: `http://192.168.1.100:8081`
- If using Docker network, use container name: `http://telegram-bot-api:8081`

### Step 5: Restart Your Backend

```bash
# PM2
pm2 restart zexgram-backend

# Docker
docker-compose restart backend

# Direct
npm start
```

### Step 6: Test Large File Upload

1. Send a video **> 20MB** to your bot
2. Check logs: `docker logs telegram-bot-api -f`
3. Should see download activity
4. Bot should successfully upload to R2

---

## 🔧 Option 2: Manual Compilation (Advanced)

Only use this if Docker is not available.

### Requirements
- CMake 3.0.2+
- C++14 compiler (gcc 4.9+, clang 3.4+)
- OpenSSL
- zlib

### Ubuntu/Debian

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y \
  make git zlib1g-dev libssl-dev gperf cmake g++

# Clone Telegram Bot API source
git clone --recursive https://github.com/tdlib/telegram-bot-api.git
cd telegram-bot-api

# Build
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --target install

# Run server
telegram-bot-api \
  --api-id=39393207 \
  --api-hash=3c4a53eb3ab8d184bfdbd12acb519b98 \
  --local \
  --http-port=8081
```

### Create systemd service

```bash
sudo nano /etc/systemd/system/telegram-bot-api.service
```

```ini
[Unit]
Description=Telegram Bot API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/lib/telegram-bot-api
ExecStart=/usr/local/bin/telegram-bot-api \
  --api-id=39393207 \
  --api-hash=3c4a53eb3ab8d184bfdbd12acb519b98 \
  --local \
  --http-port=8081
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable telegram-bot-api
sudo systemctl start telegram-bot-api
sudo systemctl status telegram-bot-api
```

---

## 🌐 Railway/Render Deployment

### Railway

**Option A: Separate Service (Recommended)**

1. Create new Railway service
2. Use Docker image:
   ```
   Image: aiogram/telegram-bot-api:latest
   ```
3. Add environment variables:
   ```
   TELEGRAM_API_ID=39393207
   TELEGRAM_API_HASH=3c4a53eb3ab8d184bfdbd12acb519b98
   ```
4. Expose port: `8081`
5. Get internal URL (e.g., `telegram-bot-api.railway.internal:8081`)
6. Update main backend `.env`:
   ```env
   TELEGRAM_USE_LOCAL_API=true
   TELEGRAM_LOCAL_API_URL=http://telegram-bot-api.railway.internal:8081
   ```

**Option B: docker-compose (if Railway supports)**

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  telegram-bot-api:
    image: aiogram/telegram-bot-api:latest
    restart: always
    ports:
      - "8081:8081"
    environment:
      TELEGRAM_API_ID: 39393207
      TELEGRAM_API_HASH: 3c4a53eb3ab8d184bfdbd12acb519b98
    volumes:
      - telegram-data:/var/lib/telegram-bot-api

  backend:
    build: .
    restart: always
    ports:
      - "5000:5000"
    environment:
      TELEGRAM_USE_LOCAL_API: "true"
      TELEGRAM_LOCAL_API_URL: "http://telegram-bot-api:8081"
    depends_on:
      - telegram-bot-api
    env_file:
      - .env

volumes:
  telegram-data:
```

### Render

Similar to Railway - deploy as separate Web Service with Docker image.

---

## 🔍 Troubleshooting

### Bot still shows 20MB limit error

**Check 1:** Is Local API server running?
```bash
docker ps | grep telegram-bot-api
# or
systemctl status telegram-bot-api
```

**Check 2:** Is .env updated?
```bash
cat .env | grep TELEGRAM_USE_LOCAL_API
# Should show: TELEGRAM_USE_LOCAL_API=true
```

**Check 3:** Backend restarted after .env update?
```bash
pm2 restart zexgram-backend
```

**Check 4:** Can backend reach Local API?
```bash
# From backend container/server
curl http://localhost:8081/healthz
```

### Connection refused error

**Problem:** Backend can't connect to Local API server

**Solution 1:** Use correct URL
- Same machine: `http://localhost:8081`
- Docker network: `http://telegram-bot-api:8081`
- Different machine: `http://192.168.1.100:8081`

**Solution 2:** Check firewall
```bash
sudo ufw allow 8081
```

### Large files still timing out

**Problem:** Download timeout for huge files (>500MB)

**Solution:** Increase timeout in code (already done in `upload.pipeline.js`):
```javascript
const DOWNLOAD_TIMEOUT = 600000; // 10 minutes
```

### Memory issues with large files

**Problem:** Server crashes on large file downloads

**Solution:** Increase Docker/Node memory:
```bash
# Docker
docker run -d --memory=2g ...

# Node
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

---

## 📊 Monitoring

### Docker logs
```bash
docker logs telegram-bot-api -f
```

### Check download progress
```bash
docker stats telegram-bot-api
```

### Backend logs
Check backend logs for "Pipeline: using Local Bot API" messages

---

## 🔐 Security Notes

1. **Don't expose Local API publicly** - Only backend should access it
2. **Use internal networking** when possible (Docker networks, private IPs)
3. **Firewall rules**: Block port 8081 from external access
4. **API credentials**: Keep `api_id` and `api_hash` secret

---

## ✅ Testing Checklist

- [ ] Docker/service running: `docker ps` or `systemctl status`
- [ ] Health check passes: `curl http://localhost:8081/healthz`
- [ ] .env updated with `TELEGRAM_USE_LOCAL_API=true`
- [ ] Backend restarted
- [ ] Send 15MB file → ✅ Works
- [ ] Send 25MB file → ✅ Works (would fail before)
- [ ] Send 100MB file → ✅ Works
- [ ] Check logs: "using Local Bot API" messages appear

---

## 📚 Resources

- [Telegram Bot API Server GitHub](https://github.com/tdlib/telegram-bot-api)
- [Docker Image](https://hub.docker.com/r/aiogram/telegram-bot-api)
- [Official Docs](https://core.telegram.org/bots/api#using-a-local-bot-api-server)

---

## 🎉 Success!

After setup, your bot will support:
- ✅ Files up to **2GB** (vs 20MB)
- ✅ Faster downloads
- ✅ No external API rate limits

Questions? Check troubleshooting section or contact support.
