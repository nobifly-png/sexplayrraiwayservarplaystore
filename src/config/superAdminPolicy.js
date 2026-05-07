/**
 * Super admin allowlist: only these accounts may hold SUPER_ADMIN.
 * Enforced at login, refresh, auth middleware, and seed script.
 *
 * Optional env SUPER_ADMIN_ALLOWLIST: comma-separated extra emails (e.g. staging).
 */
const CANONICAL_SUPER_ADMIN_EMAILS = [
  'nitinchouhan1211@gmail.com',
  'sethusethu5073@gmail.com',
  'admin@clipnova.local'
];

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const parseAllowlistFromEnv = () => {
  const raw = process.env.SUPER_ADMIN_ALLOWLIST || '';
  return raw
    .split(',')
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
};

const getAllowedSuperAdminEmailSet = () => {
  const set = new Set(CANONICAL_SUPER_ADMIN_EMAILS.map(normalizeEmail));
  parseAllowlistFromEnv().forEach((e) => set.add(e));
  return set;
};

const isSuperAdminEmailAllowed = (email) => {
  const n = normalizeEmail(email);
  if (!n) return false;
  return getAllowedSuperAdminEmailSet().has(n);
};

/**
 * @throws {Error} if email is not allowlisted
 */
const assertSuperAdminEmailAllowedForSeed = (email) => {
  if (!isSuperAdminEmailAllowed(email)) {
    throw new Error(
      'SUPER_ADMIN_EMAIL must be in the super admin allowlist. ' +
        'Use one of the canonical accounts or add via SUPER_ADMIN_ALLOWLIST in .env'
    );
  }
};

module.exports = {
  CANONICAL_SUPER_ADMIN_EMAILS,
  normalizeEmail,
  isSuperAdminEmailAllowed,
  assertSuperAdminEmailAllowedForSeed,
  getAllowedSuperAdminEmailSet
};
