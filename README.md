# ClipNova Backend

Production-ready backend for ClipNova video monetization platform.

## Overview

ClipNova is a video monetization backend where creators can upload videos or add external video links, generate shareable short links, and earn money when real users watch their videos through those links.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (access + refresh tokens)
- **Storage**: Cloudflare R2
- **Security**: bcrypt, helmet, CORS
- **Validation**: Joi
- **Logging**: Pino

## Features

### Core Features
- ✅ User authentication with JWT
- ✅ Creator and Super Admin roles
- ✅ Direct video upload to Cloudflare R2
- ✅ External video reference support
- ✅ Short link generation
- ✅ Playback session tracking
- ✅ View validation with fraud detection
- ✅ Earnings calculation
- ✅ Wallet management
- ✅ Withdrawal system
- ✅ Analytics dashboard
- ✅ Admin controls

### Security Features
- Password hashing with bcrypt
- JWT-based authentication
- Refresh token rotation
- Rate limiting
- Helmet security headers
- CORS protection
- Request ID tracking
- Blocked user prevention

### Fraud Detection
- IP-based abuse detection
- Bot pattern detection
- Manual play requirement
- Minimum watch time validation
- Fraud scoring system
- Fraud flag logging

## Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# Configure MongoDB, JWT secrets, Cloudflare R2, etc.

# Seed super admin
npm run seed:admin

# Seed system settings
npm run seed:settings

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

See `.env.example` for all required environment variables:

- `MONGODB_URI` - MongoDB connection string
- `JWT_ACCESS_SECRET` - Secret for access tokens
- `JWT_REFRESH_SECRET` - Secret for refresh tokens
- `R2_ACCOUNT_ID` - Cloudflare R2 account ID
- `R2_ACCESS_KEY_ID` - R2 access key
- `R2_SECRET_ACCESS_KEY` - R2 secret key
- `R2_BUCKET_NAME` - R2 bucket name
- `R2_PUBLIC_URL` - Public URL for R2 bucket

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new creator
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout current session
- `POST /api/auth/logout-all` - Logout all sessions
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Videos
- `POST /api/videos` - Create video
- `GET /api/videos` - List creator videos
- `GET /api/videos/:id` - Get video details
- `PATCH /api/videos/:id` - Update video
- `DELETE /api/videos/:id` - Soft delete video

### Uploads
- `POST /api/uploads/initiate` - Initiate R2 upload
- `POST /api/uploads/complete` - Complete upload verification

### Links
- `POST /api/links` - Generate short link
- `GET /api/links/video/:videoId` - Get video links
- `PATCH /api/links/:id/toggle` - Toggle link active status
- `GET /api/l/:shortCode` - Resolve short link (public)

### Playback
- `POST /api/playback/session` - Create playback session
- `POST /api/playback/event` - Record playback event
- `POST /api/playback/finalize` - Finalize session and validate view

### Wallet
- `GET /api/wallet` - Get wallet balance
- `GET /api/wallet/transactions` - Get transaction history

### Withdrawals
- `POST /api/withdrawals` - Request withdrawal
- `GET /api/withdrawals` - Get creator withdrawals
- `GET /api/withdrawals/admin/all` - Admin: Get all withdrawals
- `PATCH /api/withdrawals/:id/approve` - Admin: Approve withdrawal
- `PATCH /api/withdrawals/:id/reject` - Admin: Reject withdrawal
- `PATCH /api/withdrawals/:id/paid` - Admin: Mark as paid

### Analytics
- `GET /api/analytics/overview` - Creator analytics overview
- `GET /api/analytics/videos/:videoId` - Video analytics
- `GET /api/analytics/admin/dashboard` - Admin dashboard

### Admin
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user details
- `PATCH /api/admin/users/:id/block` - Block user
- `PATCH /api/admin/users/:id/unblock` - Unblock user

### Settings
- `GET /api/settings` - Get system settings
- `PATCH /api/settings` - Update system settings

## Business Rules

