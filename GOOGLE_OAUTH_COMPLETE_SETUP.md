# 🔐 Complete Google OAuth Setup Guide

## 🚨 Current Issue: `redirect_uri_mismatch`

Your backend is missing Google OAuth credentials in `.env` file. Follow this guide to fix it.

---

## 📋 Step-by-Step Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Create Project"** or select an existing project
3. Name it: `ClipNova OAuth` (or any name you prefer)
4. Click **"Create"**

---

### Step 2: Enable Required APIs

1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google+ API"** and **ENABLE** it
3. Search for **"Gmail API"** and **ENABLE** it (for email features)

---

### Step 3: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**

#### Configure OAuth Consent Screen (if not done):
- User Type: **External**
- App name: `ClipNova`
- User support email: Your email
- Developer contact: Your email
- Click **"Save and Continue"**
- Scopes: Click **"Add or Remove Scopes"**
  - Select: `./auth/userinfo.email`
  - Select: `./auth/userinfo.profile`
  - Click **"Update"** → **"Save and Continue"**
- Test users: Add your Gmail for testing
- Click **"Save and Continue"** → **"Back to Dashboard"**

#### Create OAuth Client ID:
1. Application type: **Web application**
2. Name: `ClipNova Web Client`

3. **Authorized JavaScript origins** (Optional but recommended):
   ```
   https://sexplayrraiwayservarplaystore-production.up.railway.app
   http://localhost:5000
   ```

4. **Authorized redirect URIs** (⚠️ CRITICAL - Must match exactly):
   
   **For Production (Railway):**
   ```
   https://sexplayrraiwayservarplaystore-production.up.railway.app/api/auth/google/callback
   ```
   
   **For Local Development:**
   ```
   http://localhost:5000/api/auth/google/callback
   ```

5. Click **"Create"**

