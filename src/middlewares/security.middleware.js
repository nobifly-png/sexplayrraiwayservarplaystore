const helmet = require('helmet');
const cors = require('cors');
const { corsOrigins, env } = require('../config/env');
const logger = require('../config/logger');

const corsOptions = {
  origin: (origin, callback) => {
    // No origin = mobile app, curl, server-to-server — allow
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    logger.warn({ origin }, 'CORS: rejected origin');
    callback(new Error('Not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // return 200 for OPTIONS preflight (not 204)
};

const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false // allow video embeds
};

/**
 * Recursively strip keys starting with $ or containing . to prevent NoSQL injection.
 */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else {
      sanitizeObject(obj[key]);
    }
  }
};

const noSqlInjectionGuard = (req, _res, next) => {
  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);
  next();
};

const securityMiddleware = [
  helmet(helmetOptions),
  cors(corsOptions),
  noSqlInjectionGuard
];

module.exports = securityMiddleware;
