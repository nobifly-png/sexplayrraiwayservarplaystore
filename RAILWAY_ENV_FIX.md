# 🔧 Railway Environment Variables - Fix Required

## ❌ Current Issues in Railway

### Issue 1: Wrong FRONTEND_URL
```env
# Current (WRONG):
FRONTEND_URL="https://sexplayrraiwayservarplaystore-production.up.railway.app"

# Should be (CORRECT):
FRONTEND_URL="https://www.zexgram.in"
```

**Why:** Password reset emails mein wrong link ja raha hai. Backend ki URL nahi, frontend ki URL chahiye.

---

### Issue 2: Wrong DEFAULT_EARNINGS_PER_VIEW
```env
# Current (WRONG):
DEFAULT_EARNINGS_PER_VIEW="0.13"

# Should be (CORRECT):
DEFAULT_EARNINGS_PER_VIEW="0.001"
```

**Why:** View counting system 4:1 ratio ke liye $0.001 per view chahiye, not $0.13

---

### Issue 3: Email Credentials May Be Invalid
```env
# Current:
EMAIL_USER="zexgram@gmail.com"
EMAIL_PASSWORD="ktjyvzbopbcctjf"
EMAIL_FROM_NAME="zexgram"
```

**Test Needed:** Ye credentials valid hain ya nahi check karna padega.

**Option 1:** Agar `zexgram@gmail.com` ka app password valid hai, toh theek hai  
**Option 2:** Agar invalid hai, toh `nitinchouhan@gmail.com` ka use karo

---

## ✅ Complete Railway Environment Variables (Copy-Paste Ready)

Railway dashboard mein jaake ye variables update karo:

```env
NODE_ENV=production
PORT=5000

# MongoDB
MONGODB_URI=mongodb+srv://thenitinchouhan01_db_user:YZtfPaeac8rzxs2I@cluster0.pk8jlko.mongodb.net/clipnova?appName=Cluster0

# JWT Secrets
JWT_ACCESS_SECRET=b9b36e161b9e4653de24ed8862596b1df9ac4873553d35d5ed1d3a8da9219fee9cdf3deeb70b1572b0e4cd7244fc0152
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=1d7f3bfcdfab2f84ec2cda844d7418037d4ce3121f7c2a94907f523cdb488a43bf39fcd1dbc550416dd35ab27d37c480
JWT_REFRESH_EXPIRES_IN=7d

# Cloudflare R2 Storage
R2_ACCOUNT_ID=9eb21a93fe24eb749b65eaa4252d2319
R2_ACCESS_KEY_ID=de0d2c8fcb991373d82e1513dd34bfb6
R2_SECRET_ACCESS_KEY=8868c5fde266154b3b31152f308d47385b284ad651e1e06675db789a790c5483
R2_BUCKET_NAME=clipnova
R2_ENDPOINT=https://9eb21a93fe24eb749b65eaa4252d2319.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://pub-11c2b603246a4f87b285e337ee6ad598.r2.dev
R2_REGION=auto

# CORS Configuration
CORS_ORIGIN=https://www.zexgram.in,http://localhost:5173,http://localhost:5175
ALLOWED_ORIGINS=https://www.zexgram.in,http://localhost:5173,http://localhost:5175

# Telegram Bot
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=8746932680:AAHNBa3jKNXLKlROROf3iwamKoI3Spr0pKg

# Super Admin
SUPER_ADMIN_ALLOWLIST=admin@zexgram.local

# Trust Proxy (Railway)
TRUST_PROXY=1

# System Settings (UPDATED VALUES)
DEFAULT_EARNINGS_PER_VIEW=0.001
MIN_WITHDRAWAL_AMOUNT=100
MAX_VIEWS_PER_IP_PER_HOUR=10
MIN_WATCH_SECONDS=5
MAX_UPLOAD_SIZE_BYTES=1073741824

# Frontend URL (CORRECTED)
FRONTEND_URL=https://www.zexgram.in

# Email Configuration (CHECK IF VALID)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=zexgram@gmail.com
EMAIL_PASSWORD=ktjyvzbopbcctjf
EMAIL_FROM_NAME=Zexgram
```

---

## 🔍 Email Configuration Test

### Option 1: Test Current Email (zexgram@gmail.com)

Pehle current email credentials test karo:

1. Railway logs check karo detailed error message ke liye
2. Agar error mein "Invalid credentials" ya "Authentication failed" dikhe, toh email invalid hai

### Option 2: Use Different Email

Agar `zexgram@gmail.com` ka password invalid hai, toh naya setup karo:

**Gmail App Password Setup:**

1. Go to: https://myaccount.google.com/security
2. Enable **2-Step Verification**
3. Go to: https://myaccount.google.com/apppasswords
4. Create app password for "Zexgram"
5. Copy 16-character password (e.g., `abcd efgh ijkl mnop`)
6. Update Railway:
   ```env
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=abcd efgh ijkl mnop
   ```

---

## 📝 Step-by-Step Railway Update Process

### Step 1: Open Railway Dashboard

1. Go to: https://railway.app
2. Login with your account
3. Select project: `sexplayrraiwayservarplaystore`

### Step 2: Update Variables

