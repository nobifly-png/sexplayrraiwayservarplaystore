# Render Deployment Guide

## Service Type
**Web Service** (not Static Site, not Background Worker)

## Build & Start

| Setting | Value |
|---|---|
| Build Command | `npm install` |
| Start Command | `node src/server.js` |
| Node Version | 18 (set in Render dashboard → Environment → Node version) |

## Required Environment Variables

Set all of these in Render Dashboard → Environment:

```
NODE_ENV=production
APP_URL=https://your-service-name.onrender.com

MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/clipnova

JWT_ACCESS_SECRET=<min 32 char random hex>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<min 32 char random hex — different from access secret>
JWT_REFRESH_EXPIRES_IN=7d

R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret key>
R2_BUCKET_NAME=<bucket name>
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://<your-public-r2-domain>
R2_REGION=auto

CORS_ORIGIN=https://your-frontend-domain.com

TRUST_PROXY=1

SUPER_ADMIN_ALLOWLIST=<your-admin-email@domain.com>
```

> Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Optional Variables

```
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
ADMIN_RATE_LIMIT_MAX=120
WITHDRAWAL_RATE_LIMIT_MAX=40
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_ENABLED=false
```

## Health Check

Render health check URL: `https://your-service.onrender.com/api/health`

Set in Render Dashboard → Health & Alerts → Health Check Path: `/api/health`

## Post-Deploy: Seed Database

Run once via Render Shell (Dashboard → Shell):

```bash
node scripts/seedSuperAdmin.js
node scripts/seedSettings.js
```

## Notes

- `PORT` is set automatically by Render — do NOT set it manually
- `TRUST_PROXY=1` is required so rate limiting and fraud detection use the real client IP
- `NODE_ENV=production` enables production-safe error responses and disables pino-pretty
- MongoDB must allow connections from Render's IPs (use Atlas → Network Access → Allow from anywhere: `0.0.0.0/0`, or use Render's static outbound IPs if on a paid plan)
