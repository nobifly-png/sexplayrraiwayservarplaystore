const rateLimit = require('express-rate-limit');
const {
  rateLimit: rateLimitConfig,
  authRateLimitMax,
  adminRateLimitMax,
  withdrawalRateLimitMax
} = require('../config/env');

/** Uses req.ip (honors Express `trust proxy` — see docs/BACKEND_DEPLOYMENT.md). */
const createRateLimiter = (windowMs, max) => {
  return rateLimit({
    windowMs: windowMs || rateLimitConfig.windowMs,
    max: max || rateLimitConfig.maxRequests,
    message: { success: false, message: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
  });
};

const generalLimiter = createRateLimiter();
const authLimiter = createRateLimiter(15 * 60 * 1000, authRateLimitMax);
const playbackLimiter = createRateLimiter(60 * 1000, 60);
/** Super-admin routes: /api/admin, /api/settings, /api/fraud */
const adminLimiter = createRateLimiter(15 * 60 * 1000, adminRateLimitMax);
/** POST /api/withdrawals */
const withdrawalLimiter = createRateLimiter(15 * 60 * 1000, withdrawalRateLimitMax);

module.exports = {
  generalLimiter,
  authLimiter,
  playbackLimiter,
  adminLimiter,
  withdrawalLimiter,
  createRateLimiter
};
