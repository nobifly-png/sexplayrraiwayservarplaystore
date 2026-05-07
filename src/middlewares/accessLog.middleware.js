const logger = require('../config/logger');
const { getClientIp } = require('../common/utils/ip');

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'cookie',
  'set-cookie',
  'paymentmethod'
]);

const redactObject = (obj, depth = 0) => {
  if (depth > 4 || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.has(lower)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redactObject(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
};

const accessLog = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    const userId = req.user?.userId || req.user?.id || null;
    const ip = getClientIp(req);

    logger.info({
      type: 'access',
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      requestId: req.id,
      userId,
      ip,
      body: req.method !== 'GET' && req.body && Object.keys(req.body).length
        ? redactObject(req.body)
        : undefined
    });
  });

  next();
};

module.exports = accessLog;
