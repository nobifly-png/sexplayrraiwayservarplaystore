# ClipNova Frontend Integration Prompt

## Project Overview
Build a React/Next.js frontend for **ClipNova** - a video monetization platform where creators upload videos, generate short links, and earn money when users watch their videos.

---

## Backend Details

**Backend URL (Production):** `https://sexplayrraiwayservarplaystore.up.railway.app`  
**API Base Path:** `/api`  
**Currency:** All amounts are in **Indian Rupees (₹)**

---

## Authentication System

### JWT Token Flow
1. User logs in → receives `accessToken` (15 min expiry) + `refreshToken` (7 days)
2. Store tokens securely (localStorage/cookies)
3. Add `Authorization: Bearer <accessToken>` header to protected requests
4. When accessToken expires, use refreshToken to get new tokens
5. If refreshToken expires, redirect to login

### Required Auth Endpoints

#### 1. Register Creator
```javascript
POST /api/auth/register
Body: {
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
Response: {
  "success": true,
  "data": {
    "user": { "id", "name", "email", "role" },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

#### 2. Login
```javascript
POST /api/auth/login
Body: {
  "email": "john@example.com",
  "password": "password123"
}
Response: Same as register
```

#### 3. Refresh Token
```javascript
POST /api/auth/refresh
Body: {
  "refreshToken": "stored-refresh-token"
}
Response: {
  "success": true,
  "data": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token"
  }
}
```

#### 4. Logout
```javascript
POST /api/auth/logout
Body: {
  "refreshToken": "current-refresh-token"
}
```

#### 5. Get Current User
```javascript
GET /api/auth/me
Headers: { "Authorization": "Bearer <accessToken>" }
Response: {
  "success": true,
  "data": { "id", "name", "email", "role", "status" }
}
```

#### 6. Change Password
```javascript
POST /api/auth/change-password
Headers: { "Authorization": "Bearer <accessToken>" }
Body: {
  "currentPassword": "oldpass",
  "newPassword": "newpass123"
}
```

#### 7. **NEW: Forgot Password**
```javascript
POST /api/auth/forgot-password
Body: {
  "email": "user@example.com"
}
Response: {
  "success": true,
  "message": "If the email exists, a password reset link will be sent"
}
```

#### 8. **NEW: Reset Password**
```javascript
POST /api/auth/reset-password
Body: {
  "token": "reset-token-from-url",
  "newPassword": "newSecurePass123"
}
Response: {
  "success": true,
  "message": "Password reset successful. Please login with your new password."
}
```

---

## Creator Dashboard Features

### 1. Video Management

#### Create Video (Direct Upload)
```javascript
POST /api/videos
Headers: { "Authorization": "Bearer <accessToken>" }
Body: {
  "title": "My Video Title",
  "description": "Video description",
  "type": "DIRECT_UPLOAD"
}
Response: {
  "success": true,
  "data": {
    "id": "video-id",
    "title": "...",
    "type": "DIRECT_UPLOAD",
    "status": "UPLOADING"
  }
}
```

#### Upload Video to Cloudflare R2
**Flow:**
```javascript
// Step 1: Initiate Upload
POST /api/uploads/initiate
Body: {
  "videoId": "video-id",
  "fileName": "video.mp4",
  "fileSize": 50000000,
  "mimeType": "video/mp4"
}
Response: {
  "uploadUrl": "https://r2-signed-url...",
  "storageKey": "videos/user-id/timestamp.mp4",
  "expiresAt": "..."
}

// Step 2: Upload File Directly to R2 (using fetch/axios)
PUT uploadUrl
Body: File (binary)
Headers: { "Content-Type": "video/mp4" }

