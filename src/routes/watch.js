const express = require('express');
const linkService = require('../modules/links/link.service');
const logger = require('../config/logger');
const { publicBaseUrl } = require('../config/r2');

const DEFAULT_THUMBNAIL_URL = process.env.DEFAULT_THUMBNAIL_URL || '';
const BACKEND_URL = process.env.APP_URL || '';

const router = express.Router();

router.get('/watch/:shortCode', async (req, res) => {
  const { shortCode } = req.params;

  let title = 'Zexgram';
  let thumbnailUrl = DEFAULT_THUMBNAIL_URL;
  let description = 'Watch this video on Zexgram';
  let videoUrl = null;
  let linkId = null;
  let error = null;

  try {
    const { link, video } = await linkService.resolveLinkByShortCode(shortCode);
    title = video.title || title;
    description = video.description || description;
    thumbnailUrl = video.thumbnailUrl || DEFAULT_THUMBNAIL_URL || '';
    linkId = link._id.toString();
    videoUrl = video.storageKey && publicBaseUrl
      ? `${publicBaseUrl}/${video.storageKey}`
      : video.externalUrl || null;
  } catch (err) {
    logger.warn({ shortCode, errMsg: err.message }, 'Watch page: link not found');
    error = 'Video not found or link is inactive.';
  }

  const watchUrl = `${BACKEND_URL}/watch/${shortCode}`;
  const apiBase = `${BACKEND_URL}/api`;
  const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  <meta property="og:url" content="${e(watchUrl)}">
  ${thumbnailUrl ? `<meta property="og:image" content="${e(thumbnailUrl)}">` : ''}
  <meta name="twitter:card" content="${thumbnailUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${e(title)}">
  <meta name="twitter:description" content="${e(description)}">
  ${thumbnailUrl ? `<meta name="twitter:image" content="${e(thumbnailUrl)}">` : ''}
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center}
    .hdr{width:100%;max-width:820px;padding:14px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #1a1a1a}
    .logo{width:34px;height:34px;background:linear-gradient(135deg,#00e5ff,#0097a7);border-radius:50%;display:flex;align-items:center;justify-content:center}
    .brand{font-size:17px;font-weight:800;color:#00e5ff;letter-spacing:2px}
    .wrap{width:100%;max-width:820px;padding:20px}
    .vbox{position:relative;width:100%;background:#111;border-radius:14px;overflow:hidden;box-shadow:0 4px 40px rgba(0,229,255,.12)}
    video{width:100%;display:block;max-height:72vh;background:#000}
    .overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(0,0,0,.35)}
    .overlay img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
    .pbtn{position:relative;z-index:1;width:74px;height:74px;background:rgba(0,229,255,.92);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 36px rgba(0,229,255,.5);transition:transform .15s}
    .pbtn:hover{transform:scale(1.08)}
    .info{padding:14px 0 6px}
    .vtitle{font-size:17px;font-weight:600;line-height:1.4;margin-bottom:6px}
    .vdesc{font-size:13px;color:#777;line-height:1.5;margin-bottom:10px}
    .badge{display:inline-flex;align-items:center;gap:5px;background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.25);border-radius:20px;padding:4px 12px;font-size:12px;color:#00e5ff}
    .err{text-align:center;padding:80px 20px;color:#666}
    .err h2{color:#ff5252;margin-bottom:8px;font-size:20px}
  </style>
</head>
<body>
  <div class="hdr">
    <div class="logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="#0a0a0a"><path d="M8 5v14l11-7z"/></svg></div>
    <span class="brand">ZEXGRAM</span>
  </div>
  <div class="wrap">
    ${error ? `<div class="err"><h2>Video Unavailable</h2><p>${e(error)}</p></div>` : `
    <div class="vbox" id="vbox">
      <div class="overlay" id="ov" onclick="startPlay()">
        ${thumbnailUrl ? `<img src="${e(thumbnailUrl)}" alt="">` : ''}
        <div class="pbtn"><svg width="30" height="30" viewBox="0 0 24 24" fill="#0a0a0a"><path d="M8 5v14l11-7z"/></svg></div>
      </div>
      <video id="vid" preload="metadata" playsinline ${thumbnailUrl ? `poster="${e(thumbnailUrl)}"` : ''}>
        <source src="${e(videoUrl || '')}" type="video/mp4">
      </video>
    </div>
    <div class="info">
      <div class="vtitle">${e(title)}</div>
      ${description && description !== 'Watch this video on Zexgram' ? `<div class="vdesc">${e(description)}</div>` : ''}
      <span class="badge">&#x1F4B0; Creator earns on every real view</span>
    </div>
    `}
  </div>
  <script>
    var API='${apiBase}',LID='${linkId || ''}',sid=null,hb=null,lastPos=0;
    var vid=document.getElementById('vid');
    function fp(){try{return btoa([navigator.language,screen.width,screen.height,navigator.hardwareConcurrency,new Date().getTimezoneOffset()].join('|')).slice(0,32)}catch(e){return 'browser'}}
    async function post(path,body){try{await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}catch(e){}}
    async function initSess(){
      if(!LID)return;
      try{
        var r=await fetch(API+'/playback/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({linkId:LID,fingerprint:fp()})});
        var d=await r.json();
        sid=(d.data&&d.data.sessionId)||d.sessionId||null;
      }catch(e){}
    }
    function ev(t,p){if(!sid)return;post('/playback/event',{sessionId:sid,eventType:t,positionSeconds:Math.floor(p||0)})}
    function fin(){if(!sid)return;post('/playback/finalize',{sessionId:sid});sid=null}
    function startPlay(){
      var o=document.getElementById('ov');
      if(o)o.style.display='none';
      if(vid)vid.play().catch(function(){});
    }
    if(vid){
      initSess();
      vid.addEventListener('play',function(){
        ev('PLAY',vid.currentTime);
        clearInterval(hb);
        hb=setInterval(function(){ev('HEARTBEAT',vid.currentTime)},10000);
      });
      vid.addEventListener('pause',function(){clearInterval(hb);ev('PAUSE',vid.currentTime)});
      vid.addEventListener('timeupdate',function(){
        var cur=Math.floor(vid.currentTime);
        if(cur>0&&cur!==lastPos&&cur%5===0){lastPos=cur;ev('PROGRESS',vid.currentTime)}
      });
      vid.addEventListener('ended',function(){clearInterval(hb);ev('END',vid.currentTime);fin()});
      window.addEventListener('beforeunload',function(){clearInterval(hb);fin()});
      window.addEventListener('pagehide',function(){clearInterval(hb);fin()});
    }
  <\/script>
</body>
</html>`);
});

module.exports = router;
