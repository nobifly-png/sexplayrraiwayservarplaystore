# Zexgram Backend - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites
- Node.js 18+ installed
- MongoDB running locally or connection string ready
- Cloudflare R2 account (for production uploads)

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Configure Environment

```bash
cp .env.example .env
```

**Minimum required configuration for local development:**

```env
NODE_ENV=development
PORT=5000

# Local MongoDB
MONGODB_URI=mongodb://localhost:27017/zexgram

# Generate random secrets (use strong values in production)
JWT_ACCESS_SECRET=dev-access-secret-change-in-production-min-32-chars
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production-min-32-chars

# Cloudflare R2 (get from Cloudflare dashboard)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=zexgram-videos
R2_PUBLIC_URL=https://your-bucket-url.com

# CORS (frontend URL)
CORS_ORIGIN=http://localhost:3000
```

---

## Step 3: Seed Database

```bash
# Create super admin account
npm run seed:admin

# Create system settings
npm run seed:settings
```

**Default Super Admin Credentials:**
- Email: `admin@zexgram.com`
- Password: `Admin@123`

⚠️ **Change password after first login!**

---

## Step 4: Start Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Server will start on `http://localhost:5000`

---

## Step 5: Test the API

### Health Check
```bash
curl http://localhost:5000/api/health
```

### Register a Creator
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Creator",
    "email": "creator@test.com",
    "password": "password123"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@test.com",
    "password": "password123"
  }'
```

Save the `accessToken` from the response!

---

## Common Tasks

### Create a Video

```bash
curl -X POST http://localhost:5000/api/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "title": "My First Video",
    "description": "Test video",
    "type": "DIRECT_UPLOAD"
  }'
```

### Generate Short Link

```bash
curl -X POST http://localhost:5000/api/links \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "videoId": "VIDEO_ID_FROM_PREVIOUS_STEP"
  }'
```

### Check Wallet

```bash
curl http://localhost:5000/api/wallet \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Video Upload Flow

### 1. Create Video
```bash
POST /api/videos
{
  "title": "My Video",
  "type": "DIRECT_UPLOAD"
}
```

### 2. Initiate Upload
```bash
POST /api/uploads/initiate
{
  "videoId": "video-id",
  "fileName": "video.mp4",
  "fileSize": 50000000,
  "mimeType": "video/mp4"
}
```

Response includes `uploadUrl` - use this to upload directly to R2.

### 3. Upload File to R2
```bash
curl -X PUT "SIGNED_UPLOAD_URL" \
  --upload-file video.mp4 \
  -H "Content-Type: video/mp4"
```

### 4. Complete Upload
```bash
POST /api/uploads/complete
{
  "videoId": "video-id"
}
```

### 5. Generate Link
```bash
POST /api/links
{
  "videoId": "video-id"
}
```

---

## Playback Flow (Public)

### 1. Resolve Link
```bash
GET /api/l/SHORT_CODE
```

### 2. Create Session
```bash
POST /api/playback/session
{
  "linkId": "link-id"
}
```

### 3. Send Events
```bash
POST /api/playback/event
{
  "sessionId": "session-id",
  "eventType": "PLAY",
  "positionSeconds": 0
}
```

### 4. Finalize Session
```bash
POST /api/playback/finalize
{
  "sessionId": "session-id"
}
```

---

## Admin Tasks

### Login as Admin
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@clipnova.com",
    "password": "Admin@123"
  }'
```

### View All Users
```bash
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

### View Platform Analytics
```bash
curl http://localhost:5000/api/analytics/admin/dashboard \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

### Review Withdrawals
```bash
curl http://localhost:5000/api/withdrawals/admin/all \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

---

## Troubleshooting

### MongoDB Connection Error
```bash
# Check if MongoDB is running
mongosh

# Or check service status
sudo systemctl status mongod
```

### Port Already in Use
```bash
# Change PORT in .env file
PORT=5001
```

### JWT Token Expired
- Access tokens expire in 15 minutes
- Use refresh token to get new access token:
```bash
POST /api/auth/refresh
{
  "refreshToken": "your-refresh-token"
}
```

### Upload Fails
- Verify R2 credentials in .env
- Check bucket permissions
- Ensure file size < 1GB
- Verify MIME type (mp4, mov, webm only)

---

## Project Structure

```
src/
├── app.js              # Express setup
├── server.js           # Server startup
├── config/             # Configuration
├── middlewares/        # Express middlewares
├── modules/            # Feature modules
│   ├── auth/
│   ├── videos/
│   ├── uploads/
│   ├── links/
│   ├── playback/
│   ├── wallet/
│   └── ...
└── routes/             # Route aggregation
```

---

## API Documentation

Full API documentation: [API_DOCS.md](./API_DOCS.md)

---

## Next Steps

1. ✅ Set up local environment
2. ✅ Test basic endpoints
3. 📖 Read [API_DOCS.md](./API_DOCS.md) for all endpoints
4. 📖 Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
5. 🔧 Configure Cloudflare R2 for uploads
6. 🎨 Build frontend to consume this API

---

## Useful Commands

```bash
# Development
npm run dev

# Production
npm start

# Seed admin
npm run seed:admin

# Seed settings
npm run seed:settings

# View logs (if using PM2)
pm2 logs clipnova-backend
```

---

## Environment Variables Quick Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Yes | Secret for access tokens |
| `JWT_REFRESH_SECRET` | Yes | Secret for refresh tokens |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret key |
| `R2_BUCKET_NAME` | Yes | R2 bucket name |
| `R2_PUBLIC_URL` | Yes | Public URL for videos |
| `CORS_ORIGIN` | Yes | Frontend URL |
| `PORT` | No | Server port (default: 5000) |

---

## Support

- 📖 Documentation: See README.md, API_DOCS.md, DEPLOYMENT.md
- 🐛 Issues: Check logs and error messages
- 💬 Questions: Contact development team

---

## Quick Tips

- Use Postman or Insomnia for API testing
- Save access tokens for authenticated requests
- Check MongoDB for data verification
- Monitor logs for debugging
- Use rate limiting in production
- Change default admin password immediately
- Keep JWT secrets secure
- Use HTTPS in production

---

Happy coding! 🚀
