const {
  DEFAULT_EARNINGS_PER_VIEW,
  MIN_WITHDRAWAL_AMOUNT,
  MAX_VIEWS_PER_IP_PER_HOUR,
  MIN_WATCH_SECONDS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES
} = require('../constants');

/**
 * Safe numeric read from DB Mixed values; falls back when invalid.
 */
const safePositiveNumber = (raw, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    return fallback;
  }
  return n;
};

const safeInt = (raw, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    return fallback;
  }
  return n;
};

const safeBoolean = (raw, fallback) => {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
};

const safeMimeList = (raw, fallback) => {
  if (!Array.isArray(raw) || raw.length === 0) return [...fallback];
  const allowed = new Set(fallback);
  const filtered = raw.filter((m) => typeof m === 'string' && allowed.has(m));
  return filtered.length > 0 ? filtered : [...fallback];
};

const getEarningsPerValidView = (doc) =>
  safePositiveNumber(doc?.value, DEFAULT_EARNINGS_PER_VIEW, { min: 0, max: 1000 });

const getMinimumWithdrawalAmount = (doc) =>
  safePositiveNumber(doc?.value, MIN_WITHDRAWAL_AMOUNT, { min: 0, max: 1e9 });

const getMaxViewsPerIpPerHour = (doc) =>
  safeInt(doc?.value, MAX_VIEWS_PER_IP_PER_HOUR, { min: 1, max: 100000 });

const getMinimumWatchSeconds = (doc) =>
  safePositiveNumber(doc?.value, MIN_WATCH_SECONDS, { min: 0, max: 86400 });

const getMaxUploadSizeBytes = (doc) =>
  safeInt(doc?.value, MAX_UPLOAD_SIZE_BYTES, { min: 1024, max: 10737418240 });

const getAllowedVideoMimeTypes = (doc) =>
  safeMimeList(doc?.value, ALLOWED_VIDEO_MIME_TYPES);

module.exports = {
  safePositiveNumber,
  safeInt,
  safeBoolean,
  safeMimeList,
  getEarningsPerValidView,
  getMinimumWithdrawalAmount,
  getMaxViewsPerIpPerHour,
  getMinimumWatchSeconds,
  getMaxUploadSizeBytes,
  getAllowedVideoMimeTypes
};
