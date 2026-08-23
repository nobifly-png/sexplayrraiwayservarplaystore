/**
 * Simple sliding-window rate limiter keyed by chatId.
 * No external deps — Map-based, auto-evicts old entries.
 */

const windows = new Map(); // chatId -> [timestamp, ...]

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;     // max ingest requests per minute per user (supports bulk 100-video forwards)

const isRateLimited = (chatId) => {
  const now = Date.now();
  const key = String(chatId);
  const hits = (windows.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  windows.set(key, hits);

  // Evict old keys every 500 entries to prevent unbounded growth
  if (windows.size > 500) {
    for (const [k, v] of windows) {
      if (v.every((t) => now - t >= WINDOW_MS)) windows.delete(k);
    }
  }

  return hits.length > MAX_REQUESTS;
};

module.exports = { isRateLimited };