### Video Types
- **DIRECT_UPLOAD**: Monetized, uploaded to R2
- **EXTERNAL_REF**: Non-monetized, external URL

### View Validation
A view is valid only if:
1. Manual play was initiated (no autoplay)
2. Watch time >= 5 seconds (configurable)
3. Video type is DIRECT_UPLOAD
4. Fraud score < 50
5. IP abuse limits not exceeded

### Earnings
- Default: ₹0.05 per valid view (configurable)
- Only DIRECT_UPLOAD videos earn
- Idempotent ledger system prevents double-crediting

### Withdrawals
- Minimum: ₹100 (configurable)
- Only one pending withdrawal at a time
- Status flow: PENDING → APPROVED → PAID
- Rejected withdrawals return funds to available balance

## Architecture

```
src/
├── app.js                 # Express app setup
├── server.js              # Server bootstrap
├── config/                # Configuration files
├── common/                # Shared utilities
│   ├── constants/
│   ├── enums/
│   ├── errors/
│   ├── utils/
│   └── helpers/
├── middlewares/           # Express middlewares
├── modules/               # Feature modules
│   ├── auth/
│   ├── users/
│   ├── videos/
│   ├── uploads/
│   ├── links/
│   ├── playback/
│   ├── analytics/
│   ├── wallet/
│   ├── withdrawals/
│   ├── fraud/
│   ├── admin/
│   ├── settings/
│   └── telegram/
├── routes/                # Route definitions
└── jobs/                  # Background jobs (placeholder)
```

## Data Models

- **User** - User accounts (creators and admins)
- **RefreshSession** - JWT refresh token sessions
- **Video** - Video metadata
- **UploadIntent** - R2 upload tracking
- **Link** - Short links for videos
- **PlaybackSession** - Playback tracking
- **PlaybackEvent** - Playback events (play, pause, etc.)
- **ViewLedger** - Immutable view validation records
- **Wallet** - Creator wallet balances
- **WalletTransaction** - Wallet transaction history
- **WithdrawalRequest** - Withdrawal requests
- **FraudFlag** - Fraud detection flags
- **SystemSetting** - Configurable system settings

## Default Credentials

After running seed scripts:

**Super Admin:**
- Email: `admin@clipnova.com`
- Password: `Admin@123`

⚠️ **IMPORTANT**: Change the password immediately after first login!

## Upload Flow

1. Creator creates video with type DIRECT_UPLOAD
2. Creator initiates upload with file metadata
3. Backend generates signed R2 URL
4. Client uploads directly to R2
5. Client calls complete endpoint
6. Backend verifies file exists in R2
7. Video status changes to READY

## Playback Flow

1. User opens short link
2. Backend creates playback session
3. Frontend sends playback events (PLAY, PROGRESS, etc.)
4. User closes/finishes video
5. Frontend calls finalize endpoint
6. Backend validates view based on rules
7. If valid and monetizable, earnings credited to wallet
8. View recorded in immutable ledger

## Fraud Detection

The system detects:
- Too many views from same IP
- Bot/crawler user agents
- Missing manual play
- Insufficient watch time
- Suspicious playback patterns

Fraud flags are logged for admin review.

## Future Enhancements

- Telegram bot integration (structure ready)
- Background jobs for reconciliation
- Advanced fraud detection algorithms
- Payment gateway integration
- Email notifications
- Webhook support

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Seed super admin
npm run seed:admin

# Seed system settings
npm run seed:settings
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure proper CORS origins
4. Set up MongoDB replica set
5. Configure Cloudflare R2 properly
6. Enable rate limiting
7. Set up monitoring and logging
8. Use process manager (PM2)

## Security Considerations

- All passwords are hashed with bcrypt (12 rounds)
- JWT tokens are short-lived (15 minutes)
- Refresh tokens are hashed before storage
- Blocked users cannot access protected routes
- Rate limiting on sensitive endpoints
- Helmet security headers enabled
- CORS configured with allowlist
- No sensitive data in error responses

## License

Proprietary - All rights reserved

## Support

For issues and questions, contact the development team.
