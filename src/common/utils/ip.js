/**
 * Client IP for fraud, rate limiting, and access logs.
 * Requires Express `trust proxy` to be set correctly when behind a reverse proxy
 * (see docs/BACKEND_DEPLOYMENT.md and TRUST_PROXY in .env).
 */
const getClientIp = (req) => {
  if (!req) return null;
  const raw = req.ip || req.socket?.remoteAddress || null;
  if (typeof raw !== 'string') return raw;
  // Normalize IPv4-mapped IPv6
  if (raw.startsWith('::ffff:')) {
    return raw.slice(7);
  }
  return raw;
};

module.exports = {
  getClientIp
};
