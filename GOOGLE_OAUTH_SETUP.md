# Google OAuth Login Setup Guide

## 🎯 Overview

ClipNova now supports **"Continue with Google"** login functionality. Users can sign up and log in using their Google account without needing a password.

---

## 🔧 Backend Setup (Already Complete ✅)

The backend implementation is done. The following has been implemented:

### ✅ Features Implemented:
- User model updated with `googleId` and `profilePicture` fields
- Password is now optional for Google OAuth users
- Google OAuth service created (`src/services/googleOAuth.service.js`)
- Auth service methods for Google login
- New API routes:
  - `GET /api/auth/google` - Initiates Google OAuth flow
  - `GET /api/auth/google/callback` - Handles Google callback

### ✅ User Flow:
1. User clicks "Continue with Google" button
2. Redirected to Google login page
3. User logs in with Google account
4. Google redirects back to backend with authorization code
5. Backend exchanges code for user info
6. Backend creates/links user account
7. Backend redirects to frontend with JWT tokens
8. User is logged in!

---

## ⚙️ Google Cloud Console Configuration

### **Step 1: Open Google Cloud Console**

1. Go to: https://console.cloud.google.com
2. Select your existing project (the one with Gmail API enabled)
   - Project: `zexgram` (or whatever you named it)

---

### **Step 2: Add Authorized Redirect URIs**

1. In Google Cloud Console, go to:
   - **APIs & Services** → **Credentials**

2. Find your OAuth 2.0 Client ID:
   - Client ID: `290067733585-tfh9dh8ek6s4au33gemprqhjr3cbt868.apps.googleusercontent.com`

3. Click **Edit** (pencil icon)

4. Scroll to **Authorized redirect URIs** section

5. Click **+ ADD URI** and add these two URLs:

   **Production:**
   ```
   https://sexplayrraiwayservarplaystore-production.up.railway.app/api/auth/google/callback
   ```

   **Development (Optional):**
   ```
   http://localhost:5000/api/auth/google/callback
   ```

6. Click **SAVE**

---

### **Step 3: Verify OAuth Consent Screen**

1. Go to: **APIs & Services** → **OAuth consent screen**

2. Make sure these scopes are added:
   - `profile` (View your basic profile info)
   - `email` (See your primary Google Account email address)

3. If not added, click **EDIT APP** → **ADD OR REMOVE SCOPES**
   - Search for "profile" and "email"
   - Check both boxes
   - Click **UPDATE**
   - Click **SAVE AND CONTINUE**

---

## 🌐 Frontend Implementation

### **Step 1: Add "Continue with Google" Button**

On your login/signup page, add this button:

```jsx
// Login.jsx or SignUp.jsx

const handleGoogleLogin = () => {
  // Redirect to backend Google OAuth route
  window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/google`;
};

return (
  <div>
    {/* Existing email/password form */}
    
    {/* Divider */}
    <div className="or-divider">
      <span>OR</span>
    </div>

    {/* Google OAuth Button */}
    <button 
      onClick={handleGoogleLogin}
      className="google-login-btn"
    >
      <img src="/google-icon.svg" alt="Google" />
      Continue with Google
    </button>
  </div>
);
```

---

### **Step 2: Create Callback Handler Page**

Create a new page to handle the OAuth callback: `src/pages/auth/GoogleCallback.jsx`

```jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const error = searchParams.get('error');

    if (error) {
      // Handle error
      console.error('Google OAuth error:', error);
      navigate('/login?error=' + error);
      return;
    }

    if (accessToken && refreshToken) {
      // Store tokens in localStorage
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Redirect to dashboard
      navigate('/dashboard');
    } else {
      // Missing tokens
      navigate('/login?error=missing_tokens');
    }
  }, [searchParams, navigate]);

  return (
    <div className="loading-screen">
      <p>Logging you in with Google...</p>
    </div>
  );
}
```

---

### **Step 3: Add Route for Callback Page**

In your router file (e.g., `AppRouter.jsx`):

```jsx
import GoogleCallback from './pages/auth/GoogleCallback';

