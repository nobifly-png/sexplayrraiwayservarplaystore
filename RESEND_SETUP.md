# 📧 Resend Email Setup for Zexgram

## ✅ Why Resend?

- **100 emails per day FREE** (3,000/month)
- **Better deliverability** (emails don't go to spam)
- **5-minute setup** (vs Gmail's complex OAuth)
- **No app passwords** needed
- **Real-time tracking & analytics**

---

## 🚀 Step-by-Step Setup

### Step 1: Create Resend Account (2 minutes)

1. Go to **https://resend.com**
2. Click **"Sign Up"**
3. Enter your email and create password
4. **Verify your email** (check inbox)
5. Login to Resend dashboard

---

### Step 2: Get API Key (1 minute)

1. In Resend dashboard, go to **"API Keys"** tab
2. Click **"Create API Key"**
3. Name: `Zexgram Production`
4. **Copy the API key** (looks like: `re_123abc456def...`)
   - ⚠️ **IMPORTANT:** Save it now! You won't see it again.

---

### Step 3: Update Railway Environment Variables (2 minutes)

Go to your **Railway project** → **Variables** tab and add:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
```

**Remove or keep these (optional):**
```bash
# These are no longer needed with Resend, but keep them as backup
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=zexgram@gmail.com
EMAIL_PASSWORD=sfosoalnhmmaljya
EMAIL_FROM_NAME=zexgram
```

---

### Step 4: Railway Will Auto-Deploy (1-2 minutes)

- Railway automatically detects env variable changes
- Backend will redeploy
- Wait for **"Deployment Successful"** message
- Check Railway logs for: `✅ Password reset email sent via Resend`

---

## 🧪 Testing

### Test 1: Forgot Password Flow

1. Go to: https://clipnovawebistefronendvarsel-gyum.vercel.app/forgot-password
2. Enter: `biharilal9279@gmail.com` (or any registered email)
3. Click **"Send Reset Link"**
4. ✅ **Check email inbox** (should arrive in 5-10 seconds)
5. ✅ **Check spam folder** (if not in inbox)

### Test 2: Railway Logs

```bash
# Look for this in Railway logs:
✅ Password reset email sent via Resend
{ email: 'biharilal9279@gmail.com', messageId: 're_abc123...' }
```

---

## 🔧 Complete Railway Environment Variables

**Copy-paste this complete config:**

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

# 🆕 Resend Email (NEW!)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here

# 📧 Gmail SMTP (Backup - optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=zexgram@gmail.com
EMAIL_PASSWORD=sfosoalnhmmaljya
EMAIL_FROM_NAME=zexgram

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=50
ADMIN_RATE_LIMIT_MAX=200
WITHDRAWAL_RATE_LIMIT_MAX=40
```

---

## 🆘 Troubleshooting

### Problem: Email still not arriving

**Solution 1: Check Resend Dashboard**
1. Go to Resend dashboard → **"Emails"** tab
2. Look for your email in the list
3. Check status: `Delivered` / `Bounced` / `Failed`

**Solution 2: Check Railway Logs**
```bash
# Look for errors:
❌ Resend email sending failed
❌ RESEND_API_KEY not configured
```

**Solution 3: Verify API Key**
- Make sure API key starts with `re_`
- No spaces before/after the key
- Key is not expired

**Solution 4: Check spam folder**
- Resend uses `onboarding@resend.dev` as sender
- First emails might go to spam

---

## 📊 Resend vs Gmail Comparison

| Feature | Resend | Gmail SMTP |
|---------|--------|------------|
| Setup Time | 5 min | 30+ min |
| Deliverability | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Daily Limit | 100 emails | 500 emails |
| Spam Rate | Very Low | Medium |
| API Key | Simple | Complex OAuth |
| Dashboard | Yes | No |
| Email Tracking | Yes | No |
| Cost | FREE | FREE |

---

## 📚 Resend Resources

- **Dashboard:** https://resend.com/dashboard
- **Documentation:** https://resend.com/docs
- **API Reference:** https://resend.com/docs/api-reference/emails/send-email
- **Pricing:** https://resend.com/pricing

---

## ✅ Success Checklist

- [ ] Resend account created
- [ ] Email verified
- [ ] API key generated and saved
- [ ] `EMAIL_PROVIDER=resend` added to Railway
- [ ] `RESEND_API_KEY=re_xxx` added to Railway
- [ ] Railway deployment successful
- [ ] Test email sent from forgot password page
- [ ] Email received in inbox (check spam too)
- [ ] Railway logs show `✅ Password reset email sent via Resend`

---

**🎉 Done! Your email system is now working with Resend!**

*If you still face issues, check Railway logs or Resend dashboard for detailed error messages.*
