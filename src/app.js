const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { trustProxy } = require('./config/env');
const securityMiddleware = require('./middlewares/security.middleware');
const { corsOptions } = securityMiddleware;
const requestId = require('./middlewares/requestId.middleware');
const errorHandler = require('./middlewares/error.middleware');
const routes = require('./routes');
const watchRoutes = require('./routes/watch');
const accessLog = require('./middlewares/accessLog.middleware');

const app = express();
app.set('trust proxy', trustProxy);

// Handle OPTIONS preflight before any auth or other middleware
app.options('*', cors(corsOptions));

app.use(securityMiddleware);
app.use(requestId);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use('/api', accessLog);
app.use('/api', routes);

// App version check — Flutter app polls this on startup (once per day)
// To release a new version: update latestVersion + latestBuildNumber
// forceUpdate: true  → user cannot skip (use for critical bug fixes)
// forceUpdate: false → user can dismiss (normal updates)
app.get('/app-version.json', (req, res) => {
  res.json({
    latestVersion: '1.3.7',
    latestBuildNumber: 29,
    releaseNotes: 'Performance improvements and bug fixes.',
    downloadUrl: 'https://play.google.com/store/apps/details?id=com.novax.player.novax_player',
    forceUpdate: true
  });
});

// Also expose via /api/app/version for Flutter app compatibility
app.get('/api/app/version', (req, res) => {
  res.json({
    latestVersion: '1.3.7',
    latestBuildNumber: 29,
    releaseNotes: 'Performance improvements and bug fixes.',
    downloadUrl: 'https://play.google.com/store/apps/details?id=com.novax.player.novax_player',
    forceUpdate: true
  });
});

// Android App Links verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.novax.player.novax_player',
      sha256_cert_fingerprints: [
        '76:2D:EF:24:3A:25:A4:68:2F:24:3C:DD:12:6A:7E:F8:EA:15:CD:02:9D:CC:A9:B6:74:D1:CB:C5:23:78:4B:80'
      ]
    }
  }]);
});

app.use('/', watchRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use(errorHandler);

module.exports = app;
