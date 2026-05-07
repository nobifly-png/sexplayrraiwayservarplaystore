# ClipNova Backend - Deployment Guide

## Prerequisites

- Node.js 18+ installed
- MongoDB 6+ (local or cloud)
- Cloudflare R2 account with bucket created
- Domain/subdomain for API (optional)

## Local Development Setup

### 1. Clone and Install

```bash
cd novavscode
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=mongodb://localhost:27017/clipnova

JWT_ACCESS_SECRET=your-strong-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-strong-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=clipnova-videos
R2_PUBLIC_URL=https://your-r2-public-domain.com
R2_REGION=auto

CORS_ORIGIN=http://localhost:3000
```

### 3. Seed Database

```bash
npm run seed:admin
npm run seed:settings
```

### 4. Start Development Server

```bash
npm run dev
```

Server will run on `http://localhost:5000`

---

## Production Deployment

### Option 1: VPS/Cloud Server (Ubuntu)

#### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install PM2
sudo npm install -g pm2
```

#### 2. Deploy Application

```bash
# Clone repository
git clone <your-repo-url> /var/www/clipnova-backend
cd /var/www/clipnova-backend

# Install dependencies
npm install --production

# Create .env file
nano .env
# Add production environment variables

# Seed database
npm run seed:admin
npm run seed:settings

# Start with PM2
pm2 start src/server.js --name clipnova-backend
pm2 save
pm2 startup
```

#### 3. Configure Nginx (Optional)

```bash
sudo apt install nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/clipnova
```

Add configuration:

```nginx
server {
    listen 80;
    server_name api.clipnova.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/clipnova /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Install SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.clipnova.com
```

---

### Option 2: Docker Deployment

#### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000

CMD ["node", "src/server.js"]
```

#### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6
    restart: always
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: clipnova

  backend:
    build: .
    restart: always
    ports:
      - "5000:5000"
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongodb:27017/clipnova
    env_file:
      - .env
    depends_on:
      - mongodb

volumes:
  mongodb_data:
```

#### 3. Deploy

```bash
docker-compose up -d

# Seed database
docker-compose exec backend npm run seed:admin
docker-compose exec backend npm run seed:settings
```

---

### Option 3: Cloud Platforms

#### AWS EC2

1. Launch Ubuntu EC2 instance
2. Configure security groups (ports 22, 80, 443, 5000)
3. Follow VPS deployment steps above
4. Use AWS DocumentDB or MongoDB Atlas for database
5. Use CloudFront for CDN (optional)

#### DigitalOcean

1. Create Droplet (Ubuntu)
2. Follow VPS deployment steps
3. Use managed MongoDB database
4. Configure firewall rules

#### Heroku

```bash
# Install Heroku CLI
heroku login

# Create app
heroku create clipnova-backend

# Add MongoDB addon
heroku addons:create mongolab

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_ACCESS_SECRET=your-secret
# ... set all other env vars

# Deploy
git push heroku main

# Seed database
heroku run npm run seed:admin
heroku run npm run seed:settings
```

---

## Cloudflare R2 Setup

### 1. Create R2 Bucket

1. Go to Cloudflare Dashboard
2. Navigate to R2
3. Create bucket: `clipnova-videos`
4. Enable public access (if needed)

### 2. Create API Token

1. Go to R2 → Manage R2 API Tokens
2. Create API token with read/write permissions
3. Copy Access Key ID and Secret Access Key

### 3. Configure Custom Domain (Optional)

1. Add custom domain to R2 bucket
2. Update `R2_PUBLIC_URL` in `.env`

---

## MongoDB Setup

### Option 1: Local MongoDB

```bash
# Ubuntu
sudo systemctl start mongod

# macOS
brew services start mongodb-community

# Windows
net start MongoDB
```

### Option 2: MongoDB Atlas (Cloud)

1. Create account at mongodb.com/cloud/atlas
2. Create free cluster
3. Whitelist IP addresses
4. Create database user
5. Get connection string
6. Update `MONGODB_URI` in `.env`

---

## Environment Variables Checklist

Production environment variables:

- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_ACCESS_SECRET` (min 32 chars)
- [ ] Strong `JWT_REFRESH_SECRET` (min 32 chars)
- [ ] Valid `MONGODB_URI`
- [ ] Cloudflare R2 credentials configured
- [ ] `CORS_ORIGIN` set to frontend domain
- [ ] Rate limit values configured

---

## Security Checklist

- [ ] Change default super admin password
- [ ] Use strong JWT secrets
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS properly
- [ ] Set up firewall rules
- [ ] Enable MongoDB authentication
- [ ] Use environment variables (never commit secrets)
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Regular security updates

---

## Monitoring & Logging

### PM2 Monitoring

```bash
# View logs
pm2 logs clipnova-backend

# Monitor resources
pm2 monit

# View status
pm2 status
```

### Log Files

Logs are written to console using Pino logger. In production:

```bash
# Redirect logs to file
pm2 start src/server.js --name clipnova-backend --log /var/log/clipnova/app.log
```

---

## Backup Strategy

### Database Backup

```bash
# MongoDB backup
mongodump --uri="mongodb://localhost:27017/clipnova" --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://localhost:27017/clipnova" /backup/20240101
```

### Automated Backups

```bash
# Create backup script
nano /usr/local/bin/backup-clipnova.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/clipnova"
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="mongodb://localhost:27017/clipnova" --out="$BACKUP_DIR/$DATE"
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +
```

```bash
chmod +x /usr/local/bin/backup-clipnova.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /usr/local/bin/backup-clipnova.sh
```

---

## Scaling Considerations

### Horizontal Scaling

1. Use load balancer (Nginx, AWS ALB)
2. Run multiple instances with PM2 cluster mode:

```bash
pm2 start src/server.js -i max --name clipnova-backend
```

### Database Scaling

1. Use MongoDB replica set
2. Enable sharding for large datasets
3. Use MongoDB Atlas auto-scaling

### Caching

1. Add Redis for session caching
2. Cache analytics queries
3. Use CDN for static assets

---

## Troubleshooting

### Server won't start

```bash
# Check logs
pm2 logs clipnova-backend

# Check MongoDB connection
mongo --eval "db.adminCommand('ping')"

# Check port availability
sudo netstat -tulpn | grep 5000
```

### Database connection issues

```bash
# Check MongoDB status
sudo systemctl status mongod

# Check connection string
echo $MONGODB_URI

# Test connection
mongo "mongodb://localhost:27017/clipnova"
```

### Upload issues

- Verify R2 credentials
- Check bucket permissions
- Verify CORS settings on R2 bucket
- Check file size limits

---

## Maintenance

### Update Application

```bash
cd /var/www/clipnova-backend
git pull
npm install --production
pm2 restart clipnova-backend
```

### Update Dependencies

```bash
npm update
npm audit fix
```

### Database Maintenance

```bash
# Compact database
mongo clipnova --eval "db.runCommand({compact: 'collection_name'})"

# Rebuild indexes
mongo clipnova --eval "db.collection.reIndex()"
```

---

## Support

For deployment issues, check:
- Application logs
- MongoDB logs
- Nginx logs (if used)
- System logs

Contact development team for assistance.
