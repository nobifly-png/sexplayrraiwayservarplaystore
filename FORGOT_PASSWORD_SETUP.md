# 🔐 Forgot Password Setup - Quick Guide

## ✅ What's Implemented

Complete email-based password reset system with secure link delivery!

---

## 📧 Email Setup (5 Minutes)

### Step 1: Get Gmail App Password

1. **Enable 2-Factor Authentication:**
   - Go to: https://myaccount.google.com/security
   - Turn on "2-Step Verification"

2. **Generate App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - App: "Mail"
   - Device: "Other (Custom name)" → Type "ClipNova"
   - Click "Generate"
   - Copy the **16-character password** (e.g., `abcd efgh ijkl mnop`)

### Step 2: Update .env File

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
EMAIL_FROM_NAME=ClipNova
```

**⚠️ Important:** Use the 16-character App Password, NOT your Gmail password!

---

## 🔄 Complete Flow

### Backend Flow:
```
1. POST /api/auth/forgot-password
   Body: { "email": "user@example.com" }
   
2. ✅ Backend generates secure token (32 bytes)
   
3. ✅ Email sent with reset link
   Link: https://frontend-url/reset-password?token=abc123xyz
   
4. ✅ Professional HTML email delivered to user's inbox
```

### Email Content:
```
Subject: Reset Your Password - ClipNova

[Beautiful HTML Email with ClipNova branding]

Hello,

We received a request to reset your password.

[Large Blue Button: "Reset Password"]

⏰ Link expires in 1 hour
🔒 Can only be used once
```

### User Flow:
```
1. User opens email
2. Clicks "Reset Password" button
3. Redirected to: frontend-url/reset-password?token=xxx
4. Enters new password
5. POST /api/auth/reset-password
   Body: { "token": "xxx", "newPassword": "newpass" }
6. Password updated + all sessions logged out
7. Redirect to login
```

---

## 🧪 Testing

### Test 1: Send Reset Email

```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@gmail.com"}'
```

**Expected:**
- Response: `{ "success": true, "message": "If the email exists..." }`
- Check your email inbox
- Email should arrive within seconds

### Test 2: Check Email

**Email Should Contain:**
- ✅ ClipNova logo
- ✅ "Reset Your Password" heading
- ✅ Blue "Reset Password" button
- ✅ Clickable link
- ✅ Security warnings
- ✅ 1-hour expiry notice

### Test 3: Reset Password

1. Click link in email
2. Should open: `frontend-url/reset-password?token=abc123...`
3. Enter new password
4. Submit:

```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_FROM_EMAIL","newPassword":"NewPass@123"}'
```

**Expected:**
- Response: `{ "success": true, "message": "Password reset successful..." }`
- All sessions logged out
- Can login with new password

---

## 🔒 Security Features

| Feature | Status |
|---------|--------|
| Token expires in 1 hour | ✅ |
| Single-use token | ✅ |
| Previous tokens invalidated | ✅ |
| Email-only delivery | ✅ |
| All sessions logout on reset | ✅ |
| Doesn't reveal if email exists | ✅ |
| Secure 32-byte random token | ✅ |
| HTML + text email versions | ✅ |

---

## 🚫 Development Mode Fallback

If email is NOT configured:

```json
{
  "success": true,
  "message": "Email sending failed. Here is your reset token for testing",
  "resetToken": "abc123...",
  "resetLink": "http://localhost:3000/reset-password?token=abc123...",
  "error": "Email service unavailable"
}
```

This is **only for local development**. In production with email configured, token is never exposed!

---

## 📝 Frontend Requirements

### Page 1: Forgot Password (`/forgot-password`)

```jsx
<form onSubmit={handleForgotPassword}>
  <input 
    type="email" 
    name="email" 
    placeholder="Enter your email"
    required 
  />
  <button type="submit">Send Reset Link</button>
</form>
```

### Page 2: Reset Password (`/reset-password?token=xxx`)

```jsx
const token = new URLSearchParams(location.search).get('token');

<form onSubmit={handleResetPassword}>
  <input 
    type="password" 
    name="newPassword" 
    placeholder="New password"
    required 
  />
  <input 
    type="password" 
    name="confirmPassword" 
    placeholder="Confirm password"
    required 
  />
  <button type="submit">Reset Password</button>
</form>
```

---

## 🎨 Email Template Preview

The email looks professional with:

- 🎬 ClipNova logo and branding
- 🔵 Large blue "Reset Password" button
- ⚠️ Yellow warning box for expiry notice
- 📋 Copy-paste link option
- 🔒 Security tips section
- 📧 Professional footer

**Colors:**
- Primary: #4F46E5 (Indigo)
- Warning: #F59E0B (Amber)
- Background: #F9F9F9 (Light gray)

---

## 🐛 Troubleshooting

### Issue: Email not received

**Check:**
1. ✅ EMAIL_USER and EMAIL_PASSWORD in .env
2. ✅ Using App Password (not regular Gmail password)
3. ✅ 2FA enabled on Gmail
4. ✅ Check spam folder
5. ✅ Server logs for errors

### Issue: "Email service is not configured"

**Solution:**
```env
# Make sure these are set:
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

### Issue: "Invalid credentials"

**Solution:**
- Regenerate App Password from Google
- Make sure no spaces in password
- Use App Password, not regular password

---

## 📚 Documentation

- **Complete Setup:** `docs/EMAIL_SETUP.md`
- **API Docs:** `API_DOCS.md` (see Forgot Password section)
- **README:** Email configuration section

---

## ✅ Deployment Checklist

Before deploying to production:

- [ ] Email credentials added to production .env
- [ ] FRONTEND_URL set to actual frontend domain
- [ ] Test email delivery in production
- [ ] Check email lands in inbox (not spam)
- [ ] Verify reset link works
- [ ] Test token expiry (wait 1 hour)
- [ ] Test token single-use (try twice)

---

## 🎯 Summary

**What You Have:**
- ✅ Secure token generation (32 bytes, 1 hour expiry)
- ✅ Professional HTML email template
- ✅ Email sent via Nodemailer
- ✅ Gmail/SendGrid/Outlook support
- ✅ Development mode fallback
- ✅ Complete security (single-use, expiry, logout all)
- ✅ Comprehensive documentation

**What You Need:**
1. Configure email credentials (5 minutes)
2. Build frontend reset password page
3. Test the flow
4. Deploy!

---

**That's it! Your secure password reset system is ready! 🚀**