6. **SAVE THESE VALUES** (You'll see a popup with Client ID and Client Secret):
   - Client ID: `something.apps.googleusercontent.com`
   - Client Secret: `GOCSPX-xxxxxxxxxxxxx`

---

### Step 4: Update Backend `.env` File

Open `D:\novavscode\.env` and add these lines:

```env
# Google OAuth Configuration
# From Google Cloud Console → APIs & Services → Credentials
GMAIL_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-YOUR_CLIENT_SECRET_HERE
```

**Example (with fake values):**
```env
GMAIL_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-aB3dEfGh1JkLmN0pQrStUvWx
```

---

### Step 5: Update APP_URL in `.env`

Make sure your APP_URL matches your Railway deployment:

```env
APP_URL=https://sexplayrraiwayservarplaystore-production.up.railway.app
```

This URL is used to construct the redirect_uri.

---

### Step 6: Deploy to Railway

After updating `.env`:

1. **Commit changes**:
   ```bash
   cd D:\novavscode
   git add .env
   git commit -m "Add Google OAuth credentials"
   git push origin main
   ```

2. **Or manually add on Railway Dashboard**:
   - Go to Railway dashboard
   - Select your service
   - Go to **Variables** tab
   - Add:
     - `GMAIL_CLIENT_ID` = your client ID
     - `GMAIL_CLIENT_SECRET` = your client secret
   - Click **"Save"** (service will redeploy automatically)

---

### Step 7: Update Frontend (Already Done ✅)

Frontend is already configured to call:
- Backend OAuth start: `https://sexplayrraiwayservarplaystore-production.up.railway.app/api/auth/google`
- Frontend callback: `/auth/google/callback`

---

## 🧪 Testing

### Test the Flow:

1. **Clear browser cache/cookies** (important!)

2. Go to your frontend: `http://localhost:5173/login` or `https://your-frontend.vercel.app/login`

3. Click **"Continue with Google"**

4. **Expected Flow:**
   - Redirects to Google login page ✅
   - You login with Google account ✅
   - Google redirects to: `https://sexplayrraiwayservarplaystore-production.up.railway.app/api/auth/google/callback?code=...`
   - Backend processes the code and redirects to: `https://your-frontend.vercel.app/auth/google/callback?accessToken=...&refreshToken=...`
   - Frontend stores tokens and redirects to dashboard ✅

---

## 🔍 Troubleshooting

### Issue 1: `redirect_uri_mismatch`
**Cause**: Redirect URI in Google Console doesn't match backend's redirect_uri

**Solution**:
1. Check `googleOAuth.service.js` line 23:
   ```javascript
   redirect_uri: `${process.env.APP_URL}/api/auth/google/callback`
   ```
2. Make sure `APP_URL` in `.env` is exactly: `https://sexplayrraiwayservarplaystore-production.up.railway.app`
3. In Google Console, the redirect URI must be EXACTLY:
   ```
   https://sexplayrraiwayservarplaystore-production.up.railway.app/api/auth/google/callback
   ```
   (No trailing slash, must be https, must match exactly)

---

### Issue 2: `GMAIL_CLIENT_ID is not defined`
**Cause**: Missing environment variables

**Solution**:
- Add `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` to `.env`
- Restart server: `npm run dev`
- Or redeploy on Railway

---

### Issue 3: Google shows "App Not Verified"
**Cause**: App is in testing mode

**Solution**:
- This is normal during development
- Click **"Advanced"** → **"Go to ClipNova (unsafe)"**
- Or publish your app in Google Console (for production)

---

### Issue 4: Frontend doesn't receive tokens
**Cause**: Backend not redirecting properly

**Solution**:
1. Check `auth.controller.js` line 123:
   ```javascript
   const redirectUrl = `${process.env.FRONTEND_URL}/auth/google/callback?` +
     `accessToken=${result.accessToken}&` +
     `refreshToken=${result.refreshToken}`;
   ```
2. Make sure `FRONTEND_URL` in `.env` is correct
3. Check browser network tab for the redirect

---

## 📝 Backend Code Reference

### Files Involved:
- **Routes**: `src/modules/auth/auth.routes.js`
  - `GET /api/auth/google` - Starts OAuth flow
  - `GET /api/auth/google/callback` - Handles callback

- **Controller**: `src/modules/auth/auth.controller.js`
  - `googleLogin()` - Redirects to Google
  - `googleCallback()` - Processes code, creates user, returns tokens

- **Service**: `src/services/googleOAuth.service.js`
  - `getAuthorizationUrl()` - Builds Google OAuth URL
  - `exchangeCodeForToken()` - Exchanges code for access token
  - `getUserInfo()` - Gets user profile from Google

- **Auth Service**: `src/modules/auth/auth.service.js`
  - `loginWithGoogle()` - Creates/finds user, generates JWT tokens

---

## ✅ Checklist

Before testing, make sure:

- [ ] Google Cloud project created
- [ ] Google+ API enabled
- [ ] OAuth consent screen configured
- [ ] OAuth 2.0 Client ID created
- [ ] Redirect URIs added to Google Console (exact match!)
- [ ] `GMAIL_CLIENT_ID` added to `.env`
- [ ] `GMAIL_CLIENT_SECRET` added to `.env`
- [ ] `APP_URL` is correct in `.env`
- [ ] `FRONTEND_URL` is correct in `.env`
- [ ] Backend restarted/redeployed
- [ ] Browser cache cleared
- [ ] Test users added (if app is in testing mode)

---

## 🎯 Quick Copy-Paste Values

**Your Backend URLs:**
```
Production: https://sexplayrraiwayservarplaystore-production.up.railway.app
Local: http://localhost:5000
```

**Authorized Redirect URIs for Google Console:**
```
https://sexplayrraiwayservarplaystore-production.up.railway.app/api/auth/google/callback
http://localhost:5000/api/auth/google/callback
```

**Required .env Variables:**
```env
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your-client-secret
APP_URL=https://sexplayrraiwayservarplaystore-production.up.railway.app
FRONTEND_URL=https://clipnovawebistefronendvarsel-gyum.vercel.app
```

---

## 🚀 After Setup

Once setup is complete:
1. User clicks "Continue with Google"
2. Google login page opens
3. User approves access
4. User is logged in to your app
5. JWT tokens stored in localStorage
6. User redirected to dashboard

**That's it! Your Google OAuth is now working! 🎉**

---

## Need Help?

If still facing issues:
1. Check Railway logs for backend errors
2. Check browser console for frontend errors
3. Verify all URLs match exactly (no typos!)
4. Wait 5 minutes after changing Google Console settings
