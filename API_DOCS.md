# ClipNova API Documentation

Base URL: `http://localhost:5000/api`

## Authentication

All protected endpoints require Bearer token in Authorization header:
```
Authorization: Bearer <access_token>
```

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Success message",
  "data": {}
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message"
}
```

---

## Authentication Endpoints

### Register Creator
```http
POST /auth/register
```

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** User object + tokens

---

### Login
```http
POST /auth/login
```

**Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** User object + tokens

---

### Refresh Token
```http
POST /auth/refresh
```

**Body:**
```json
{
  "refreshToken": "your-refresh-token"
}
```

**Response:** New access and refresh tokens

---

### Logout
```http
POST /auth/logout
```

**Body:**
```json
{
  "refreshToken": "your-refresh-token"
}
```

---

### Logout All Sessions
```http
POST /auth/logout-all
```

**Headers:** Authorization required

---

### Get Current User
```http
GET /auth/me
```

**Headers:** Authorization required

---

### Change Password
```http
POST /auth/change-password
```

**Headers:** Authorization required

**Body:**
```json
{
  "currentPassword": "oldpass",
  "newPassword": "newpass123"
}
```

---

### Forgot Password
```http
POST /auth/forgot-password
```

**Body:**
```json
{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If the email exists, a password reset link will be sent",
  "resetToken": "abc123...",
  "resetLink": "https://frontend.com/reset-password?token=abc123..."
}
```

**Note:** 
- In production, the token is sent via email only (not in response)
- In development mode, token is included in response for testing
- Reset token expires in 1 hour
- Token can only be used once

---

### Reset Password
```http
POST /auth/reset-password
```

**Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "newSecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful. Please login with your new password."
}
```

**Note:** All active sessions are logged out after password reset for security

---

## Video Endpoints

### Create Video
```http
POST /videos
```

**Headers:** Authorization required (Creator)

**Body for Direct Upload:**
```json
{
  "title": "My Video",
  "description": "Video description",
  "type": "DIRECT_UPLOAD"
}
```

**Body for External Reference:**
```json
{
  "title": "External Video",
  "description": "Video description",
  "type": "EXTERNAL_REF",
  "externalUrl": "https://youtube.com/watch?v=..."
}
```

---

### List Videos
```http
GET /videos?status=READY&type=DIRECT_UPLOAD
```

**Headers:** Authorization required (Creator)

**Query Parameters:**
- `status` (optional): UPLOADING, READY, FAILED, DELETED
- `type` (optional): DIRECT_UPLOAD, EXTERNAL_REF

---

### Get Video
```http
GET /videos/:id
```

**Headers:** Authorization required (Creator)

---

### Update Video
```http
PATCH /videos/:id
```

**Headers:** Authorization required (Creator)

**Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description"
}
```

---

### Delete Video
```http
DELETE /videos/:id
```

**Headers:** Authorization required (Creator)

---

## Upload Endpoints

### Initiate Upload
```http
POST /uploads/initiate
```

**Headers:** Authorization required (Creator)

**Body:**
```json
{
  "videoId": "video-id",
  "fileName": "video.mp4",
  "fileSize": 50000000,
  "mimeType": "video/mp4"
}
```

**Response:**
```json
{
  "uploadUrl": "https://r2-signed-url...",
  "storageKey": "videos/user-id/timestamp-random.mp4",
  "expiresAt": "2024-01-01T12:00:00Z"
}
```

**Upload Flow:**
1. Call initiate endpoint
2. Upload file directly to `uploadUrl` using PUT request
3. Call complete endpoint

---

### Complete Upload
```http
POST /uploads/complete
```

**Headers:** Authorization required (Creator)

**Body:**
```json
{
  "videoId": "video-id"
}
```

---

## Link Endpoints

### Create Link
```http
POST /links
```

**Headers:** Authorization required (Creator)

**Body:**
```json
{
  "videoId": "video-id"
}
```

**Response:**
```json
{
  "videoId": "video-id",
  "creatorId": "creator-id",
  "shortCode": "abc12345",
  "isActive": true
}
```

---

### Get Video Links
```http
GET /links/video/:videoId
```

**Headers:** Authorization required (Creator)

---

### Toggle Link Status
```http
PATCH /links/:id/toggle
```

**Headers:** Authorization required (Creator)

---

### Resolve Short Link (Public)
```http
GET /l/:shortCode
```

**No authentication required**

**Response:**
```json
{
  "video": {
    "id": "video-id",
    "title": "Video Title",
    "description": "Description",
    "type": "DIRECT_UPLOAD",
    "videoUrl": "https://r2-public-url/video.mp4"
  },
  "link": {
    "id": "link-id",
    "shortCode": "abc12345"
  }
}
```

---

## Playback Endpoints

### Create Session
```http
POST /playback/session
```

**No authentication required**

**Body:**
```json
{
  "linkId": "link-id",
  "fingerprint": "browser-fingerprint-optional"
}
```

**Response:**
```json
{
  "sessionId": "session-id"
}
```

---

### Record Event
```http
POST /playback/event
```

**No authentication required**

**Body:**
```json
{
  "sessionId": "session-id",
  "eventType": "PLAY",
  "positionSeconds": 10.5,
  "meta": {}
}
```

**Event Types:**
- `PAGE_OPEN`
- `PLAY`
- `PAUSE`
- `PROGRESS`
- `SEEK`
- `END`
- `HEARTBEAT`

---

### Finalize Session
```http
POST /playback/finalize
```

**No authentication required**

**Body:**
```json
{
  "sessionId": "session-id"
}
```

**Response:**
```json
{
  "isValidView": true,
  "rejectionReason": null,
  "watchTimeSeconds": 45.2
}
```

---

## Wallet Endpoints

### Get Wallet
```http
GET /wallet
```

**Headers:** Authorization required (Creator)

**Response:**
```json
{
  "creatorId": "creator-id",
  "totalEarnings": 150.50,
  "availableBalance": 120.00,
  "pendingBalance": 30.50,
  "lifetimeWithdrawn": 500.00
}
```

---

### Get Transactions
```http
GET /wallet/transactions?limit=50
```

**Headers:** Authorization required (Creator)

**Query Parameters:**
- `limit` (optional): Number of transactions to return (max 100, default 50)

---

## Withdrawal Endpoints

### Request Withdrawal
```http
POST /withdrawals
```

**Headers:** Authorization required (Creator)

**Body:**
```json
{
  "amount": 150,
  "paymentMethod": {
    "type": "UPI",
    "upiId": "user@paytm"
  }
}
```

**OR for Bank Transfer:**
```json
{
  "amount": 150,
  "paymentMethod": {
    "type": "BANK_TRANSFER",
    "accountNumber": "1234567890",
    "ifsc": "BANK0001234",
    "accountName": "John Doe"
  }
}
```

**Note:** Minimum withdrawal amount: $100 (configurable)

---

### Get Creator Withdrawals
```http
GET /withdrawals
```

**Headers:** Authorization required (Creator)

---

### Get All Withdrawals (Admin)
```http
GET /withdrawals/admin/all?status=PENDING
```

**Headers:** Authorization required (Super Admin)

**Query Parameters:**
- `status` (optional): PENDING, APPROVED, REJECTED, PAID, CANCELLED

---

### Approve Withdrawal (Admin)
```http
PATCH /withdrawals/:id/approve
```

**Headers:** Authorization required (Super Admin)

**Body:**
```json
{
  "adminNote": "Approved for payment"
}
```

---

### Reject Withdrawal (Admin)
```http
PATCH /withdrawals/:id/reject
```

**Headers:** Authorization required (Super Admin)

**Body:**
```json
{
  "adminNote": "Insufficient documentation"
}
```

---

### Mark as Paid (Admin)
```http
PATCH /withdrawals/:id/paid
```

**Headers:** Authorization required (Super Admin)

---

## Analytics Endpoints

### Creator Overview
```http
GET /analytics/overview?startDate=2024-01-01&endDate=2024-01-31
```

**Headers:** Authorization required (Creator)

**Query Parameters:**
- `startDate` (optional): Filter from date (ISO 8601 format)
- `endDate` (optional): Filter to date (ISO 8601 format)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalViews": 1000,
    "validViews": 850,
    "rejectedViews": 150,
    "totalEarnings": 110.50
  }
}
```

