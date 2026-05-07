require('dotenv').config();

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Express `trust proxy`: number of reverse-proxy hops, or false for direct connections.
 * Do not set to `true` (trust all) in production — use 1 behind a single trusted proxy.
 * @see docs/BACKEND_DEPLOYMENT.md
 */
const parseTrustProxy = (raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return false;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no') {
    return false;
  }
  if (s === 'true' || s === 'yes') {
    return 1;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 0 && n <= 32) {
    return n === 0 ? false : n;
  }
  return false;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 5000),
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`,
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRES_IN || process.env.JWT_REFRESH_EXPIRY || '7d'
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    endpoint: process.env.R2_ENDPOINT,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_URL,
    region: process.env.R2_REGION || 'auto'
  },
  /** Comma-separated origins; first used as default in APP_URL examples */
  corsOrigins: (() => {
    const raw = process.env.CORS_ORIGIN || 'http://localhost:3000';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  })(),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  /** /api/admin, /api/settings, /api/fraud (15 min window) */
  adminRateLimitMax: parseNumber(process.env.ADMIN_RATE_LIMIT_MAX, 120),
  /** POST /api/withdrawals (15 min window) */
  withdrawalRateLimitMax: parseNumber(process.env.WITHDRAWAL_RATE_LIMIT_MAX, 40),
  /** Auth routes only; production default 5 / 15m, dev default higher for local scripts */
  authRateLimitMax: parseNumber(
    process.env.AUTH_RATE_LIMIT_MAX,
    process.env.NODE_ENV === 'production' ? 5 : 60
  ),
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    enabled: process.env.TELEGRAM_BOT_ENABLED === 'true' && Boolean(process.env.TELEGRAM_BOT_TOKEN)
  },
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@clipnova.local',
    password: process.env.SUPER_ADMIN_PASSWORD
  },
  /** Express trust proxy setting (from TRUST_PROXY). Default false for local dev. */
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY)
};

const isPlaceholder = (value) => {
  if (!value) return true;
  const normalized = String(value).toLowerCase();
  return normalized.includes('replace-with') || normalized.includes('placeholder') || normalized.includes('your-');
};

const validateRuntimeConfig = () => {
  const errors = [];
  const { isSuperAdminEmailAllowed } = require('./superAdminPolicy');

  if (!config.mongoUri) {
    errors.push('MONGODB_URI is required');
  }

  if (!config.jwt.accessSecret) {
    errors.push('JWT_ACCESS_SECRET is required');
  } else if (isPlaceholder(config.jwt.accessSecret)) {
    errors.push('JWT_ACCESS_SECRET must not be a placeholder value');
  } else if (String(config.jwt.accessSecret).length < 32) {
    errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  if (!config.jwt.refreshSecret) {
    errors.push('JWT_REFRESH_SECRET is required');
  } else if (isPlaceholder(config.jwt.refreshSecret)) {
    errors.push('JWT_REFRESH_SECRET must not be a placeholder value');
  } else if (String(config.jwt.refreshSecret).length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
  }

  if (config.env === 'production') {
    if (config.corsOrigins.some((o) => o === '*')) {
      errors.push('CORS_ORIGIN cannot be * in production');
    }

    const r2 = config.r2;
    const r2Fields = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName', 'endpoint'];
    r2Fields.forEach((field) => {
      if (!r2[field] || isPlaceholder(r2[field])) {
        errors.push(`R2_${field.replace(/([A-Z])/g, '_$1').toUpperCase()} is required in production`);
      }
    });
  }

  if (config.env === 'production' && config.superAdmin.email && !isSuperAdminEmailAllowed(config.superAdmin.email)) {
    errors.push(
      'SUPER_ADMIN_EMAIL must be in the super admin allowlist (canonical emails or SUPER_ADMIN_ALLOWLIST)'
    );
  }

  return errors;
};

module.exports = {
  ...config,
  validateRuntimeConfig
};
