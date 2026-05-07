# ClipNova Backend - Production Launch Checklist

## 🚀 Pre-Launch Checklist

Use this checklist before deploying to production.

---

## 1. Environment Configuration

### Required Environment Variables
- [ ] `NODE_ENV=production`
- [ ] `PORT` set to desired port
- [ ] `MONGODB_URI` configured with production database
- [ ] `JWT_ACCESS_SECRET` - Strong secret (min 32 chars, random)
- [ ] `JWT_REFRESH_SECRET` - Strong secret (min 32 chars, random)
- [ ] `JWT_ACCESS_EXPIRY` configured (default: 15m)
- [ ] `JWT_REFRESH_EXPIRY` configured (default: 7d)
- [ ] `R2_ACCOUNT_ID` configured
- [ ] `R2_ACCESS_KEY_ID` configured
- [ ] `R2_SECRET_ACCESS_KEY` configured
- [ ] `R2_BUCKET_NAME` configured
- [ ] `R2_PUBLIC_URL` configured with custom domain
- [ ] `CORS_ORIGIN` set to production frontend URL
- [ ] `RATE_LIMIT_WINDOW_MS` configured
- [ ] `RATE_LIMIT_MAX_REQUESTS` configured

### Generate Strong Secrets
```bash
# Generate JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Database Setup

### MongoDB Configuration
- [ ] Production MongoDB instance running
- [ ] Database authentication enabled
- [ ] Database user created with appropriate permissions
- [ ] Connection string tested
- [ ] Replica set configured (recommended)
- [ ] Backup strategy in place
- [ ] Monitoring enabled

### Database Seeding
- [ ] Super admin seeded: `npm run seed:admin`
- [ ] System settings seeded: `npm run seed:settings`
- [ ] Default admin password changed

### Database Indexes
- [ ] All model indexes created (automatic with Mongoose)
- [ ] Verify indexes: `db.collection.getIndexes()`

---

## 3. Cloudflare R2 Setup

### Bucket Configuration
- [ ] R2 bucket created
- [ ] Bucket name matches `R2_BUCKET_NAME`
- [ ] Public access configured (if needed)
- [ ] Custom domain configured
- [ ] CORS policy configured on bucket
- [ ] API tokens created with correct permissions

### CORS Policy for R2 Bucket
```json
[
  {
    "AllowedOrigins": ["https://your-frontend-domain.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 4. Security Checklist

### Authentication & Authorization
- [ ] JWT secrets are strong and unique
- [ ] Default admin password changed
- [ ] Refresh token rotation working
- [ ] Blocked users cannot access system
- [ ] Role-based access control tested

### Network Security
- [ ] HTTPS/SSL enabled
- [ ] CORS configured with production origins only
- [ ] Rate limiting enabled and tested
- [ ] Helmet security headers enabled
- [ ] Firewall rules configured

### Data Security
- [ ] Passwords hashed with bcrypt
- [ ] No secrets in code or logs
- [ ] Environment variables secured
- [ ] Database connection encrypted
- [ ] API tokens secured

---

## 5. Server Setup

### Server Requirements
- [ ] Node.js 18+ installed
- [ ] PM2 or process manager installed
- [ ] Server has sufficient resources (CPU, RAM, disk)
- [ ] Monitoring tools installed
- [ ] Log rotation configured

### Application Deployment
- [ ] Code deployed to server
- [ ] Dependencies installed: `npm install --production`
- [ ] Environment variables configured
- [ ] Application starts successfully
- [ ] PM2 configured for auto-restart
- [ ] PM2 startup script enabled

### Process Management
```bash
# Start with PM2
pm2 start src/server.js --name clipnova-backend -i max

# Save PM2 configuration
pm2 save

# Enable startup script
pm2 startup
```

---

## 6. Reverse Proxy (Nginx)

### Nginx Configuration
- [ ] Nginx installed
- [ ] Virtual host configured
- [ ] Proxy pass to Node.js app
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] HTTP to HTTPS redirect enabled
- [ ] Gzip compression enabled
- [ ] Request size limits configured

### Sample Nginx Config
```nginx
server {
    listen 443 ssl http2;
    server_name api.clipnova.com;

    ssl_certificate /etc/letsencrypt/live/api.clipnova.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.clipnova.com/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 7. Testing

### Functional Testing
- [ ] User registration works
- [ ] User login works
- [ ] Token refresh works
- [ ] Video creation works
- [ ] Upload flow works (initiate → upload → complete)
- [ ] Link generation works
- [ ] Link resolution works
- [ ] Playback session creation works
- [ ] Playback events recorded
- [ ] View validation works
- [ ] Earnings credited correctly
- [ ] Wallet balance accurate
- [ ] Withdrawal request works
- [ ] Admin approval/rejection works
- [ ] Analytics data accurate
- [ ] Fraud detection working

### Security Testing
- [ ] Blocked users cannot login
- [ ] Unauthorized access blocked
- [ ] Rate limiting working
- [ ] CORS blocking unauthorized origins
- [ ] SQL injection prevention (N/A for MongoDB)
- [ ] XSS prevention
- [ ] Password requirements enforced

### Performance Testing
- [ ] API response times acceptable
- [ ] Database queries optimized
- [ ] No memory leaks
- [ ] Concurrent requests handled
- [ ] Rate limits appropriate

---

## 8. Monitoring & Logging

### Logging
- [ ] Structured logging enabled (Pino)
- [ ] Log files configured
- [ ] Log rotation enabled
- [ ] Error logs monitored
- [ ] Access logs enabled

### Monitoring
- [ ] Server resource monitoring (CPU, RAM, disk)
- [ ] Application uptime monitoring
- [ ] Database performance monitoring
- [ ] API endpoint monitoring
- [ ] Error rate monitoring
- [ ] Alert system configured

### Recommended Tools
- PM2 monitoring: `pm2 monit`
- Log management: PM2 logs, Papertrail, Loggly
- APM: New Relic, Datadog
- Uptime: UptimeRobot, Pingdom

---

## 9. Backup & Recovery

### Backup Strategy
- [ ] Database backup automated (daily)
- [ ] Backup retention policy defined
- [ ] Backup restoration tested
- [ ] R2 bucket versioning enabled
- [ ] Environment variables backed up securely

### Disaster Recovery
- [ ] Recovery plan documented
- [ ] Backup restoration procedure tested
- [ ] RTO (Recovery Time Objective) defined
- [ ] RPO (Recovery Point Objective) defined

---

## 10. Documentation

### Internal Documentation
- [ ] API documentation updated
- [ ] Deployment guide reviewed
- [ ] Environment variables documented
- [ ] Architecture documented
- [ ] Runbook created for common issues

### External Documentation
- [ ] API documentation for frontend team
- [ ] Authentication flow documented
- [ ] Upload flow documented
- [ ] Playback flow documented
- [ ] Error codes documented

---

## 11. Performance Optimization

### Application Level
- [ ] Database indexes verified
- [ ] Query optimization done
- [ ] Unnecessary logs removed
- [ ] Memory usage optimized
- [ ] Connection pooling configured

### Infrastructure Level
- [ ] CDN configured for static assets
- [ ] Caching strategy implemented (if needed)
- [ ] Load balancer configured (if needed)
- [ ] Auto-scaling configured (if needed)

---

## 12. Compliance & Legal

### Data Protection
- [ ] Privacy policy in place
- [ ] Terms of service in place
- [ ] GDPR compliance (if applicable)
- [ ] Data retention policy defined
- [ ] User data deletion process

### Financial
- [ ] Payment processing compliant
- [ ] Tax requirements understood
- [ ] Financial audit trail in place
- [ ] Withdrawal process documented

---

## 13. Final Checks

### Pre-Launch
- [ ] All tests passing
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] Security audit completed
- [ ] Backup system tested
- [ ] Monitoring active
- [ ] Team trained on deployment

### Launch Day
- [ ] Database seeded
- [ ] Admin account secured
- [ ] Monitoring dashboard open
- [ ] Team on standby
- [ ] Rollback plan ready
- [ ] Communication plan ready

### Post-Launch
- [ ] Monitor error rates
- [ ] Monitor performance
- [ ] Check user feedback
- [ ] Review logs
- [ ] Verify backups running
- [ ] Document any issues

---

## 14. Maintenance Plan

### Regular Tasks
- [ ] Daily: Check logs and errors
- [ ] Daily: Verify backups
- [ ] Weekly: Review performance metrics
- [ ] Weekly: Check disk space
- [ ] Monthly: Security updates
- [ ] Monthly: Dependency updates
- [ ] Quarterly: Security audit

---

## 15. Rollback Plan

### If Issues Occur
1. [ ] Stop new deployments
2. [ ] Assess severity
3. [ ] Check logs for errors
4. [ ] Rollback to previous version if needed
5. [ ] Restore database backup if needed
6. [ ] Communicate with team
7. [ ] Document incident
8. [ ] Fix issues
9. [ ] Test thoroughly
10. [ ] Redeploy

---

## Quick Launch Commands

```bash
# 1. Deploy code
git pull origin main

# 2. Install dependencies
npm install --production

# 3. Seed database (first time only)
npm run seed:admin
npm run seed:settings

# 4. Start application
pm2 start src/server.js --name clipnova-backend -i max
pm2 save

# 5. Check status
pm2 status
pm2 logs clipnova-backend

# 6. Monitor
pm2 monit
```

---

## Emergency Contacts

- [ ] DevOps team contact
- [ ] Database admin contact
- [ ] Security team contact
- [ ] On-call engineer contact

---

## Sign-Off

- [ ] Development team approved
- [ ] QA team approved
- [ ] Security team approved
- [ ] DevOps team approved
- [ ] Product owner approved

---

## 🎉 Ready to Launch!

Once all items are checked, you're ready to launch ClipNova Backend to production!

**Good luck! 🚀**
