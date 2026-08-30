/**
 * TeraBox Service
 * Resolves TeraBox share links via AR Digital Services API,
 * streams the file to Cloudflare R2, and returns a Zaxgram link.
 *
 * API docs: https://api.teraboxdl.site
 * Auth: Simple API key (no separate secret required)
 */

const https = require('https');
const http = require('http');
const { terabox: teraboxConfig } = require('../../config/env');
const { streamUrlToR2, buildVideoStorageKey } = require('../telegram/r2.utils');
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

/* ─── HTTP helper ────────────────────────────────────────────────────────── */
const httpPost = (url, headers, body) => new Promise((resolve, reject) => {
  const payload = JSON.stringify(body);
  const parsed = new URL(url);
  const proto = parsed.protocol === 'https:' ? https : http;

  const req = proto.request({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...headers
    },
    timeout: 30000
  }, (res) => {
    let data = '';
    res.on('data', c => { data += c; });
    res.on('end', () => {
      try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
      catch { reject(new Error('TeraBox API returned non-JSON response')); }
    });
    res.on('error', reject);
  });

  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('TeraBox API request timed out')); });
  req.write(payload);
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
    if (!teraboxConfig.apiKey) {
      throw new Error('TERABOX_API_KEY is not configured');
    }

    if (!quotaTracker.check()) {
      throw new Error('TeraBox daily quota exceeded. Try again tomorrow.');
    }

    if (!rateLimiter.consume()) {
      throw new Error('TeraBox rate limit reached. Please wait a moment.');
    }

    const endpoint = `${teraboxConfig.apiBaseUrl}/v1/api`;
    const body = { url: shareUrl, dir_path: '', page: 1 };
    const headers = { 'X-API-Key': teraboxConfig.apiKey };

    logger.info({ shareUrl }, 'TeraBox: resolving link');

    const { status, body: result } = await httpPost(endpoint, headers, body);

    if (status !== 200) {
      throw new Error(`TeraBox API HTTP error: ${status}`);
    }

    if (result.errno !== 0) {
      throw new Error(`TeraBox API error ${result.errno}: ${result.errmsg || result.message || 'Unknown error'}`);
    }

    quotaTracker.increment();

    // Extract file info from response
    // API returns list array with file objects
    const files = result.list || result.files || result.data || [];
    if (!files.length) {
      throw new Error('TeraBox API returned no files for this link');
    }

    const file = files[0];
    const downloadUrl = file.dlink || file.download_url || file.url;
    if (!downloadUrl) {
      throw new Error('TeraBox API did not return a download URL');
    }

    const filename = file.server_filename || file.filename || file.name || 'video.mp4';
    const fileSize = parseInt(file.size || file.file_size || 0, 10);
    const mimeType = file.isdir ? null : (
      filename.match(/\.(mp4|mkv|mov|avi|webm)$/i) ? 'video/mp4' : 'application/octet-stream'
    );

    logger.info({ filename, fileSize, downloadUrl: downloadUrl.substring(0, 60) + '...' },
      'TeraBox: link resolved');

    return { downloadUrl, filename, fileSize, mimeType };
  }

  /**
   * Full pipeline: resolve TeraBox link → stream to R2 → return storageKey + publicUrl
   * @param {string} shareUrl
   * @param {string} userId - for R2 key namespacing
   * @returns {{ storageKey, publicUrl, filename, fileSize, mimeType }}
   */
  async convertToR2(shareUrl, userId) {
    const { downloadUrl, filename, fileSize, mimeType } = await this.resolveLink(shareUrl);

    const ext = filename.split('.').pop().toLowerCase() || 'mp4';
    const storageKey = buildVideoStorageKey(userId, ext);

    logger.info({ storageKey, fileSize }, 'TeraBox: starting R2 upload');

    const uploadResult = await streamUrlToR2(downloadUrl, storageKey, mimeType || 'video/mp4', fileSize);

    logger.info({ storageKey, uploadedBytes: uploadResult.fileSize }, 'TeraBox: R2 upload complete');

    return {
      storageKey,
      publicUrl: uploadResult.url,
      filename,
      fileSize: uploadResult.fileSize,
      mimeType: mimeType || 'video/mp4'
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
