/**
 * pendingThumb.cache.js
 * In-memory TTL store for pending thumbnails.
 * When a user sends a photo before a video/link, we cache it here
 * and attach it to ALL subsequent uploads within TTL (batch mode).
 *
 * Features:
 * - Batch mode: thumbnail applies to multiple videos (not consumed on first use)
 * - Auto-replace: new thumbnail clears the old one
 * - Manual clear: /clearthumb command
 * - Auto-expiry: 5 minutes TTL
 *
 * No Redis needed — Map-based with auto-eviction.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 2000;

/** @type {Map<string, { buffer: Buffer, mimeType: string, expiresAt: number, usageCount: number }>} */
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
 * Auto-replaces any existing thumbnail (clears old when new arrives).
 * Batch mode enabled by default — thumbnail applies to all videos until cleared/expired.
 * @param {string|number} chatId
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {boolean} - true if replaced existing thumbnail, false if new
 */
const setPending = (chatId, buffer, mimeType = 'image/jpeg') => {
  evict();
  const key = String(chatId);
  const hadExisting = store.has(key);
  
  store.set(key, {
    buffer,
    mimeType,
    expiresAt: Date.now() + TTL_MS,
    usageCount: 0  // track how many times this thumbnail was used
  });
  
  return hadExisting; // true if we replaced an old thumbnail
};

/**
 * Get pending thumbnail WITHOUT consuming it (batch mode).
 * Thumbnail stays in cache for multiple videos until manually cleared or expired.
 * Returns null if expired or not set.
 * @param {string|number} chatId
 * @returns {{ buffer: Buffer, mimeType: string } | null}
 */
const consumePending = (chatId) => {
  const key = String(chatId);
  const entry = store.get(key);
  if (!entry) return null;
  
  // Check expiry
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  
  // Batch mode: DON'T delete — increment usage counter and return thumbnail
  entry.usageCount++;
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
