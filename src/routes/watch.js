const express = require('express');
const linkService = require('../modules/links/link.service');
const logger = require('../config/logger');

const DEFAULT_THUMBNAIL_URL = process.env.DEFAULT_THUMBNAIL_URL || '';
const BACKEND_URL = process.env.APP_URL || process.env.FRONTEND_URL || '';

const router = express.Router();

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
    logger.warn({ shortCode, errMsg: err.message }, 'OG watch: link not found');
  }

  const watchUrl = `${BACKEND_URL}/watch/${shortCode}`;
  const safeTitle = title.replace(/"/g, '&quot;');
  const safeDesc = description.replace(/"/g, '&quot;');
  const safeThumb = thumbnailUrl.replace(/"/g, '&quot;');
  const safeUrl = watchUrl.replace(/"/g, '&quot;');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${safeUrl}">
  ${safeThumb ? `<meta property="og:image" content="${safeThumb}">` : ''}
  ${safeThumb ? `<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  ${safeThumb ? `<meta name="twitter:image" content="${safeThumb}">` : ''}
  <script>
    // Try to open in app via custom scheme, fallback stays on this page
    window.location.href = 'novax://watch/${shortCode}';
    setTimeout(function() {
      document.getElementById('fallback').style.display = 'block';
    }, 2000);
  <\/script>
</head>
<body>
  <p>Opening in Zexplayer app...</p>
  <div id="fallback" style="display:none">
    <p>App not installed? <a href="${safeUrl}">${safeTitle}</a></p>
  </div>
</body>
</html>`);
});

module.exports = router;
