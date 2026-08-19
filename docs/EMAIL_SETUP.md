# Email Setup Guide for Password Reset

This guide explains how to configure email service for sending password reset links.

---

## Overview

The forgot password feature sends a secure reset link to the user's email address. The link contains a one-time token that expires in 1 hour.

**Security Flow:**
1. User requests password reset
2. System generates secure token
3. Email is sent with clickable reset link
4. User clicks link in their email
5. User enters new password
6. Token is verified and password is updated

---

## Email Service Configuration

### Option 1: Gmail (Recommended for Development)

#### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account: https://myaccount.google.com
2. Click on "Security"
3. Enable "2-Step Verification"

#### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" as the app
3. Select "Other" as the device and name it "Zexgram"
4. Click "Generate"
5. Copy the 16-character app password

#### Step 3: Update .env File
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
EMAIL_FROM_NAME=Zexgram
```

---

### Option 2: SendGrid (Recommended for Production)

#### Step 1: Create SendGrid Account
1. Go to: https://sendgrid.com
2. Sign up for free account (100 emails/day free)
3. Verify your email address

#### Step 2: Create API Key
1. Go to Settings → API Keys
2. Click "Create API Key"
3. Name it "Zexgram"
4. Select "Full Access" or "Mail Send" only
5. Copy the API key

#### Step 3: Update .env File
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key
EMAIL_FROM_NAME=Zexgram
```

---

### Option 3: Outlook/Office 365

```env
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-password
EMAIL_FROM_NAME=Zexgram
```

---

### Option 4: AWS SES (Best for High Volume)

#### Prerequisites
- AWS Account
- Verified email address or domain

#### Configuration
```env
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-aws-smtp-username
EMAIL_PASSWORD=your-aws-smtp-password
EMAIL_FROM_NAME=Zexgram
```

---

## Testing Email Configuration

### Method 1: Using the API

```bash
# Test forgot password
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@gmail.com"}'
```

Check your email inbox for the password reset link.

### Method 2: Check Server Logs

When the server starts, it logs email configuration status:

```
[INFO] Email transporter initialized successfully
```

Or if not configured:

```
[WARN] Email credentials not configured. Email functionality will be disabled.
```

---

## Email Template

The password reset email includes:

- **Subject:** "Reset Your Password - Zexgram"
- **Professional HTML design** with Zexgram branding
- **Large "Reset Password" button** with the reset link
- **Plain text version** of the link for copy/paste
- **Security warnings**:
  - Link expires in 1 hour
  - Link can only be used once
  - Instructions if user didn't request reset
- **Fallback text version** for email clients without HTML support

---

## Development Mode Fallback

If email service is not configured, the system operates in **development mode**:

- Password reset token is returned in the API response
- Frontend can show the token directly (for testing)
- Email is not sent
- Useful for local development and testing

**Example Development Response:**
```json
{
  "success": true,
  "message": "Email sending failed. Here is your reset token for testing",
  "resetToken": "abc123...",
  "resetLink": "http://localhost:3000/reset-password?token=abc123...",
  "error": "Email service unavailable"
}
```

---

## Production Deployment

### Important Notes

1. **Never commit real email credentials** to version control
2. Use **environment variables** for all credentials
3. For Gmail, always use **App Passwords**, not regular passwords
4. Consider using **dedicated email service** (SendGrid, AWS SES) for production
5. Monitor **email delivery rates** and bounce rates
6. Set up **SPF, DKIM, and DMARC** records for better deliverability

### Email Limits

| Service | Free Tier Limit |
|---------|----------------|
| Gmail | ~500 emails/day |
| SendGrid | 100 emails/day |
| AWS SES | 62,000 emails/month (first year free) |
| Mailgun | 5,000 emails/month |

---

## Troubleshooting

### Issue: "Failed to send password reset email"

**Possible Causes:**
1. Invalid email credentials
2. Email service blocking the connection
3. Firewall blocking SMTP port
4. Invalid SMTP host or port

**Solutions:**
1. Verify EMAIL_USER and EMAIL_PASSWORD in .env
2. For Gmail, ensure 2FA is enabled and using App Password
3. Check if port 587 is open
4. Try EMAIL_SECURE=true with PORT=465

### Issue: Emails going to spam

**Solutions:**
1. Add SPF record to your domain
2. Add DKIM signature
3. Use a verified sender email
4. Use professional email service (SendGrid, AWS SES)
5. Avoid spam trigger words in email content

### Issue: "Email service is not configured"

**Solution:**
Ensure EMAIL_USER and EMAIL_PASSWORD are set in .env file.

---

## Security Best Practices

1. **Never share email credentials**
2. **Rotate App Passwords** regularly
3. **Use App-specific passwords**, not main account password
4. **Monitor email logs** for suspicious activity
5. **Rate limit** forgot password requests (already implemented)
6. **Log all password reset attempts** for audit trail (already implemented)

---

## Frontend Integration

### Reset Password Page

The frontend should:

1. **Extract token from URL**
   ```javascript
   const urlParams = new URLSearchParams(window.location.search);
   const token = urlParams.get('token');
   ```

2. **Show new password form**
   ```html
   <form onSubmit={handleResetPassword}>
     <input type="password" name="newPassword" required />
     <input type="password" name="confirmPassword" required />
     <button type="submit">Reset Password</button>
   </form>
   ```

3. **Call reset API**
   ```javascript
   const response = await fetch('/api/auth/reset-password', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ token, newPassword })
   });
   ```

4. **Redirect to login** on success

---

## Support

For issues or questions:
- Check server logs for error messages
- Verify email credentials
- Test with curl/Postman
- Check EMAIL_SETUP.md documentation

---

**Happy Emailing! 📧**
