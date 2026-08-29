# 📧 Gmail OAuth2 Setup Guide for Zexgram

Complete step-by-step guide to setup Gmail API with OAuth2 for sending password reset emails.

---

## 🎯 Overview

This guide will help you get these 3 credentials from Google Cloud Console:
1. **GMAIL_CLIENT_ID** (OAuth2 Client ID)
2. **GMAIL_CLIENT_SECRET** (OAuth2 Client Secret)
3. **GMAIL_REFRESH_TOKEN** (Refresh Token)

**Total Time:** ~15 minutes

---

## 📋 Step 1: Create Google Cloud Project (5 min)

### 1.1 Go to Google Cloud Console
- Open: https://console.cloud.google.com/
- Sign in with your **zexgram@gmail.com** account

### 1.2 Create New Project
1. Click **"Select a project"** (top bar)
2. Click **"NEW PROJECT"**
3. Enter details:
   - **Project name:** `Zexgram Email`
   - **Location:** No organization
4. Click **"CREATE"**
5. Wait 10-15 seconds for project creation

### 1.3 Select Your Project
- Click **"Select a project"** again
- Choose **"Zexgram Email"** from the list

---

## 📬 Step 2: Enable Gmail API (2 min)

### 2.1 Enable API
1. In Google Cloud Console, click **"☰ Menu"** (top left)
2. Go to: **APIs & Services** → **Library**
3. Search: `Gmail API`
4. Click **"Gmail API"**
5. Click **"ENABLE"**
6. Wait for API to enable (~5 seconds)

---

## 🔐 Step 3: Create OAuth2 Credentials (5 min)

### 3.1 Configure OAuth Consent Screen
1. Go to: **APIs & Services** → **OAuth consent screen**
2. Select **"External"** (unless you have Google Workspace)
3. Click **"CREATE"**

4. Fill in **App information:**
   - **App name:** `Zexgram`
   - **User support email:** `zexgram@gmail.com`
   - **App logo:** (optional - skip for now)
   - **App domain:** (leave empty)
   - **Authorized domains:** (leave empty)
   - **Developer contact email:** `zexgram@gmail.com`
5. Click **"SAVE AND CONTINUE"**

6. **Scopes** screen:
   - Click **"ADD OR REMOVE SCOPES"**
   - Search: `gmail.send`
   - Check: ✅ `.../auth/gmail.send` (Send email on your behalf)
   - Click **"UPDATE"**
   - Click **"SAVE AND CONTINUE"**

7. **Test users** screen:
   - Click **"+ ADD USERS"**
   - Enter: `zexgram@gmail.com`
   - Click **"ADD"**
   - Click **"SAVE AND CONTINUE"**

8. **Summary** screen:
   - Review and click **"BACK TO DASHBOARD"**

### 3.2 Create OAuth2 Client ID
1. Go to: **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"**
3. Select **"OAuth client ID"**
4. Configure:
   - **Application type:** `Web application`
   - **Name:** `Zexgram Backend`
   - **Authorized redirect URIs:** Click **"+ ADD URI"**
     - Add: `https://developers.google.com/oauthplayground`
5. Click **"CREATE"**

6. **✅ SAVE THESE VALUES:**
   ```
   GMAIL_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=your_client_secret_here
   ```
   - Copy both values to a text file
   - Click **"OK"**

---

## 🎫 Step 4: Get Refresh Token (3 min)

### 4.1 OAuth 2.0 Playground Setup
1. Open: https://developers.google.com/oauthplayground/
2. Click **⚙️ Settings** icon (top right)
3. Check: ✅ **"Use your own OAuth credentials"**
4. Enter:
   - **OAuth Client ID:** (paste from Step 3.2)
   - **OAuth Client secret:** (paste from Step 3.2)
5. Click **"Close"**

### 4.2 Authorize Gmail API
1. In **Step 1** on left:
   - Scroll to **"Gmail API v1"**
   - Check: ✅ `https://mail.google.com/` (Full Gmail access)
   - **OR** Check: ✅ `https://www.googleapis.com/auth/gmail.send` (Send only)
2. Click **"Authorize APIs"**

3. **Google Sign-in:**
   - Select **zexgram@gmail.com** account
   - Click **"Continue"** on warning (app not verified)
   - Click **"Continue"** again
   - Select: ✅ **"Send email on your behalf"**
   - Click **"Continue"**

### 4.3 Get Refresh Token
1. You'll be back at OAuth Playground
2. Click **"Exchange authorization code for tokens"** (Step 2)
3. **✅ COPY THIS:**
   ```
   GMAIL_REFRESH_TOKEN=1//your_refresh_token_here
   ```
   - Copy the **"Refresh token"** value
   - Save it in your text file

---

## 🚀 Step 5: Add to Railway Environment Variables

Go to **Railway** → Your Project → **Variables** tab

### Add these 4 variables:

```bash
# Gmail OAuth2 Credentials
GMAIL_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=1//your_refresh_token_here
GMAIL_USER=zexgram@gmail.com
```

**✅ Remove these old variables (if present):**
```bash
# Delete or comment out:
# EMAIL_PROVIDER=resend
# RESEND_API_KEY=re_xxx
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_SECURE=false
# EMAIL_PASSWORD=xxx
```

