# 🎨 Frontend AI Prompt - ClipNova Website

## Project Overview
ClipNova is a video monetization platform where creators upload videos, share links, and earn money based on views. The backend has been updated with two major features that need frontend integration.

---

## 🔧 New Backend Features to Integrate

### Feature 1: Email-Based Password Reset
### Feature 2: View Counting System (4:1 Ratio)

---

# Feature 1: 📧 Forgot Password with Email Link

## What Changed in Backend

The backend now supports **secure email-based password reset** instead of direct password change without verification.

### API Endpoints Available

#### 1. Request Password Reset
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If the email exists, a password reset link has been sent to your email"
}
```

**Note:** Backend doesn't reveal if email exists for security.

---

#### 2. Reset Password with Token
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "a1b2c3d4e5f6...",
  "newPassword": "NewSecure123!"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Password reset successful. Please login with your new password."
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid or expired reset token"
}
```

---

## Frontend Requirements

### 1. Create "Forgot Password" Page

**Route:** `/forgot-password`

**UI Components:**
- Email input field
- Submit button
- Success message display
- Error handling

**Functionality:**
```javascript
const handleForgotPassword = async (email) => {
  try {
    const response = await fetch('YOUR_BACKEND_URL/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Show success message
      alert('Password reset link has been sent to your email. Please check your inbox.');
    } else {
      // Show error
      alert(data.error || 'Failed to send reset link');
    }
  } catch (error) {
    alert('Network error. Please try again.');
  }
};
```

**Example UI:**
```html
<form onsubmit="handleForgotPassword(email)">
  <h2>Forgot Password</h2>
  <input 
    type="email" 
    placeholder="Enter your email" 
    required 
  />
  <button type="submit">Send Reset Link</button>
</form>
```

---

### 2. Create "Reset Password" Page

**Route:** `/reset-password?token=XXXXX`

**UI Components:**
- New password input (with strength indicator)
- Confirm password input
- Submit button
- Success/Error message display

**Functionality:**
```javascript
const handleResetPassword = async (token, newPassword) => {
  try {
    const response = await fetch('YOUR_BACKEND_URL/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Show success and redirect to login
      alert('Password reset successful! Please login with your new password.');
      window.location.href = '/login';
    } else {
      // Show error
      alert(data.error || 'Invalid or expired reset token');
    }
  } catch (error) {
    alert('Network error. Please try again.');
  }
};
```

**Example UI:**
```html
<form onsubmit="handleResetPassword(token, newPassword)">
  <h2>Reset Password</h2>
  <input 
    type="password" 
    placeholder="New Password" 
    minlength="8"
    required 
  />
  <input 
    type="password" 
    placeholder="Confirm Password" 
    required 
  />
  <button type="submit">Reset Password</button>
</form>
```

---

### 3. Update Login Page

Add "Forgot Password?" link to the login page:

```html
<form>
  <input type="email" placeholder="Email" />
  <input type="password" placeholder="Password" />
  <button type="submit">Login</button>
  
  <!-- ADD THIS -->
  <a href="/forgot-password">Forgot Password?</a>
</form>
```

---

## Password Reset Flow (User Journey)

```
1. User clicks "Forgot Password?" on login page
   ↓
2. User enters email on /forgot-password page
   ↓
3. Backend sends email with reset link
   Example: https://yoursite.com/reset-password?token=abc123xyz
   ↓
4. User clicks link in their EMAIL
   ↓
5. User lands on /reset-password?token=abc123xyz page
   ↓
6. User enters new password (twice for confirmation)
   ↓
7. Backend verifies token and updates password
   ↓
8. User redirected to /login page
   ↓
9. User logs in with new password ✅
```

---

## Validation Rules

### Email Input (Forgot Password Page)
- Must be valid email format
- Required field
- Show error if empty

### Password Input (Reset Password Page)
- Minimum 8 characters
- Must contain: uppercase, lowercase, number
- Password and confirm password must match
- Show strength indicator (weak/medium/strong)

---

## Error Handling

### Forgot Password Page
```javascript
// Handle different scenarios
if (response.status === 429) {
  alert('Too many requests. Please try again later.');
} else if (response.status === 400) {
  alert('Please enter a valid email address.');
} else if (!response.ok) {
  alert('Server error. Please try again later.');
}
```

### Reset Password Page
```javascript
// Handle token errors
if (data.error === 'Invalid or expired reset token') {
  alert('This reset link has expired or is invalid. Please request a new one.');
  setTimeout(() => window.location.href = '/forgot-password', 2000);
}
```

---

## UI/UX Recommendations

### Forgot Password Page
- ✅ Simple one-field form
- ✅ Clear instructions: "Enter your email to receive a password reset link"
- ✅ Success message: "Check your email for reset instructions"
- ✅ Back to Login link

### Reset Password Page
- ✅ Password strength indicator
- ✅ Show/hide password toggle
- ✅ Confirm password field
- ✅ Clear error messages
- ✅ Auto-redirect to login on success

