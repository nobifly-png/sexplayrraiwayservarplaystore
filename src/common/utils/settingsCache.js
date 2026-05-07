const SystemSetting = require('../../modules/settings/systemSetting.model');

const TTL_MS = 60 * 1000;
const cache = new Map();
const inflight = new Map(); // stampede protection

const getSetting = async (key) => {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.doc;

  // If a fetch is already in-flight for this key, wait for it
  if (inflight.has(key)) return inflight.get(key);

  const promise = SystemSetting.findOne({ key }).lean().then((doc) => {
    cache.set(key, { doc, expiresAt: Date.now() + TTL_MS });
    inflight.delete(key);
    return doc;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
};

const invalidate = (key) => {
  if (key) cache.delete(key);
  else cache.clear();
};

module.exports = { getSetting, invalidate };
