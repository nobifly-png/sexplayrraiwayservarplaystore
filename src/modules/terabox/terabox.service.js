/**
 * TeraBox Service
 * Resolves TeraBox share links via AR Digital Services API,
 * streams the file to Cloudflare R2, and returns a Zaxgram link.
 *
 * Auth: HMAC-SHA256 signed — requires API_KEY + API_SECRET
 * Signature: HMAC-SHA256("POST/v1/api" + timestamp + body, API_SECRET)
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { terabox: teraboxConfig } = require('../../config/env');
const { streamUrlToR2, buildVideoStorageKey, uploadBufferToR2 } = require('../telegram/r2.utils');
const logger = require('../../config/logger');

/* ─── Rate limiter (token bucket) ───────────────────────────────────────── */
// Keeps request count within TERABOX_RATE_LIMIT_PER_MIN per minute
const rateLimiter = {
  tokens: teraboxConfig.rateLimitPerMin,
  lastRefill: Date.now(),
  consume() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= 60000) {
      this.tokens = teraboxConfig.rateLimitPerMin;
      this.lastRefill = now;
    }
    if (this.tokens <= 0) return false;
    this.tokens--;
    return true;
  }
};

/* ─── Daily quota tracker ────────────────────────────────────────────────── */
const quotaTracker = {
  count: 0,
  date: new Date().toDateString(),
  increment() {
    const today = new Date().toDateString();
    if (today !== this.date) { this.count = 0; this.date = today; }
    this.count++;
    const pct = (this.count / teraboxConfig.dailyQuota) * 100;
    if (pct >= 80) {
      logger.warn({ used: this.count, quota: teraboxConfig.dailyQuota, pct: pct.toFixed(1) },
        'TeraBox: daily quota above 80%');
    }
    return this.count;
  },
  check() {
    const today = new Date().toDateString();
    if (today !== this.date) { this.count = 0; this.date = today; }
    return this.count < teraboxConfig.dailyQuota;
  }
};

/* ─── HMAC signature builder ─────────────────────────────────────────────── */
const buildSignature = (timestamp, bodyStr) => {
  const apiSecret = process.env.TERABOX_API_SECRET;
  if (!apiSecret) return null;
  const message = `POST/v1/api${timestamp}${bodyStr}`;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
};

/* ─── HTTP helper ────────────────────────────────────────────────────────── */
const httpPost = (url, body) => new Promise((resolve, reject) => {
  // IMPORTANT: Use compact JSON (no spaces) — required for HMAC signature match
  const bodyStr = JSON.stringify(body, null, 0);
  const parsed = new URL(url);
  const proto = parsed.protocol === 'https:' ? https : http;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = buildSignature(timestamp, bodyStr);

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyStr),
    'X-API-Key': teraboxConfig.apiKey,
    'X-Timestamp': timestamp
  };
  if (signature) headers['X-Signature'] = signature;

  logger.info({ endpoint: url, timestamp, hasSignature: !!signature }, 'TeraBox: API request');

  const req = proto.request({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers,
    timeout: 30000
  }, (res) => {
    let data = '';
    res.on('data', c => { data += c; });
    res.on('end', () => {
      logger.info({ status: res.statusCode, dataLength: data.length, preview: data.substring(0, 100) }, 'TeraBox: API raw response');
      try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
      catch { reject(new Error(`TeraBox API returned non-JSON response (HTTP ${res.statusCode}): ${data.substring(0, 200)}`)); }
    });
    res.on('error', reject);
  });

  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('TeraBox API request timed out')); });
  req.write(bodyStr);
  req.end();
});