1. Click on your backend service
2. Go to **"Variables"** tab
3. Find and update these 3 variables:

```
FRONTEND_URL = https://www.zexgram.in
DEFAULT_EARNINGS_PER_VIEW = 0.001
ALLOWED_ORIGINS = https://www.zexgram.in,http://localhost:5173,http://localhost:5175
```

### Step 3: Optional - Update Email

If email is failing:

```
EMAIL_USER = your-valid-email@gmail.com
EMAIL_PASSWORD = your-16-char-app-password
EMAIL_FROM_NAME = Zexgram
```

### Step 4: Redeploy

Railway will automatically redeploy after variable changes. Wait ~2-3 minutes.

### Step 5: Test

1. Go to frontend: https://www.zexgram.in
2. Click "Forgot Password?"
3. Enter email: `nobifly@gmail.com`
4. Check Railway logs for success/error
5. Check email inbox

---

## 🐛 Debugging Railway Logs

### Check Logs After Variable Update

```bash
# In Railway dashboard, click "View Logs"
# Look for these messages:

✅ SUCCESS:
"Email transporter initialized successfully"
"Password reset email sent successfully"

❌ ERROR:
"Failed to initialize email transporter"
"Failed to send password reset email"
"Invalid login: 535-5.7.8 Username and Password not accepted"
```

### Common Error Messages

**Error 1: Invalid Credentials**
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```
**Solution:** Email credentials galat hain. App password regenerate karo.

**Error 2: Wrong Frontend URL**
```
Email sent with link: https://wrong-url.com/reset-password?token=...
```
**Solution:** FRONTEND_URL update karo.

**Error 3: SMTP Connection Failed**
```
Error: connect ETIMEDOUT
```
**Solution:** EMAIL_HOST, EMAIL_PORT check karo. `smtp.gmail.com:587` hona chahiye.

---

## ✅ After Railway Update - Test Checklist

1. **Frontend Test:**
   - [ ] Go to login page
   - [ ] Click "Forgot Password?"
   - [ ] Enter valid email
   - [ ] Should show success message

2. **Backend Logs Test:**
   - [ ] Check Railway logs
   - [ ] Should see "Password reset email sent successfully"
   - [ ] No error messages

3. **Email Test:**
   - [ ] Check email inbox
   - [ ] Should receive password reset email
   - [ ] Email subject: "Reset Your Password - Zexgram"
   - [ ] Link should point to Vercel frontend

4. **Reset Password Test:**
   - [ ] Click link in email
   - [ ] Should open reset password page on Vercel
   - [ ] Enter new password
   - [ ] Should successfully reset
   - [ ] Should redirect to login
   - [ ] Login with new password should work

5. **View Counting Test:**
   - [ ] Login to dashboard
   - [ ] Check analytics
   - [ ] Earnings should show 3 decimals ($0.001, $0.002)
   - [ ] View counts should be fractional (0.25, 0.50, 125.75)

---

## 🚨 Critical Variables Summary

| Variable | Current (WRONG) | Should Be (CORRECT) | Priority |
|----------|----------------|---------------------|----------|
| `FRONTEND_URL` | Railway URL | Vercel URL | 🔴 HIGH |
| `DEFAULT_EARNINGS_PER_VIEW` | 0.13 | 0.001 | 🔴 HIGH |
| `EMAIL_USER` | zexgram@gmail.com | Test if valid | 🟡 MEDIUM |
| `EMAIL_PASSWORD` | ktjyvzbopbcctjf | Test if valid | 🟡 MEDIUM |
| `ALLOWED_ORIGINS` | Missing localhost:5173 | Add it | 🟢 LOW |

---

## 📧 Quick Email Test Command

After updating Railway, test email manually:

**Using cURL:**
```bash
curl -X POST https://sexplayrraiwayservarplaystore.up.railway.app/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"nobifly@gmail.com"}'
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "If the email exists, a password reset link has been sent to your email"
}
```

**Check Railway Logs:**
Should see: `Password reset email sent successfully`

---

## 🎯 Final Checklist

Before testing:

- [ ] Update `FRONTEND_URL` to Vercel URL
- [ ] Update `DEFAULT_EARNINGS_PER_VIEW` to 0.001
- [ ] Update `ALLOWED_ORIGINS` to include localhost:5173
- [ ] Verify email credentials are valid
- [ ] Wait for Railway redeploy (2-3 min)
- [ ] Check Railway logs for errors
- [ ] Test forgot password from frontend
- [ ] Verify email received
- [ ] Test complete reset flow

---

## 📞 Support

If email still fails after all fixes:

1. **Check Railway logs** for exact error message
2. **Verify Gmail settings:**
   - 2FA enabled
   - App password generated (not regular password)
   - Less secure apps setting (not needed with app password)
3. **Try different email service** (optional):
   - Use different Gmail account
   - Or use SendGrid/Mailgun/AWS SES

---

**Update these 3 variables in Railway and password reset will work!** 🚀

**Priority Order:**
1. ✅ FRONTEND_URL (most important)
2. ✅ DEFAULT_EARNINGS_PER_VIEW (for view counting)
3. ✅ Verify EMAIL credentials (test if working)