// Step 3: Complete Upload
POST /api/uploads/complete
Body: { "videoId": "video-id" }
```

#### List Videos
```javascript
GET /api/videos?status=READY&type=DIRECT_UPLOAD
Headers: { "Authorization": "Bearer <accessToken>" }
Response: {
  "success": true,
  "data": [
    {
      "id": "...",
      "title": "...",
      "status": "READY",
      "thumbnailUrl": "...",
      "createdAt": "..."
    }
  ]
}
```

#### Update/Delete Video
```javascript
PATCH /api/videos/:id
DELETE /api/videos/:id
```

---

### 2. Short Link Management

#### Generate Short Link
```javascript
POST /api/links
Body: { "videoId": "video-id" }
Response: {
  "success": true,
  "data": {
    "id": "link-id",
    "shortCode": "abc12345",
    "isActive": true,
    "shareUrl": "https://backend-url/l/abc12345"
  }
}
```

#### Get Video Links
```javascript
GET /api/links/video/:videoId
Response: List of all links for the video
```

#### Toggle Link Active/Inactive
```javascript
PATCH /api/links/:id/toggle
```

---

### 3. **Wallet & Earnings (₹ Indian Rupees)**

#### Get Wallet Balance
```javascript
GET /api/wallet
Headers: { "Authorization": "Bearer <accessToken>" }
Response: {
  "success": true,
  "data": {
    "totalEarnings": 150.50,
    "totalEarningsFormatted": "₹150.50",
    "availableBalance": 120.00,
    "availableBalanceFormatted": "₹120.00",
    "pendingBalance": 30.50,
    "pendingBalanceFormatted": "₹30.50",
    "lifetimeWithdrawn": 500.00,
    "lifetimeWithdrawnFormatted": "₹500.00"
  }
}
```

**Display Formatted Values:** Use `*Formatted` fields for UI display with ₹ symbol

#### Get Transaction History
```javascript
GET /api/wallet/transactions?limit=50
Response: {
  "success": true,
  "data": [
    {
      "type": "VIEW_EARNING",
      "amount": 0.13,
      "amountFormatted": "₹0.13",
      "description": "Earnings from valid view",
      "createdAt": "..."
    }
  ]
}
```

---

### 4. Withdrawal System

#### Request Withdrawal
```javascript
POST /api/withdrawals
Body: {
  "amount": 150,
  "paymentMethod": {
    "type": "UPI",
    "upiId": "user@paytm"
  }
}
// OR for Bank Transfer
Body: {
  "amount": 150,
  "paymentMethod": {
    "type": "BANK_TRANSFER",
    "accountNumber": "1234567890",
    "ifsc": "BANK0001234",
    "accountName": "John Doe"
  }
}
Response: {
  "success": true,
  "data": {
    "amount": 150.00,
    "amountFormatted": "₹150.00",
    "status": "PENDING"
  }
}
```

**Rules:**
- Minimum withdrawal: ₹100
- Only one pending withdrawal at a time
- Status flow: PENDING → APPROVED → PAID

#### Get Creator Withdrawals
```javascript
GET /api/withdrawals
Response: List of all withdrawal requests with status
```

---

### 5. Analytics Dashboard

#### Creator Overview
```javascript
GET /api/analytics/overview?startDate=2024-01-01&endDate=2024-01-31
Response: {
  "success": true,
  "data": {
    "totalViews": 1000,
    "validViews": 850,
    "rejectedViews": 150,
    "totalEarnings": 110.50,
    "totalEarningsFormatted": "₹110.50"
  }
}
```

#### Video Analytics
```javascript
GET /api/analytics/videos/:videoId?startDate=...&endDate=...
Response: Per-video stats
```

---

## Public Video Watch Page (No Auth Required)

### Resolve Short Link
```javascript
GET /l/:shortCode
Response: {
  "success": true,
  "data": {
    "video": {
      "id": "...",
      "title": "Video Title",
      "description": "...",
      "type": "DIRECT_UPLOAD",
      "videoUrl": "https://r2-public-url/video.mp4",
      "thumbnailUrl": "..."
    },
    "link": {
      "id": "link-id",
      "shortCode": "abc12345"
    }
  }
}
```

### Playback Tracking Flow

**Implementation:**
```javascript
// 1. Create Session (on page load)
POST /api/playback/session
Body: {
  "linkId": "link-id",
  "fingerprint": "optional-browser-fingerprint"
}
Response: {
  "success": true,
  "data": { "sessionId": "session-id" }
}

// 2. Send Events (during playback)
POST /api/playback/event
Body: {
  "sessionId": "session-id",
  "eventType": "PLAY", // or PAUSE, PROGRESS, SEEK, END
  "positionSeconds": 10.5
}

// Event Types:
// - PAGE_OPEN: When page loads
// - PLAY: User clicks play (REQUIRED for earnings)
// - PAUSE: Video paused
// - PROGRESS: Every 10 seconds
// - SEEK: User seeks
// - END: Video ends
// - HEARTBEAT: Every 30 seconds

// 3. Finalize Session (on page close/video end)
POST /api/playback/finalize
Body: { "sessionId": "session-id" }
Response: {
  "success": true,
  "data": {
    "isValidView": true,
    "rejectionReason": null,
    "watchTimeSeconds": 45.2
  }
}
```

**Important Rules:**
- **Manual PLAY event is REQUIRED** for earnings
- Send PROGRESS events every 10 seconds
- Send HEARTBEAT every 30 seconds
- Call finalize on page unload or video end

---

## Admin Dashboard (Super Admin Only)

### User Management
```javascript
GET /api/admin/users?role=CREATOR_ADMIN&status=ACTIVE
GET /api/admin/users/:id
PATCH /api/admin/users/:id/block
PATCH /api/admin/users/:id/unblock
```

### Withdrawal Management
```javascript
GET /api/withdrawals/admin/all?status=PENDING
PATCH /api/withdrawals/:id/approve
Body: { "adminNote": "Approved" }