/* ─── Main service ───────────────────────────────────────────────────────── */
class TeraboxService {
  /**
   * Resolve a TeraBox share URL to a direct download link.
   * @param {string} shareUrl - e.g. https://1024terabox.com/s/abc123
   * @returns {{ downloadUrl, filename, fileSize, mimeType }}
   */
  async resolveLink(shareUrl) {
    if (!teraboxConfig.apiKey) throw new Error('TERABOX_API_KEY is not configured');
    if (!quotaTracker.check()) throw new Error('TeraBox daily quota exceeded. Try again tomorrow.');
    if (!rateLimiter.consume()) throw new Error('TeraBox rate limit reached. Please wait a moment.');

    const endpoint = `${teraboxConfig.apiBaseUrl}/v1/api`;
    const body = { url: shareUrl, dir_path: '', page: 1 };

    logger.info({ shareUrl }, 'TeraBox: resolving link');

    const { status, body: result } = await httpPost(endpoint, body);

    if (status !== 200) throw new Error(`TeraBox API HTTP error: ${status}`);
    if (result.errno !== 0) {
      throw new Error(`TeraBox API error ${result.errno}: ${result.errmsg || result.message || 'Unknown error'}`);
    }

    quotaTracker.increment();

    const files = result.list || [];
    if (!files.length) throw new Error('TeraBox API returned no files for this link');

    // Find first non-folder video file
    const file = files.find(f => !f.isdir) || files[0];

    // Correct field from actual API response: direct_link (not dlink)
    const downloadUrl = file.direct_link || file.dlink || file.download_url;
    if (!downloadUrl) throw new Error('TeraBox API did not return a download URL');

    const filename = file.server_filename || file.filename || 'video.mp4';
    const fileSize = parseInt(file.size || 0, 10);
    const duration = parseInt(file.duration || 0, 10);

    // Thumbnail — url3 is largest (850x580), url1 is smallest (140x90)
    const thumbUrl = file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1 || null;

    const ext = filename.split('.').pop().toLowerCase();
    const mimeType = ['mp4','mkv','mov','avi','webm','m4v'].includes(ext)
      ? 'video/mp4' : 'application/octet-stream';

    logger.info({ filename, fileSize, duration, hasThumb: !!thumbUrl },
      'TeraBox: link resolved successfully');

    return { downloadUrl, filename, fileSize, duration, mimeType, thumbUrl };
  }

  /**
   * Full pipeline: resolve TeraBox link → stream to R2 → return storageKey + publicUrl
   * @param {string} shareUrl
   * @param {string} userId - for R2 key namespacing
   * @returns {{ storageKey, publicUrl, filename, fileSize, mimeType }}
   */
  async convertToR2(shareUrl, userId) {
    const { downloadUrl, filename, fileSize, duration, mimeType, thumbUrl } = await this.resolveLink(shareUrl);

    const ext = filename.split('.').pop().toLowerCase() || 'mp4';
    const storageKey = buildVideoStorageKey(userId, ext);

    logger.info({ storageKey, fileSize, downloadUrl: downloadUrl.substring(0, 80) }, 'TeraBox: starting R2 upload');

    // Retry up to 3 times — TeraBox CDN occasionally returns HTTP 500
    let uploadResult;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        uploadResult = await streamUrlToR2(downloadUrl, storageKey, mimeType || 'video/mp4', fileSize);
        break;
      } catch (err) {
        lastErr = err;
        logger.warn({ attempt, err: err.message }, `TeraBox: R2 upload attempt ${attempt} failed`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    if (!uploadResult) {
      logger.error({ err: lastErr.message }, 'TeraBox: all 3 R2 upload attempts failed');
      throw new Error(`TeraBox R2 upload failed after 3 attempts: ${lastErr.message}`);
    }

    logger.info({ storageKey, uploadedBytes: uploadResult.fileSize }, 'TeraBox: R2 upload complete');

    return {
      storageKey,
      publicUrl: uploadResult.url,
      filename,
      fileSize: uploadResult.fileSize,
      mimeType: mimeType || 'video/mp4',
      duration,
      thumbUrl  // pass through for Video record
    };
  }

  /** Current quota usage (for health/debug endpoints) */
  getQuotaStatus() {
    return {
      used: quotaTracker.count,
      limit: teraboxConfig.dailyQuota,
      remaining: Math.max(0, teraboxConfig.dailyQuota - quotaTracker.count),
      resetAt: 'midnight UTC'
    };
  }
}

module.exports = new TeraboxService();
