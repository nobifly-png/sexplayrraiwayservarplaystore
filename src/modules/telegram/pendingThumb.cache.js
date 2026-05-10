/**
 * pendingThumb.cache.js
 * In-memory TTL store for pending thumbnails.
 * When a user sends a photo before a video/link, we cache it here
 * and attach it to the next upload action within TTL.
 *
 * No Redis needed — Map-based with auto-eviction.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 2000;

/** @type {Map<string, { buffer: Buffer, mimeType: string, expiresAt: number }>} */
const store = new Map();

/**
 * Evict expired entries. Called on set to keep memory bounded.
 */
const evict = () => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.expiresAt <= now) store.delete(key);
  }
  // Hard cap
  if (store.size > MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    oldest.slice(0, store.size - MAX_ENTRIES).forEach(([k]) => store.delete(k));
  }
};

/**
 * Store a pending thumbnail for a user.
 * @param {string|number} chatId
 * @param {Buffer} buffer
 * @param {string} mimeType
 */
const setPending = (chatId, buffer, mimeType = 'image/jpeg') => {
  evict();
  store.set(String(chatId), {
    buffer,
    mimeType,
    expiresAt: Date.now() + TTL_MS
  });
};

/**
 * Consume (get + delete) pending thumbnail for a user.
 * Returns null if expired or not set.
 * @param {string|number} chatId
 * @returns {{ buffer: Buffer, mimeType: string } | null}
 */
const consumePending = (chatId) => {
  const key = String(chatId);
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  if (entry.expiresAt <= Date.now()) return null;
  return { buffer: entry.buffer, mimeType: entry.mimeType };
};

/**
 * Check if a pending thumbnail exists (without consuming).
 */
const hasPending = (chatId) => {
  const entry = store.get(String(chatId));
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    store.delete(String(chatId));
    return false;
  }
  return true;
};

/**
 * Clear pending thumbnail for a user.
 */
const clearPending = (chatId) => store.delete(String(chatId));

module.exports = { setPending, consumePending, hasPending, clearPending };