---

### Video Analytics
```http
GET /analytics/videos/:videoId
```

**Headers:** Authorization required (Creator)

---

### Admin Dashboard
```http
GET /analytics/admin/dashboard?startDate=2024-01-01&endDate=2024-01-31
```

**Headers:** Authorization required (Super Admin)

**Query Parameters:**
- `startDate` (optional): Filter from date (ISO 8601 format)
- `endDate` (optional): Filter to date (ISO 8601 format)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalViews": 50000,
    "validViews": 42000,
    "rejectedViews": 8000,
    "totalEarnings": 5460.00,
    "topCreators": [...]
  }
}
```

---

## Admin Endpoints

### List Users
```http
GET /admin/users?role=CREATOR_ADMIN&status=ACTIVE
```

**Headers:** Authorization required (Super Admin)

**Query Parameters:**
- `role` (optional): CREATOR_ADMIN, SUPER_ADMIN
- `status` (optional): ACTIVE, BLOCKED

---

### Get User
```http
GET /admin/users/:id
```

**Headers:** Authorization required (Super Admin)

---

### Block User
```http
PATCH /admin/users/:id/block
```

**Headers:** Authorization required (Super Admin)

---

### Unblock User
```http
PATCH /admin/users/:id/unblock
```

**Headers:** Authorization required (Super Admin)

---

## Fraud Endpoints

### Get Fraud Flags
```http
GET /fraud/flags?resolved=false&severity=HIGH
```

**Headers:** Authorization required (Super Admin)

**Query Parameters:**
- `resolved` (optional): true, false
- `severity` (optional): LOW, MEDIUM, HIGH

---

### Get Session Details
```http
GET /fraud/sessions/:id
```

**Headers:** Authorization required (Super Admin)

---

### Resolve Fraud Flag
```http
PATCH /fraud/flags/:id/resolve
```

**Headers:** Authorization required (Super Admin)

---

## Settings Endpoints

### Get Settings
```http
GET /settings
```

**Headers:** Authorization required (Super Admin)

---

### Update Settings
```http
PATCH /settings
```

**Headers:** Authorization required (Super Admin)

**Body:**
```json
{
  "settings": [
    {
      "key": "earningsPerValidView",
      "value": 0.13
    },
    {
      "key": "minimumWithdrawalAmount",
      "value": 100
    }
  ]
}
```

**Available Settings:**
- `earningsPerValidView` - Amount earned per valid view (default: $0.13)
- `minimumWithdrawalAmount` - Minimum withdrawal amount (default: $100)
- `maxViewsPerIpPerHour` - Max views from same IP per hour (default: 10)
- `minimumWatchSeconds` - Minimum watch time for valid view (default: 5)
- `defaultThumbnailUrl` - Default thumbnail URL for videos

---

## Rate Limits

- General endpoints: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes
- Playback endpoints: 30 requests per minute

---

## Error Codes

- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Too Many Requests
- `500` - Internal Server Error