PATCH /api/withdrawals/:id/reject
Body: { "adminNote": "Reason" }

PATCH /api/withdrawals/:id/paid
```

### Platform Analytics
```javascript
GET /api/analytics/admin/dashboard?startDate=...&endDate=...
Response: {
  "totalViews": 50000,
  "validViews": 42000,
  "totalEarnings": 5460.00,
  "totalEarningsFormatted": "₹5460.00",
  "topCreators": [...]
}
```

### Fraud Flag Review
```javascript
GET /api/fraud/flags?resolved=false&severity=HIGH
GET /api/fraud/sessions/:id
PATCH /api/fraud/flags/:id/resolve
```

### System Settings
```javascript
GET /api/settings
PATCH /api/settings
Body: {
  "settings": [
    { "key": "earningsPerValidView", "value": 0.13 },
    { "key": "minimumWithdrawalAmount", "value": 100 }
  ]
}
```

---

## UI/UX Requirements

### Pages Required

#### 1. **Auth Pages**
- `/login` - Login form
- `/register` - Registration form
- `/forgot-password` - Email input for password reset (NEW!)
- `/reset-password?token=xxx` - New password form with token (NEW!)

#### 2. **Creator Dashboard** (Protected Routes)
- `/dashboard` - Overview with earnings, views, wallet summary
- `/dashboard/videos` - Video list with upload button
- `/dashboard/videos/new` - Upload new video
- `/dashboard/videos/:id` - Video details with links
- `/dashboard/wallet` - Wallet balance + transaction history
- `/dashboard/withdrawals` - Withdrawal requests + history
- `/dashboard/withdrawals/new` - Create withdrawal request
- `/dashboard/analytics` - Charts and stats

#### 3. **Public Pages**
- `/l/:shortCode` - Video watch page with player and tracking

#### 4. **Admin Dashboard** (Super Admin Only)
- `/admin/dashboard` - Platform overview
- `/admin/users` - User management
- `/admin/withdrawals` - Withdrawal review
- `/admin/fraud` - Fraud flags review
- `/admin/settings` - System configuration

---

## Currency Display (₹ Indian Rupees)

**IMPORTANT:** All monetary values are in Indian Rupees (₹)

### Display Format
```javascript
// API returns both formats:
{
  "amount": 125.50,              // Use for calculations
  "amountFormatted": "₹125.50"   // Use for display
}

// Always show ₹ symbol in UI:
- Wallet Balance: ₹120.00
- Earnings: ₹0.13 per view
- Withdrawal Amount: ₹150.00
- Minimum Withdrawal: ₹100
```

---

## Video Player Implementation

### Recommended: Video.js or Plyr.js

```javascript
// Track playback events
const player = videojs('video-player');

// On load
createSession(linkId);

// On play (USER INITIATED - REQUIRED!)
player.on('play', () => {
  sendEvent('PLAY', player.currentTime());
});

// On pause
player.on('pause', () => {
  sendEvent('PAUSE', player.currentTime());
});

// Progress every 10s
setInterval(() => {
  if (!player.paused()) {
    sendEvent('PROGRESS', player.currentTime());
  }
}, 10000);

// Heartbeat every 30s
setInterval(() => {
  if (!player.paused()) {
    sendEvent('HEARTBEAT', player.currentTime());
  }
}, 30000);

// On end
player.on('ended', () => {
  sendEvent('END', player.currentTime());
  finalizeSession();
});

// On page unload
window.addEventListener('beforeunload', () => {
  finalizeSession();
});
```

---

## Error Handling

### Response Format
```javascript
// Success
{
  "success": true,
  "message": "...",
  "data": {}
}

