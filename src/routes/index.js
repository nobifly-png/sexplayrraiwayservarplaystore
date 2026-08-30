const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('../modules/auth/auth.routes');
const videoRoutes = require('../modules/videos/video.routes');
const uploadRoutes = require('../modules/uploads/upload.routes');
const linkRoutes = require('../modules/links/link.routes');
const playbackRoutes = require('../modules/playback/playback.routes');
const walletRoutes = require('../modules/wallet/wallet.routes');
const withdrawalRoutes = require('../modules/withdrawals/withdrawal.routes');
const analyticsRoutes = require('../modules/analytics/analytics.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const settingsRoutes = require('../modules/settings/settings.routes');
const teraboxRoutes = require('../modules/terabox/terabox.routes');
const fraudRoutes = require('../modules/fraud/fraud.routes');
const userRoutes = require('../modules/users/user.routes');
const linkController = require('../modules/links/link.controller');
const validateParams = require('../middlewares/validateParams.middleware');
const { shortCodeParam } = require('../common/validation/routeParams');
const { isR2Configured } = require('../config/r2');
const { telegram, env: nodeEnv } = require('../config/env');

const router = express.Router();

// ── Public routes (NO auth) — registered BEFORE all protected routers ─────────
router.get('/l/:shortCode', validateParams(shortCodeParam), linkController.resolveShortLink);
router.get('/videos/watch/:shortCode', validateParams(shortCodeParam), linkController.resolveShortLink);
router.post('/links/resolve', linkController.resolveByUrl);

// ── Protected routers ─────────────────────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/videos', videoRoutes);
router.use('/uploads', uploadRoutes);
router.use('/links', linkRoutes);
router.use('/playback', playbackRoutes);
router.use('/wallet', walletRoutes);
router.use('/withdrawals', withdrawalRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);
router.use('/settings', settingsRoutes);
router.use('/fraud', fraudRoutes);
router.use('/terabox', teraboxRoutes);

router.get('/health', (req, res) => {
  const base = {
    success: true,
    message: 'Backend is healthy and running',
    data: {
      timestamp: new Date().toISOString(),
      database: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState
      },
      integrations: {
        r2Configured: isR2Configured(),
        telegramEnabled: Boolean(telegram.enabled)
      }
    }
  };
  if (nodeEnv !== 'production') {
    base.data.env = nodeEnv;
    base.data.uptimeSeconds = Math.floor(process.uptime());
  }
  res.json(base);
});

router.get('/ready', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  if (!databaseConnected) {
    return res.status(503).json({
      success: false,
      message: 'Service not ready',
      data: {
        database: {
          connected: false,
          readyState: mongoose.connection.readyState
        }
      }
    });
  }

  return res.json({
    success: true,
    message: 'Service ready'
  });
});

module.exports = router;
