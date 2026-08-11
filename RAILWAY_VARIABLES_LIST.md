# 📋 Railway Environment Variables - Individual Format

## Method 1: Copy Entire Block (Recommended)

Railway dashboard mein "Raw Editor" mode use karo aur ye pura block paste karo:

```
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://thenitinchouhan01_db_user:YZtfPaeac8rzxs2I@cluster0.pk8jlko.mongodb.net/clipnova?appName=Cluster0
JWT_ACCESS_SECRET=b9b36e161b9e4653de24ed8862596b1df9ac4873553d35d5ed1d3a8da9219fee9cdf3deeb70b1572b0e4cd7244fc0152
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=1d7f3bfcdfab2f84ec2cda844d7418037d4ce3121f7c2a94907f523cdb488a43bf39fcd1dbc550416dd35ab27d37c480
JWT_REFRESH_EXPIRES_IN=7d
R2_ACCOUNT_ID=9eb21a93fe24eb749b65eaa4252d2319
R2_ACCESS_KEY_ID=de0d2c8fcb991373d82e1513dd34bfb6
R2_SECRET_ACCESS_KEY=8868c5fde266154b3b31152f308d47385b284ad651e1e06675db789a790c5483
R2_BUCKET_NAME=clipnova
R2_ENDPOINT=https://9eb21a93fe24eb749b65eaa4252d2319.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://pub-11c2b603246a4f87b285e337ee6ad598.r2.dev
R2_REGION=auto
CORS_ORIGIN=https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175
ALLOWED_ORIGINS=https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175
SUPER_ADMIN_ALLOWLIST=admin@clipnova.local
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=8746932680:AAHNBa3jKNXLKlROROf3iwamKoI3Spr0pKg
TRUST_PROXY=1
DEFAULT_EARNINGS_PER_VIEW=0.001
MIN_WITHDRAWAL_AMOUNT=100
MAX_VIEWS_PER_IP_PER_HOUR=10
MIN_WATCH_SECONDS=5
MAX_UPLOAD_SIZE_BYTES=1073741824
FRONTEND_URL=https://clipnovawebistefronendvarsel-gyum.vercel.app
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=zexgram@gmail.com
EMAIL_PASSWORD=ktjyvzbopbcctjf
EMAIL_FROM_NAME=ClipNova
```

---

## Method 2: Update Only Changed Variables (Quick Fix)

Agar sirf 3 variables update karne hain:

### Variable 1: FRONTEND_URL
```
Variable Name: FRONTEND_URL
Variable Value: https://clipnovawebistefronendvarsel-gyum.vercel.app
```

### Variable 2: DEFAULT_EARNINGS_PER_VIEW
```
Variable Name: DEFAULT_EARNINGS_PER_VIEW
Variable Value: 0.001
```

### Variable 3: ALLOWED_ORIGINS
```
Variable Name: ALLOWED_ORIGINS
Variable Value: https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175
```

---

## Method 3: Individual Variables (If Adding One-by-One)

### 1. Server Configuration
```
NODE_ENV=production
PORT=5000
TRUST_PROXY=1
```

### 2. Database
```
MONGODB_URI=mongodb+srv://thenitinchouhan01_db_user:YZtfPaeac8rzxs2I@cluster0.pk8jlko.mongodb.net/clipnova?appName=Cluster0
```

### 3. JWT Secrets
```
JWT_ACCESS_SECRET=b9b36e161b9e4653de24ed8862596b1df9ac4873553d35d5ed1d3a8da9219fee9cdf3deeb70b1572b0e4cd7244fc0152
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=1d7f3bfcdfab2f84ec2cda844d7418037d4ce3121f7c2a94907f523cdb488a43bf39fcd1dbc550416dd35ab27d37c480
JWT_REFRESH_EXPIRES_IN=7d
```

### 4. Cloudflare R2 Storage
```
R2_ACCOUNT_ID=9eb21a93fe24eb749b65eaa4252d2319
R2_ACCESS_KEY_ID=de0d2c8fcb991373d82e1513dd34bfb6
R2_SECRET_ACCESS_KEY=8868c5fde266154b3b31152f308d47385b284ad651e1e06675db789a790c5483
R2_BUCKET_NAME=clipnova
R2_ENDPOINT=https://9eb21a93fe24eb749b65eaa4252d2319.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://pub-11c2b603246a4f87b285e337ee6ad598.r2.dev
R2_REGION=auto
```

### 5. CORS Configuration
```
CORS_ORIGIN=https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175
ALLOWED_ORIGINS=https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175
```

### 6. Super Admin
```
SUPER_ADMIN_ALLOWLIST=admin@clipnova.local
```

