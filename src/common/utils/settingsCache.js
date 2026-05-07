const SystemSetting = require('../../modules/settings/systemSetting.model');

const TTL_MS = 60 * 1000; // 60 seconds
const cache = new Map(); // key -> { value, expiresAt }

const getSetting = async (key) => {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.doc;

  const doc = await SystemSetting.findOne({ key }).lean();
  cache.set(key, { doc, expiresAt: now + TTL_MS });
  return doc;
};

const invalidate = (key) => {
  if (key) cache.delete(key);
  else cache.clear();
};

module.exports = { getSetting, invalidate };
