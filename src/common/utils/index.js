const crypto = require('crypto');
const path = require('path');
const { customAlphabet } = require('nanoid');

const sanitizeUploadFileName = (raw) => {
  if (typeof raw !== 'string') {
    throw new Error('Invalid file name');
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Invalid file name');
  }
  const base = path.basename(trimmed.replace(/\\/g, '/'));
  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid file name');
  }
  if (base.includes('\0') || /[\\/]/.test(base)) {
    throw new Error('Invalid file name');
  }
  if (base.length > 255) {
    throw new Error('File name too long');
  }
  return base;
};

const generateShortCode = () => {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 8);
  return nanoid();
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateStorageKey = (userId, filename) => {
  const safe = sanitizeUploadFileName(filename);
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const extFromName = path.extname(safe).replace(/^\./, '');
  const ext = (extFromName || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'bin';
  return `videos/${userId}/${timestamp}-${random}.${ext}`;
};

const parseUserAgent = (userAgent) => {
  const isMobile = /mobile|android|iphone|ipad|phone/i.test(userAgent);
  const isBot = /bot|crawler|spider|scraper/i.test(userAgent);
  return {
    isMobile,
    isBot,
    raw: userAgent
  };
};

const getDeviceType = (userAgent) => {
  if (/mobile|android|iphone|phone/i.test(userAgent)) return 'mobile';
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

const generateIdempotencyKey = (...parts) => {
  return crypto.createHash('sha256').update(parts.join('-')).digest('hex');
};

module.exports = {
  generateShortCode,
  hashToken,
  sanitizeUploadFileName,
  generateStorageKey,
  parseUserAgent,
  getDeviceType,
  generateIdempotencyKey
};