---

## 🧪 Step 6: Test Email Sending

### 6.1 Wait for Railway Deployment
- Railway will auto-deploy after adding variables
- Wait for **"Deployment Successful"** (~1-2 minutes)

### 6.2 Test Forgot Password
1. Go to: https://clipnovawebistefronendvarsel-gyum.vercel.app/forgot-password
2. Enter: `biharilal9279@gmail.com` (or any registered email)
3. Click **"Send Reset Link"**
4. **Check email inbox** (should arrive in 5-30 seconds)
5. **Check spam folder** (if not in inbox)

### 6.3 Check Railway Logs
```bash
# Look for:
✅ Password reset email sent successfully via Gmail API
{ email: 'biharilal9279@gmail.com', messageId: '18a...', threadId: '18a...' }
```

---

## 🔧 Complete Railway Environment Variables

**Copy this complete config to Railway:**

```bash
NODE_ENV=production
PORT=5000

# MongoDB
MONGODB_URI=mongodb+srv://thenitinchouhan01_db_user:YZtfPaeac8rzxs2I@cluster0.pk8jlko.mongodb.net/clipnova?appName=Cluster0

# JWT
JWT_ACCESS_SECRET=b9b36e161b9e4653de24ed8862596b1df9ac4873553d35d5ed1d3a8da9219fee9cdf3deeb70b1572b0e4cd7244fc0152
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=1d7f3bfcdfab2f84ec2cda844d7418037d4ce3121f7c2a94907f523cdb488a43bf39fcd1dbc550416dd35ab27d37c480
JWT_REFRESH_EXPIRES_IN=7d

# Cloudflare R2
R2_ACCOUNT_ID=9eb21a93fe24eb749b65eaa4252d2319
R2_ACCESS_KEY_ID=de0d2c8fcb991373d82e1513dd34bfb6
R2_SECRET_ACCESS_KEY=8868c5fde266154b3b31152f308d47385b284ad651e1e06675db789a790c5483
R2_BUCKET_NAME=clipnova
R2_ENDPOINT=https://9eb21a93fe24eb749b65eaa4252d2319.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://pub-11c2b603246a4f87b285e337ee6ad598.r2.dev
R2_REGION=auto

# CORS
CORS_ORIGIN=https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175
ALLOWED_ORIGINS=https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175

# Admin
SUPER_ADMIN_ALLOWLIST=admin@clipnova.local

# Telegram Bot
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=8746932680:AAHNBa3jKNXLKlROROf3iwamKoI3Spr0pKg

# App Settings
TRUST_PROXY=1
DEFAULT_EARNINGS_PER_VIEW=0.001
MIN_WITHDRAWAL_AMOUNT=100
MAX_VIEWS_PER_IP_PER_HOUR=10
MIN_WATCH_SECONDS=5
MAX_UPLOAD_SIZE_BYTES=1073741824

# Frontend URL
FRONTEND_URL=https://clipnovawebistefronendvarsel-gyum.vercel.app

# 📧 Gmail OAuth2 (NEW!)
GMAIL_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=1//your_refresh_token_here
GMAIL_USER=zexgram@gmail.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=50
ADMIN_RATE_LIMIT_MAX=200
WITHDRAWAL_RATE_LIMIT_MAX=40
```

---

## 🆘 Troubleshooting

### Error: "invalid_grant" in Railway logs
**Solution:** Refresh token expired. Get a new one from OAuth Playground (Step 4)

### Error: "Access blocked: This app's request is invalid"
**Solution:** 
1. Add `zexgram@gmail.com` to **Test users** in OAuth consent screen
2. OR Publish your app (change from Testing to Production)

### Error: "The OAuth client was not found"
**Solution:** Check GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are correct

### Email not arriving
**Solutions:**
1. Check Gmail **"Sent"** folder
2. Check **spam** folder in recipient email
3. Wait 1-2 minutes (Gmail API can be slow)
4. Check Railway logs for actual error message

### Error: "Daily sending limit exceeded"
**Solution:** Gmail API has daily limits:
- **Testing mode:** 100 emails/day
- **Production mode:** 500 emails/day (after app verification)

---

## 📊 Gmail OAuth2 vs SMTP Comparison

| Feature | OAuth2 (This Guide) | SMTP (Old) |
|---------|-------------------|------------|
| Security | ⭐⭐⭐⭐⭐ (Best) | ⭐⭐⭐ (App Password) |
| Setup | 15 min | 5 min |
| Deliverability | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Token Expiry | Refresh token works forever | App password can be revoked |
| Rate Limit | 100/day (test), 500/day (prod) | 500/day |
| Reliability | Very High | Medium |

---

## ✅ Success Checklist

- [ ] Google Cloud project created
- [ ] Gmail API enabled
- [ ] OAuth consent screen configured
- [ ] OAuth2 Client ID created
- [ ] CLIENT_ID and CLIENT_SECRET copied
- [ ] Refresh token obtained from OAuth Playground
- [ ] All 4 variables added to Railway
- [ ] Railway deployment successful
- [ ] Test email sent and received
- [ ] Railway logs show success message

---

**🎉 Done! Gmail OAuth2 is now working!**

*For issues, check Railway logs for detailed error messages.*