### 7. Telegram Bot
```
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=8746932680:AAHNBa3jKNXLKlROROf3iwamKoI3Spr0pKg
```

### 8. System Settings (UPDATED - IMPORTANT!)
```
DEFAULT_EARNINGS_PER_VIEW=0.001
MIN_WITHDRAWAL_AMOUNT=100
MAX_VIEWS_PER_IP_PER_HOUR=10
MIN_WATCH_SECONDS=5
MAX_UPLOAD_SIZE_BYTES=1073741824
```

### 9. Frontend URL (CORRECTED - IMPORTANT!)
```
FRONTEND_URL=https://clipnovawebistefronendvarsel-gyum.vercel.app
```

### 10. Email Configuration
```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=zexgram@gmail.com
EMAIL_PASSWORD=ktjyvzbopbcctjf
EMAIL_FROM_NAME=ClipNova
```

---

## 🚀 How to Apply in Railway

### Option A: Raw Editor (Fastest - RECOMMENDED)

1. Go to Railway dashboard
2. Click on your backend service
3. Click **"Variables"** tab
4. Click **"RAW Editor"** button (top right)
5. **Delete all existing content**
6. **Paste** the complete block from Method 1 above
7. Click **"Save"**
8. Railway will auto-redeploy (2-3 minutes)

### Option B: Individual Variable Update

1. Go to Railway dashboard
2. Click on your backend service
3. Click **"Variables"** tab
4. Find each variable by name
5. Click to edit
6. Update value
7. Save

Update these 3 critical variables:
- `FRONTEND_URL`
- `DEFAULT_EARNINGS_PER_VIEW`
- `ALLOWED_ORIGINS`

---

## ✅ After Update - Verify

### Check 1: Railway Logs
```
✅ Should see: "Email transporter initialized successfully"
✅ Should see: "Server listening on port 5000"
❌ Should NOT see: "Email credentials not configured"
```

### Check 2: Test Password Reset
1. Go to: https://clipnovawebistefronendvarsel-gyum.vercel.app/login
2. Click "Forgot Password?"
3. Enter: nobifly@gmail.com
4. Should see: "Reset link sent to your email"

### Check 3: Check Email
- Email subject: "Reset Your Password - ClipNova"
- Email from: "ClipNova <zexgram@gmail.com>"
- Link should start with: https://clipnovawebistefronendvarsel-gyum.vercel.app/reset-password?token=...

---

## ⚠️ Important Notes

### Frontend URL (CRITICAL)
**OLD (WRONG):**
```
FRONTEND_URL=https://sexplayrraiwayservarplaystore-production.up.railway.app
```

**NEW (CORRECT):**
```
FRONTEND_URL=https://clipnovawebistefronendvarsel-gyum.vercel.app
```

This is the most important change! Password reset emails must link to frontend, not backend.

### Earnings Rate (CRITICAL)
**OLD (WRONG):**
```
DEFAULT_EARNINGS_PER_VIEW=0.13
```

**NEW (CORRECT):**
```
DEFAULT_EARNINGS_PER_VIEW=0.001
```

This enables the 4:1 view counting system ($4 per 1000 counted views).

### Email Password (CHECK IF VALID)
```
EMAIL_USER=zexgram@gmail.com
EMAIL_PASSWORD=ktjyvzbopbcctjf
```

If email fails after update:
1. Check Railway logs for "Invalid credentials"
2. Generate new Gmail App Password
3. Update EMAIL_PASSWORD variable

---

## 📞 Troubleshooting

### If Email Still Fails

**Error in Logs:**
```
Failed to send password reset email
Invalid login: 535-5.7.8 Username and Password not accepted
```

**Solution:**
1. Go to: https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Go to: https://myaccount.google.com/apppasswords
4. Create new app password for "ClipNova"
5. Update in Railway:
   ```
   EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
   ```

### If CORS Error Occurs

**Error in Frontend:**
```
Access blocked by CORS policy
```

**Solution:**
Verify `ALLOWED_ORIGINS` includes Vercel URLs:
```
ALLOWED_ORIGINS=https://clipnovawebistefronendvarsel-gyum.vercel.app,https://clipnovawebistefronendvarsel-ayfe2t14r.vercel.app,http://localhost:5173,http://localhost:5175
```

---

## 🎯 Quick Summary

**Copy this entire block to Railway Raw Editor:**

See **RAILWAY_ENV_COMPLETE.txt** file in project root.

**Or update only these 3 variables:**
1. `FRONTEND_URL` → Vercel URL
2. `DEFAULT_EARNINGS_PER_VIEW` → 0.001
3. `ALLOWED_ORIGINS` → Include all Vercel domains

**Then wait 2-3 minutes for Railway to redeploy.**

**Test password reset and you're done!** ✅
