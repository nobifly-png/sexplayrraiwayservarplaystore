const express = require('express');
const linkService = require('../modules/links/link.service');
const logger = require('../config/logger');
const { publicBaseUrl } = require('../config/r2');

const DEFAULT_THUMBNAIL_URL = process.env.DEFAULT_THUMBNAIL_URL || '';
const BACKEND_URL = (process.env.APP_URL || '').replace(/^["']|["']$/g, '');

const router = express.Router();

// Debug: check what videoUrl resolves to
router.get('/debug/:shortCode', async (req, res) => {
  const { shortCode } = req.params;
  try {
    const { link, video } = await linkService.resolveLinkByShortCode(shortCode);
    const base = (publicBaseUrl || '').replace(/\/$/, '');
    const videoUrl = video.storageKey && base
      ? `${base}/${video.storageKey}`
      : video.externalUrl || null;
    res.json({
      storageKey: video.storageKey,
      publicBaseUrl: publicBaseUrl,
      externalUrl: video.externalUrl,
      videoUrl,
      videoType: video.type,
      videoStatus: video.status,
      linkId: link._id
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.get('/watch/:shortCode', async (req, res) => {
  const { shortCode } = req.params;

  let title = 'Zexgram';
  let thumbnailUrl = DEFAULT_THUMBNAIL_URL;
  let description = 'Watch this video on Zexgram';

  try {
    const { video } = await linkService.resolveLinkByShortCode(shortCode);
    title = video.title || title;
    description = video.description || description;
    thumbnailUrl = video.thumbnailUrl || DEFAULT_THUMBNAIL_URL || '';
  } catch (err) {
    logger.warn({ shortCode, errMsg: err.message }, 'Watch page: link not found');
  }

  const appUrl = `${BACKEND_URL}/watch/${shortCode}`;
  const deepLink = `novax://watch/${shortCode}`;
  const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src * data:");
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(title)}</title>
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:url" content="${e(appUrl)}">
  ${thumbnailUrl ? `<meta property="og:image" content="${e(thumbnailUrl)}">` : ''}
  <meta name="twitter:card" content="${thumbnailUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${e(title)}">
  <meta name="twitter:description" content="${e(description)}">
  ${thumbnailUrl ? `<meta name="twitter:image" content="${e(thumbnailUrl)}">` : ''}
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .box{text-align:center;padding:40px 20px}
    .logo{width:72px;height:72px;background:linear-gradient(135deg,#00e5ff,#0097a7);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
    h2{font-size:20px;font-weight:700;color:#00e5ff;margin-bottom:8px}
    p{font-size:14px;color:#777}
  </style>
</head>
<body>
  <div class="box">
    <div class="logo"><svg width="32" height="32" viewBox="0 0 24 24" fill="#0a0a0a"><path d="M8 5v14l11-7z"/></svg></div>
    <h2>Opening in Zexplayer...</h2>
    <p>If the app does not open, please install Zexplayer.</p>
  </div>
  <script>
    window.location.href = '${deepLink}';
  </script>
</body>
</html>`);
});

module.exports = router;