// Add this route
<Route path="/auth/google/callback" element={<GoogleCallback />} />
```

---

### **Step 4: Update Environment Variables**

In your `.env` file (frontend):

```env
VITE_API_URL=https://sexplayrraiwayservarplaystore-production.up.railway.app
```

Make sure this points to your Railway backend URL.

---

## 🎨 Button Styling (Optional)

Add this CSS for a nice Google button:

```css
.google-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 12px 24px;
  background: white;
  border: 1px solid #dadce0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #3c4043;
  cursor: pointer;
  transition: all 0.2s;
}

.google-login-btn:hover {
  background: #f8f9fa;
  border-color: #c6c6c6;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.google-login-btn img {
  width: 20px;
  height: 20px;
}

.or-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 20px 0;
  color: #666;
}

.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #dadce0;
}

.or-divider span {
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
}
```

---

## 🔒 Security Features

### ✅ Already Implemented:
- Email verification required (only verified Google emails can log in)
- Automatic account linking (if user exists with same email)
- Profile picture saved from Google
- No password needed for Google users
- Same security as regular login (JWT tokens)

---

## 📊 Database Changes

### New Fields in User Model:
```javascript
{
  googleId: String,        // Google user ID (unique)
  profilePicture: String,  // Google profile picture URL
  passwordHash: String     // Optional now (not required for Google users)
}
```

### User Account Linking:
- If user already exists with email → Google account is linked
- If new user → Account created automatically with Google info

---

## 🧪 Testing

### **Manual Testing:**

1. **Start frontend**: `npm run dev` (in frontend directory)
2. **Start backend**: Already deployed on Railway
3. **Click "Continue with Google"**
4. **Select Google account**
5. **Should redirect to dashboard with tokens**

### **Test Cases:**

✅ **New User:**
- Click "Continue with Google"
- Login with Google account (e.g., test@gmail.com)
- User should be created automatically
- Redirected to dashboard
- Check database: user has `googleId` and `profilePicture`

✅ **Existing User (Same Email):**
- User already registered with email/password (test@gmail.com)
- Click "Continue with Google" 
- Login with same Google account (test@gmail.com)
- Google account should be linked to existing user
- Check database: existing user now has `googleId`

✅ **Repeat Login:**
- User logs out
- Click "Continue with Google" again
- Should login successfully without creating new account

---

## 🐛 Troubleshooting

### Error: `redirect_uri_mismatch`
**Solution:** Make sure Authorized Redirect URIs in Google Cloud Console matches exactly:
```
https://sexplayrraiwayservarplaystore-production.up.railway.app/api/auth/google/callback
```

### Error: `access_denied`
**Solution:** User cancelled the Google login. This is normal behavior.

### Error: `google_auth_failed`
**Solution:** Check Railway logs for detailed error message.

### Frontend not receiving tokens
**Solution:** Check browser console for redirect URL. Make sure callback route exists.

---

## 🚀 Deployment Checklist

### Backend (Railway):
- [x] Code deployed (commit: da6eb30)
- [x] Environment variables set (using existing GMAIL_CLIENT_ID/SECRET)
- [ ] **Google Cloud Console redirect URIs added** ← **DO THIS NOW!**

### Frontend (Vercel):
- [ ] Add "Continue with Google" button
- [ ] Create callback handler page
- [ ] Add callback route
- [ ] Update API URL environment variable
- [ ] Deploy to Vercel

---

## 📝 API Documentation

### **POST /api/auth/google**
Initiates Google OAuth flow. Redirects user to Google login page.

**Response:** 302 Redirect to Google

---

### **GET /api/auth/google/callback**
Handles OAuth callback from Google.

**Query Parameters:**
- `code` - Authorization code from Google
- `error` - Error message (if OAuth failed)

**Response:** 302 Redirect to frontend with tokens
```
https://your-frontend.vercel.app/auth/google/callback?accessToken=xxx&refreshToken=yyy
```

---

## 🎯 Next Steps

1. **Configure Google Cloud Console** (see Step 2 above)
2. **Implement frontend button and callback** (see Frontend Implementation)
3. **Test the flow end-to-end**
4. **Deploy frontend to Vercel**

---

## 📞 Support

If you encounter any issues:
1. Check Railway logs for backend errors
2. Check browser console for frontend errors
3. Verify Google Cloud Console configuration
4. Make sure all environment variables are set correctly

---

**Backend is ready! Just configure Google Cloud Console and implement the frontend.** 🎉