// Error
{
  "success": false,
  "message": "Error message"
}
```

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (blocked user)
- `404` - Not Found
- `409` - Conflict (email already exists)
- `429` - Too Many Requests (rate limit)
- `500` - Server Error

### Token Refresh Logic
```javascript
// Interceptor example (axios)
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Try refresh token
      const newTokens = await refreshTokens();
      if (newTokens) {
        // Retry original request
        error.config.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return axios(error.config);
      } else {
        // Redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

---

## Key Business Rules

### Video Monetization
- Only `DIRECT_UPLOAD` videos earn money
- Valid view requires:
  - Manual PLAY event (no autoplay)
  - Watch time ≥ 5 seconds
  - Fraud score < 50
  - IP abuse limits not exceeded

### Withdrawal Rules
- Minimum: ₹100 (default, configurable)
- Only 1 pending withdrawal at a time
- Payment methods: UPI, Bank Transfer, PayPal

### Rate Limiting
- General API: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes
- Playback endpoints: 30 requests per minute

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=https://sexplayrraiwayservarplaystore.up.railway.app/api
NEXT_PUBLIC_WATCH_BASE_URL=https://your-frontend.com/l
```

---

## Security Best Practices

1. **Store tokens securely** (httpOnly cookies preferred)
2. **Validate all user inputs** on frontend
3. **Never expose sensitive data** in console.log
4. **Use HTTPS only** in production
5. **Implement CSRF protection** if using cookies
6. **Sanitize user-generated content** (XSS prevention)
7. **Add loading states** to prevent double-submissions
8. **Implement proper error boundaries**

---

## Tech Stack Recommendations

### Frontend
- **Framework:** Next.js 14+ (App Router) or React + Vite
- **Styling:** Tailwind CSS or Material-UI
- **State Management:** Zustand or React Context
- **HTTP Client:** Axios or React Query
- **Video Player:** Video.js or Plyr.js
- **Charts:** Recharts or Chart.js
- **Forms:** React Hook Form + Zod validation

### Additional Libraries
- **Date handling:** date-fns
- **Toast notifications:** react-hot-toast
- **Icons:** lucide-react or react-icons
- **File upload:** react-dropzone

---

## Testing Checklist

### Authentication Flow
- [ ] Register new creator
- [ ] Login with credentials
- [ ] Token refresh on expiry
- [ ] Logout (single + all sessions)
- [ ] **Forgot password flow** (NEW!)
- [ ] **Reset password with token** (NEW!)
- [ ] Protected route access

### Video Management
- [ ] Create video
- [ ] Upload to R2
- [ ] List videos
- [ ] Generate short link
- [ ] Toggle link status

### Wallet & Withdrawals
- [ ] **Display amounts in ₹** (NEW!)
- [ ] View wallet balance with formatted currency
- [ ] View transaction history
- [ ] Request withdrawal (UPI + Bank)
- [ ] Check minimum withdrawal validation

### Video Playback
- [ ] Resolve short link
- [ ] Create playback session
- [ ] Track PLAY event (manual)
- [ ] Send PROGRESS events
- [ ] Finalize session

### Admin Features
- [ ] View platform dashboard with ₹ formatting
- [ ] Manage users
- [ ] Review withdrawals
- [ ] Update system settings

---

## Sample API Response Examples

### Wallet Response
```json
{
  "success": true,
  "data": {
    "totalEarnings": 156.50,
    "totalEarningsFormatted": "₹156.50",
    "availableBalance": 120.00,
    "availableBalanceFormatted": "₹120.00",
    "pendingBalance": 36.50,
    "pendingBalanceFormatted": "₹36.50",
    "lifetimeWithdrawn": 500.00,
    "lifetimeWithdrawnFormatted": "₹500.00"
  }
}
```

### Analytics Response
```json
{
  "success": true,
  "data": {
    "totalViews": 1250,
    "validViews": 1050,
    "rejectedViews": 200,
    "totalEarnings": 136.50,
    "totalEarningsFormatted": "₹136.50"
  }
}
```

---

## Support & Documentation

- **API Documentation:** Check `API_DOCS.md` in backend repo
- **Project Summary:** Check `PROJECT_SUMMARY.md` for architecture
- **Backend GitHub:** https://github.com/nobifly-png/sexplayrraiwayservarplaystore

---

## Notes for Frontend Developer

1. **Currency is ₹ (Indian Rupees)** - Always use formatted strings for display
2. **Playback tracking is critical** - Manual PLAY event is required for earnings
3. **Token refresh is important** - Implement proper token refresh logic
4. **Forgot password is new** - Add forgot/reset password pages
5. **Rate limiting exists** - Show proper error messages
6. **Video upload is direct to R2** - No file goes through your backend
7. **Admin role is SUPER_ADMIN** - Check user role for admin access
8. **All dates are ISO 8601** - Use date-fns for formatting
9. **Mobile responsive required** - Most users will be on mobile
10. **Loading states mandatory** - Network requests can be slow

---

## Quick Start Checklist

- [ ] Set up Next.js/React project
- [ ] Configure API base URL
- [ ] Create auth context/store
- [ ] Implement token refresh interceptor
- [ ] Build login/register pages
- [ ] **Build forgot password page** (NEW!)
- [ ] **Build reset password page** (NEW!)
- [ ] Build creator dashboard
- [ ] Implement video upload flow
- [ ] Build video watch page with player
- [ ] Add playback tracking
- [ ] Build wallet page with **₹ formatting** (NEW!)
- [ ] Build withdrawal flow
- [ ] Add analytics charts
- [ ] Build admin dashboard (optional)
- [ ] Test all flows end-to-end
- [ ] Deploy to Vercel/Netlify

---

**Good Luck! Happy Coding! 🚀**