### Email Template (Reference)
The backend sends this email:
```
Subject: Reset Your ClipNova Password

Hi [Name],

You requested to reset your password.

Click the link below to reset your password:
https://yoursite.com/reset-password?token=XXXXX

This link expires in 1 hour.

If you didn't request this, ignore this email.

Thanks,
ClipNova Team
```

---

## Security Features (Already in Backend)

✅ Token expires in 1 hour  
✅ Token is single-use (can't reuse)  
✅ Old tokens invalidated when new request made  
✅ All sessions logged out after password reset  
✅ Email existence not revealed (security)  

---

## Testing Checklist

### Test Cases
- [ ] User can request reset with valid email
- [ ] User receives email with reset link
- [ ] Reset link opens correct page with token
- [ ] User can set new password successfully
- [ ] Expired token shows error
- [ ] Used token shows error
- [ ] Invalid token shows error
- [ ] User can login with new password
- [ ] Old password no longer works

---

# Feature 2: 📊 View Counting System (4:1 Ratio)

## What Changed in Backend

The backend now uses a **4:1 view counting ratio**:
- **4 real views = 1 counted view** (shown to user)
- **$0.001 per real view** ($4 per 1000 counted views)
- All analytics APIs return **counted views** (not real views)

---

## What This Means for Frontend

### ❌ OLD SYSTEM (Before)
```json
{
  "totalViews": 4000,           // Real views
  "totalEarnings": 520.00       // $0.13 per view
}
```

### ✅ NEW SYSTEM (Now)
```json
{
  "totalViews": 1000.00,        // Counted views (4000 / 4)
  "totalEarnings": 4.00,        // $0.001 per real view
  "totalEarningsFormatted": "$4.00"
}
```

---

## Frontend Changes Needed

### 1. Display Counted Views (Not Real Views)

**No code changes needed!** Backend already sends counted views.

All existing analytics displays will automatically show counted views.

---

### 2. Update Currency Display Format

Backend now sends amounts with **3 decimals for small amounts**:

```javascript
// Examples from backend:
$0.001  // 1 real view
$0.002  // 2 real views
$0.003  // 3 real views
$0.004  // 4 real views (1 counted view)
$0.10   // 100 real views
$1.00   // 1000 real views
$4.00   // 4000 real views (1000 counted views)
```

**Frontend should display these exactly as received.**

If you're formatting currency yourself, update to:
```javascript
const formatCurrency = (amount) => {
  if (Math.abs(amount) < 1) {
    return `$${Number(amount).toFixed(3)}`;  // 3 decimals
  } else {
    return `$${Number(amount).toFixed(2)}`;  // 2 decimals
  }
};
```

---

### 3. Update Dashboard UI Labels

Change terminology to avoid confusion:

**Before:**
- "Total Views"
- "Valid Views"

**After:**
- "Total Views" (already counted views from backend)
- "Valid Views" (already counted views from backend)

**Add helper text:**
```html
<div class="analytics">
  <h3>Total Views: 250.75</h3>
  <p class="helper-text">Views are calculated based on engagement</p>
  
  <h3>Total Earnings: $1.00</h3>
  <p class="helper-text">$4 per 1000 views</p>
</div>
```

---

### 4. Analytics API Responses

All analytics endpoints now return **counted views**:

#### Creator Overview
```http
GET /api/analytics/overview
```

**Response:**
```json
{
  "totalViews": 250.75,           // Counted (1003 real / 4)
  "validViews": 212.50,           // Counted (850 real / 4)
  "rejectedViews": 38.25,         // Counted (153 real / 4)
  "totalEarnings": 1.003,
  "totalEarningsFormatted": "$1.00"
}
```

#### Video Analytics
```http
GET /api/analytics/videos/:videoId
```

**Response:**
```json
{
  "video": {
    "id": "video-id",
    "title": "My Video"
  },
  "totalViews": 125.50,           // Counted views
  "validViews": 106.25,           // Counted valid
  "rejectedViews": 19.25,         // Counted rejected
  "totalEarnings": 0.502,
  "totalEarningsFormatted": "$0.50"
}
```

#### Link Analytics
```http
GET /api/analytics/links/:linkId
```

**Response:**
```json
{
  "link": {
    "id": "link-id",
    "shortCode": "abc123"
  },
  "totalViews": 62.75,            // Counted views
  "validViews": 53.25,            // Counted valid
  "rejectedViews": 9.50,          // Counted rejected
  "totalEarnings": 0.251,
  "totalEarningsFormatted": "$0.25"
}
```

#### Wallet
```http
GET /api/wallet
```

**Response:**
```json
{
  "totalEarnings": 1.256,
  "totalEarningsFormatted": "$1.26",
  "availableBalance": 1.200,
  "availableBalanceFormatted": "$1.20",
  "pendingBalance": 0.056,
  "pendingBalanceFormatted": "$0.06"
}
```

---

### 5. Display Examples

#### Dashboard
```html
<div class="creator-dashboard">
  <div class="stat-card">
    <h3>Total Views</h3>
    <p class="big-number">250.75</p>
    <p class="subtitle">Counted Views</p>
  </div>
  
  <div class="stat-card">
    <h3>Total Earnings</h3>
    <p class="big-number">$1.00</p>
    <p class="subtitle">$4 per 1000 views</p>
  </div>
  
  <div class="stat-card">
    <h3>Valid Views</h3>
    <p class="big-number">212.50</p>
    <p class="subtitle">Monetized</p>
  </div>
</div>
```

#### Video List
```html
<div class="video-item">
  <h4>My Awesome Video</h4>
  <p>Views: 125.50</p>
  <p>Earnings: $0.50</p>
</div>
```

---

## Important Numbers to Show Users

### Earnings Information
Display this on the dashboard or help page:

```
💰 Earning Rates:
- $4 per 1000 views
- $0.004 per view
- Minimum withdrawal: $100
```

### Examples Table
```html
<table>
  <tr>
    <th>Views</th>
    <th>Earnings</th>
  </tr>
  <tr>
    <td>1</td>
    <td>$0.004</td>
  </tr>
  <tr>
    <td>10</td>
    <td>$0.04</td>
  </tr>
  <tr>
    <td>100</td>
    <td>$0.40</td>
  </tr>
  <tr>
    <td>1,000</td>
    <td>$4.00</td>
  </tr>
  <tr>
    <td>25,000</td>
    <td>$100.00</td>
  </tr>
</table>
```

---

## What You DON'T Need to Change

✅ **API calls** - Same endpoints, same request format  
✅ **Data structure** - Backend handles conversion  
✅ **Chart components** - Just display the numbers received  
✅ **Filtering/sorting** - Works the same way  

---

## Testing the New System

### Test Scenarios

1. **Small Earnings Display**
   - Check that $0.001, $0.002 show correctly (3 decimals)
   
2. **Large Earnings Display**
   - Check that $1.00, $10.00 show correctly (2 decimals)
   
3. **Fractional Views**
   - Views like 250.75, 125.50 should display with decimals
   
4. **Dashboard Analytics**
   - All view counts should be counted views
   - No "real views" should be shown anywhere

---

## Summary for Frontend AI

### What to Build:

1. **Forgot Password Page** (`/forgot-password`)
   - Email input form
   - Submit button
   - Success message display

2. **Reset Password Page** (`/reset-password?token=XXX`)
   - New password input (with confirmation)
   - Submit button
   - Token validation
   - Redirect to login on success

3. **Update Login Page**
   - Add "Forgot Password?" link

4. **Currency Display Update**
   - Show 3 decimals for amounts < $1
   - Show 2 decimals for amounts ≥ $1

5. **Analytics Display** (No major changes needed)
   - Display view counts as received (already counted views)
   - Display earnings with proper decimal formatting

---

## API Base URL

Replace `YOUR_BACKEND_URL` with your actual backend URL:
```javascript
const API_BASE_URL = 'https://your-backend-domain.com';

// or for development
const API_BASE_URL = 'http://localhost:3000';
```

---

## Configuration Needed

### 1. Environment Variables
```env
REACT_APP_API_URL=https://your-backend.com
```

### 2. CORS Setup
Backend already configured for CORS. No changes needed on frontend.

---

## Design Guidelines

### Password Reset Pages
- Clean, minimal design
- Clear instructions
- Good error messages
- Loading states during API calls

### Analytics Dashboard
- Large, readable numbers
- Clear labels
- Helper text for context
- Responsive design

---

## Mobile Responsiveness

All new pages should be mobile-friendly:
- Form inputs should be large enough to tap
- Text should be readable without zoom
- Buttons should be finger-friendly
- Pages should work on 320px width

---

## Accessibility

- All forms should have proper labels
- Error messages should be announced to screen readers
- Keyboard navigation should work
- Color contrast should meet WCAG standards

---

## Final Checklist

### Password Reset Feature
- [ ] /forgot-password page created
- [ ] /reset-password page created
- [ ] Login page has "Forgot Password?" link
- [ ] Email validation working
- [ ] Password strength indicator added
- [ ] Success/error messages display correctly
- [ ] Redirect to login after successful reset

### View Counting Feature
- [ ] Currency formatter shows 3 decimals for < $1
- [ ] Currency formatter shows 2 decimals for ≥ $1
- [ ] Dashboard displays counted views correctly
- [ ] Earnings display with proper formatting
- [ ] Helper text added to explain rates

---

## Contact Backend for Support

If you encounter any issues, check:
1. API endpoint URLs are correct
2. CORS is configured properly
3. Request headers include Content-Type
4. Response status codes are handled
5. Error messages are displayed to user

---

**That's everything! Build these features and ClipNova will be complete.** 🚀

**Key Points:**
1. Password reset needs 2 new pages + 1 link update
2. View counting changes are mostly automatic (backend handles it)
3. Just update currency display format for 3 decimals
4. All existing analytics code continues to work

**Happy coding!** 💻
