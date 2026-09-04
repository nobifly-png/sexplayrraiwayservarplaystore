const express = require('express');
const linkService = require('../modules/links/link.service');
const logger = require('../config/logger');
const { publicBaseUrl } = require('../config/r2');

const DEFAULT_THUMBNAIL_URL = process.env.DEFAULT_THUMBNAIL_URL || '';
const BACKEND_URL = (process.env.APP_URL || '').replace(/^["']|["']$/g, '');
// API base is always the Railway backend URL — not the frontend domain
const RAILWAY_URL = (process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BACKEND_URL || process.env.APP_URL || '').replace(/^["']|["']$/g, '');
const APP_LOGO_URL = process.env.APP_LOGO_URL || '';

const router = express.Router();

// ── HTML escape helper ────────────────────────────────────────────────────────
const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Debug: check what videoUrl resolves to ───────────────────────────────────
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

// ── /watch/:shortCode/play — Browser HTML5 video player (iOS jugad) ──────────
// Full playback session lifecycle: session → events → finalize
// Views + earnings count exactly like the native app
router.get('/watch/:shortCode/play', async (req, res) => {
  const { shortCode } = req.params;

  let title = 'Zexgram';
  let thumbnailUrl = DEFAULT_THUMBNAIL_URL;
  let description = 'Watch this video on Zexgram';
  let videoUrl = null;
  let linkId = null;
  let videoId = null;
  let errorMsg = null;

  try {
    const { link, video } = await linkService.resolveLinkByShortCode(shortCode);
    title       = video.title       || title;
    description = video.description || description;
    thumbnailUrl = video.thumbnailUrl || DEFAULT_THUMBNAIL_URL || '';
    linkId  = link._id.toString();
    videoId = video._id.toString();

    const base = (publicBaseUrl || '').replace(/\/$/, '');
    videoUrl = video.storageKey && base
      ? `${base}/${video.storageKey}`
      : video.externalUrl || null;

    if (!videoUrl) {
      errorMsg = 'Video is not available for browser playback.';
    }
  } catch (err) {
    logger.warn({ shortCode, errMsg: err.message }, 'Browser player: link not found');
    errorMsg = 'This video link is not found or has been deactivated.';
  }

  const backUrl   = `${BACKEND_URL}/watch/${shortCode}`;
  const apiBase   = `${RAILWAY_URL}/api`;

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src * data: blob:",
    "media-src * blob:",
    "connect-src *"
  ].join('; '));
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
  <meta property="og:url" content="${e(backUrl)}">
  ${thumbnailUrl ? `<meta property="og:image" content="${e(thumbnailUrl)}">` : ''}
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
    }

    /* ── Top bar ── */
    .topbar {
      width: 100%;
      max-width: 860px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px 10px;
    }
    .back-btn {
      background: none;
      border: none;
      color: #00e5ff;
      font-size: 22px;
      cursor: pointer;
      line-height: 1;
      padding: 4px 6px;
      border-radius: 6px;
      text-decoration: none;
    }
    .back-btn:hover { background: rgba(0,229,255,.1); }
    .topbar-title {
      font-size: 15px;
      font-weight: 600;
      color: #e0e0e0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    /* ── Video wrapper ── */
    .video-wrap {
      width: 100%;
      max-width: 860px;
      background: #111;
      position: relative;
    }
    video {
      width: 100%;
      display: block;
      max-height: 70vh;
      background: #000;
    }

    /* ── Loading overlay ── */
    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,.75);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      pointer-events: none;
      transition: opacity .3s;
    }
    .overlay.hidden { opacity: 0; }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(0,229,255,.25);
      border-top-color: #00e5ff;
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .overlay-text { font-size: 13px; color: #aaa; }

    /* ── Info section ── */
    .info {
      width: 100%;
      max-width: 860px;
      padding: 16px;
    }
    .video-title {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      line-height: 1.4;
      margin-bottom: 6px;
    }
    .video-desc {
      font-size: 13px;
      color: #888;
      line-height: 1.5;
    }

    /* ── Status bar ── */
    .status-bar {
      width: 100%;
      max-width: 860px;
      padding: 8px 16px;
      font-size: 11px;
      color: #555;
      min-height: 28px;
    }
    .status-bar.ok   { color: #00c853; }
    .status-bar.warn { color: #ff9800; }
    .status-bar.err  { color: #f44336; }

    /* ── Error screen ── */
    .error-box {
      text-align: center;
      padding: 60px 24px;
      max-width: 400px;
    }
    .error-icon { font-size: 48px; margin-bottom: 16px; }
    .error-box h2 { font-size: 18px; color: #f44336; margin-bottom: 10px; }
    .error-box p  { font-size: 14px; color: #777; margin-bottom: 24px; line-height: 1.5; }
    .btn-back {
      display: inline-block;
      padding: 12px 28px;
      background: linear-gradient(135deg, #00e5ff, #0097a7);
      color: #000;
      border-radius: 50px;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
    }
  </style>
</head>
<body>

${errorMsg ? `
  <div class="error-box">
    <div class="error-icon">⚠️</div>
    <h2>Video Unavailable</h2>
    <p>${e(errorMsg)}</p>
    <a class="btn-back" href="${e(backUrl)}">← Go Back</a>
  </div>
` : `
  <!-- Top bar -->
  <div class="topbar">
    <a class="back-btn" href="${e(backUrl)}" title="Back">&#8592;</a>
    <span class="topbar-title">${e(title)}</span>
  </div>

  <!-- Video player -->
  <div class="video-wrap" id="videoWrap">
    <video
      id="vid"
      controls
      playsinline
      preload="metadata"
      ${thumbnailUrl ? `poster="${e(thumbnailUrl)}"` : ''}
    >
      <source src="${e(videoUrl)}" type="video/mp4">
      Your browser does not support HTML5 video.
    </video>

    <!-- Loading / buffering overlay -->
    <div class="overlay" id="overlay">
      <div class="spinner"></div>
      <span class="overlay-text">Loading video…</span>
    </div>
  </div>

  <!-- Status -->
  <div class="status-bar" id="statusBar"></div>

  <!-- Info -->
  <div class="info">
    <div class="video-title">${e(title)}</div>
    ${description ? `<div class="video-desc">${e(description)}</div>` : ''}
  </div>

  <script>
  (function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────────────
    var API_BASE   = '${apiBase}';
    var LINK_ID    = '${linkId}';
    var SHORT_CODE = '${shortCode}';

    // ── State ─────────────────────────────────────────────────────────────────
    var sessionId        = null;
    var sessionStarted   = false;
    var playStarted      = false;
    var finalized        = false;
    var heartbeatTimer   = null;
    var lastPosition     = 0;
    var fingerprint      = SHORT_CODE + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var vid       = document.getElementById('vid');
    var overlay   = document.getElementById('overlay');
    var statusBar = document.getElementById('statusBar');

    // ── Helpers ───────────────────────────────────────────────────────────────
    function setStatus(msg, type) {
      statusBar.textContent = msg;
      statusBar.className   = 'status-bar' + (type ? ' ' + type : '');
    }

    function hideOverlay() {
      overlay.classList.add('hidden');
    }

    function showOverlay(text) {
      overlay.classList.remove('hidden');
      var span = overlay.querySelector('.overlay-text');
      if (span && text) span.textContent = text;
    }

    function post(path, body) {
      return fetch(API_BASE + path, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
      }).then(function (r) { return r.json(); });
    }

    // ── 1. Create playback session on page load ───────────────────────────────
    function startSession() {
      if (sessionStarted) return;
      sessionStarted = true;

      post('/playback/session', { linkId: LINK_ID, fingerprint: fingerprint })
        .then(function (res) {
          if (res && res.data && res.data.sessionId) {
            sessionId = res.data.sessionId;
            setStatus('Ready to play', 'ok');
          } else {
            setStatus('Session init failed — views may not count', 'warn');
          }
        })
        .catch(function () {
          setStatus('Network error — views may not count', 'warn');
        });
    }

    // ── 2. Send playback event ────────────────────────────────────────────────
    function sendEvent(eventType, positionSeconds) {
      if (!sessionId) return;
      var body = { sessionId: sessionId, eventType: eventType };
      if (positionSeconds !== undefined) body.positionSeconds = Math.floor(positionSeconds);
      post('/playback/event', body).catch(function () {/* silent */});
    }

    // ── 3. Heartbeat every 15 s during playback ───────────────────────────────
    function startHeartbeat() {
      stopHeartbeat();
      heartbeatTimer = setInterval(function () {
        if (!vid.paused && !vid.ended) {
          sendEvent('HEARTBEAT', vid.currentTime);
        }
      }, 15000);
    }

    function stopHeartbeat() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    }

    // ── 4. Finalize session (view count + earnings) ───────────────────────────
    function finalizeSession() {
      if (finalized || !sessionId) return;
      finalized = true;
      stopHeartbeat();
      post('/playback/finalize', { sessionId: sessionId })
        .then(function (res) {
          if (res && res.data) {
            var d = res.data;
            if (d.isValidView) {
              setStatus('View counted ✓', 'ok');
            } else {
              setStatus('View recorded', '');
            }
          }
        })
        .catch(function () {/* silent */});
    }

    // ── Video event listeners ─────────────────────────────────────────────────

    // Metadata loaded — video is ready to play, hide spinner
    vid.addEventListener('loadedmetadata', function () {
      hideOverlay();
    });

    // Can play — hide spinner if still showing
    vid.addEventListener('canplay', function () {
      hideOverlay();
    });

    // Buffering
    vid.addEventListener('waiting', function () {
      showOverlay('Buffering…');
    });
    vid.addEventListener('playing', function () {
      hideOverlay();
    });

    // User pressed play (first time)
    vid.addEventListener('play', function () {
      if (!playStarted) {
        playStarted = true;
        sendEvent('PLAY', vid.currentTime);
      }
      startHeartbeat();
    });

    // Pause
    vid.addEventListener('pause', function () {
      stopHeartbeat();
      if (playStarted && !vid.ended) {
        sendEvent('PAUSE', vid.currentTime);
        sendEvent('PROGRESS', vid.currentTime);
      }
    });

    // Seek
    vid.addEventListener('seeked', function () {
      lastPosition = vid.currentTime;
      if (playStarted) sendEvent('SEEK', vid.currentTime);
    });

    // Progress (timeupdate) — send every ~5 s of real playback
    var lastProgressSent = 0;
    vid.addEventListener('timeupdate', function () {
      var now = vid.currentTime;
      if (playStarted && now - lastProgressSent >= 5) {
        lastProgressSent = now;
        sendEvent('PROGRESS', now);
      }
    });

    // Video ended — finalize immediately
    vid.addEventListener('ended', function () {
      stopHeartbeat();
      sendEvent('END', vid.currentTime);
      sendEvent('COMPLETE', vid.currentTime);
      finalizeSession();
    });

    // Error
    vid.addEventListener('error', function () {
      hideOverlay();
      setStatus('Video playback error. Try again.', 'err');
    });

    // ── Finalize on page exit (user closes tab / navigates away) ─────────────
    // Use sendBeacon for reliability on mobile browsers during unload
    window.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && playStarted && !finalized) {
        // Send progress before finalizing
        if (sessionId) {
          navigator.sendBeacon
            ? navigator.sendBeacon(API_BASE + '/playback/event',
                new Blob([JSON.stringify({
                  sessionId: sessionId,
                  eventType: 'PROGRESS',
                  positionSeconds: Math.floor(vid.currentTime)
                })], { type: 'application/json' }))
            : null;
          navigator.sendBeacon
            ? navigator.sendBeacon(API_BASE + '/playback/finalize',
                new Blob([JSON.stringify({ sessionId: sessionId })],
                  { type: 'application/json' }))
            : finalizeSession();
          finalized = true;
        }
      }
    });

    window.addEventListener('pagehide', function () {
      if (playStarted && !finalized && sessionId) {
        navigator.sendBeacon
          ? navigator.sendBeacon(API_BASE + '/playback/finalize',
              new Blob([JSON.stringify({ sessionId: sessionId })],
                { type: 'application/json' }))
          : null;
        finalized = true;
      }
    });

    // ── Kick off session creation ─────────────────────────────────────────────
    startSession();

  }());
  </script>
`}

</body>
</html>`);
});

// ── /watch/:shortCode — Deep link launcher page (existing + iOS button added) ─
router.get('/watch/:shortCode', async (req, res) => {
  const { shortCode } = req.params;

  let title        = 'Zexgram';
  let thumbnailUrl = DEFAULT_THUMBNAIL_URL;
  let description  = 'Watch this video on Zexgram';

  try {
    const { video } = await linkService.resolveLinkByShortCode(shortCode);
    title        = video.title       || title;
    description  = video.description || description;
    thumbnailUrl = video.thumbnailUrl || DEFAULT_THUMBNAIL_URL || '';
  } catch (err) {
    logger.warn({ shortCode, errMsg: err.message }, 'Watch page: link not found');
  }

  const appUrl      = `${BACKEND_URL}/watch/${shortCode}`;
  const deepLink    = `novax://watch/${shortCode}`;
  const browserPlay = `${BACKEND_URL}/watch/${shortCode}/play`;

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
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #0a0a0a;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .box {
      text-align: center;
      padding: 40px 24px;
      max-width: 380px;
      width: 100%;
    }

    /* App icon */
    .logo {
      width: 88px;
      height: 88px;
      background: #1a1a2e;
      border-radius: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 4px 24px rgba(0,0,0,.5);
      overflow: hidden;
    }
    .logo img { width: 88px; height: 88px; object-fit: cover; border-radius: 22px; }

    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 14px;
      color: #777;
      margin-bottom: 32px;
      line-height: 1.5;
    }

    /* ── Shared button base ── */
    .btn-playstore,
    .btn-appstore {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 15px 20px;
      border-radius: 50px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: opacity .2s, transform .1s, background .2s;
    }

    /* ── Play Store button (Android primary / iOS secondary) ── */
    .btn-playstore {
      background: linear-gradient(135deg, #00e5ff, #0097a7);
      color: #000;
      border: none;
      margin-bottom: 14px;
    }
    .btn-playstore:active { opacity: .85; transform: scale(.98); }

    /* iOS: Play Store button becomes a smaller, subtle secondary link */
    .ios .btn-playstore {
      background: transparent;
      color: #555;
      border: 1px solid #2a2a2a;
      font-size: 13px;
      font-weight: 500;
      padding: 11px 20px;
      margin-bottom: 12px;
    }

    /* ── App Store button (iOS primary / Android secondary) ── */
    .btn-appstore {
      background: #1c1c1e;
      color: #fff;
      border: 1.5px solid #333;
      margin-bottom: 28px;
    }
    .btn-appstore:hover  { background: #252528; }
    .btn-appstore:active { transform: scale(.98); }

    /* iOS: App Store button becomes the primary cyan button */
    .ios .btn-appstore {
      background: linear-gradient(135deg, #00e5ff, #0097a7);
      color: #000;
      border: none;
    }
    .ios .btn-appstore:hover { opacity: .9; }

    /* After-install hint */
    .hint {
      background: #131313;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 16px;
      text-align: left;
    }
    .hint-title {
      font-size: 12px;
      color: #f5a623;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .hint ul {
      list-style: none;
      padding: 0;
    }
    .hint li {
      font-size: 13px;
      color: #aaa;
      padding: 3px 0;
      padding-left: 16px;
      position: relative;
    }
    .hint li::before {
      content: '•';
      position: absolute;
      left: 0;
      color: #555;
    }

    /* Status text */
    .status {
      font-size: 13px;
      color: #555;
      margin-top: 18px;
    }
  </style>
</head>
<body>
  <div class="box">

    <!-- App icon -->
    <div class="logo">
      ${APP_LOGO_URL
        ? `<img src="${e(APP_LOGO_URL)}" alt="Zexplayer" width="88" height="88">`
        : `<svg width="52" height="52" viewBox="0 0 52 52" fill="none">
        <rect width="52" height="52" rx="13" fill="#0d0d1a"/>
        <polygon points="18,13 42,26 18,39" fill="#00e5ff"/>
      </svg>`}
    </div>

    <h2>Zexplayer Required</h2>
    <p class="subtitle" id="subtitle">To watch this video, please download the Zexplayer app.</p>

    <!-- Android: opens Play Store / deep link -->
    <a
      class="btn-playstore"
      id="btnPlayStore"
      href="https://play.google.com/store/apps/details?id=com.novax.player.novax_player"
      target="_blank"
      rel="noopener"
    >
      <!-- Play Store triangle icon -->
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5v-17c0-.83 1-.83 1.5-.5l15 8.5c.5.29.5 1.21 0 1.5L4.5 21c-.5.33-1.5.33-1.5-.5z"/></svg>
      <span id="btnPlayStoreLabel">Download from Play Store</span>
    </a>

    <!-- iOS: opens browser player directly -->
    <a
      class="btn-appstore"
      id="btnAppStore"
      href="${e(browserPlay)}"
    >
      <!-- Apple icon -->
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
      <span id="btnAppStoreLabel">Watch in Browser</span>
    </a>

    <!-- After-installing hint (shown after delay) -->
    <div class="hint" id="hint" style="display:none">
      <div class="hint-title" id="hintTitle">💡 After installing:</div>
      <ul id="hintList">
        <li>Open the app</li>
        <li>Click this link again</li>
        <li>Video will play in the app automatically</li>
      </ul>
    </div>

    <p class="status" id="status"></p>

  </div>

  <script>
    (function () {
      var shortCode   = '${shortCode}';
      var fallbackUrl = '${e(appUrl)}';
      var ua          = navigator.userAgent || '';
      var isAndroid   = /Android/i.test(ua);
      var isIOS       = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIOS) {
        // ── iOS ────────────────────────────────────────────────────────────────
        // Mark body so CSS flips button styles
        document.body.classList.add('ios');

        // Move App Store button above Play Store button (primary action first)
        var box         = document.querySelector('.box');
        var btnPlayStore = document.getElementById('btnPlayStore');
        var btnAppStore  = document.getElementById('btnAppStore');
        box.insertBefore(btnAppStore, btnPlayStore);

        // Update Play Store button label + behaviour for iOS context
        document.getElementById('btnPlayStoreLabel').textContent = 'Download from Play Store';
        // Play Store opens in new tab (user may still want Android version)
        btnPlayStore.setAttribute('target', '_blank');

        // Try to open the app via custom scheme
        window.location.href = 'novax://watch/' + shortCode;

        // After 2s: app not found — nudge user toward browser player
        setTimeout(function () {
          document.getElementById('subtitle').textContent =
            'App not found on your device. Tap below to watch in your browser.';
          document.getElementById('status').textContent =
            'No app detected — browser playback available above.';
          // Update hint for iOS context
          document.getElementById('hintTitle').textContent = '💡 Tip:';
          document.getElementById('hintList').innerHTML =
            '<li>Tap "Watch in Browser" to play now</li>' +
            '<li>No app needed — plays right here</li>' +
            '<li>Views & earnings count normally</li>';
          document.getElementById('hint').style.display = 'block';
        }, 2000);

      } else if (isAndroid) {
        // ── Android ────────────────────────────────────────────────────────────
        // intent:// URL so OS handles deep link natively
        var intentUrl =
          'intent://watch/' + shortCode +
          '#Intent' +
          ';scheme=novax' +
          ';package=com.novax.player.novax_player' +
          ';S.browser_fallback_url=' + encodeURIComponent(fallbackUrl) +
          ';end';
        window.location.href = intentUrl;

        // After 2.5s show hint if app didn't open
        setTimeout(function () {
          document.getElementById('status').textContent = 'App not found. Please install Zexplayer.';
          document.getElementById('hint').style.display = 'block';
        }, 2500);

      } else {
        // ── Desktop / other ────────────────────────────────────────────────────
        // Just show both buttons, no auto-redirect
        document.getElementById('subtitle').textContent =
          'Open this link on your Android or iOS device to watch in the app.';
      }
    }());
  </script>
</body>
</html>`);
});

module.exports = router;
