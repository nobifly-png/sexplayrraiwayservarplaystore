const logger = require('../../config/logger');

const CONCURRENCY = 2;
const INTER_MSG_DELAY_MS = 400;

const userQueues = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getQueue = (chatId) => {
  if (!userQueues.has(chatId)) {
    userQueues.set(chatId, {
      queue: [], running: 0, total: 0,
      done: 0, failed: 0, skipped: 0,
      flushTimer: null
    });
  }
  return userQueues.get(chatId);
};

const clearQueue = (chatId) => {
  const q = userQueues.get(chatId);
  if (q?.flushTimer) clearTimeout(q.flushTimer);
  userQueues.delete(chatId);
};

const DEFAULT_THUMBNAIL_URL = process.env.DEFAULT_THUMBNAIL_URL || null;

/**
 * Send per-video result as its own Telegram message.
 * Uses sendPhoto if thumbnail available, falls back to sendMessage.
 */
const sendVideoResult = async (ctx, chatId, result) => {
  await sleep(INTER_MSG_DELAY_MS);
  try {
    if (result.skipped) {
      const msg = result.message || (result.shareUrl
        ? `✅ Already Imported\n\n🔗 Watch:\n${result.shareUrl}`
        : `✅ Already Imported\n\nUse /videos to find your link.`);
      const photoUrl = result.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
      if (photoUrl && result.shareUrl) {
        await ctx.telegram.sendPhoto(chatId, photoUrl, { caption: msg }).catch(() =>
          ctx.telegram.sendMessage(chatId, msg).catch(() => {})
        );
      } else {
        await ctx.telegram.sendMessage(chatId, msg).catch(() => {});
      }
    } else if (result.success !== false) {
      const caption = result.message || (
        `✅ Upload Complete\n\n` +
        `🎬 ${result.title}\n` +
        `🔗 ${result.shareUrl}`
      );
      const photoUrl = result.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
      if (photoUrl) {
        await ctx.telegram.sendPhoto(chatId, photoUrl, { caption }).catch(() =>
          ctx.telegram.sendMessage(chatId, caption).catch(() => {})
        );
      } else {
        await ctx.telegram.sendMessage(chatId, caption).catch(() => {});
      }
    } else {
      await ctx.telegram.sendMessage(chatId, `❌ Upload failed: ${result.error || 'Unknown error'}`).catch(() => {});
    }
  } catch (_) {}
};

/**
 * Send clean summary — no links, just counts.
 */
const sendSummary = async (ctx, chatId, q) => {
  await sleep(INTER_MSG_DELAY_MS);
  const text =
    `✅ Import Finished\n\n` +
    `📦 Total: ${q.total}\n` +
    `✅ Uploaded: ${q.done}\n` +
    `🔁 Skipped duplicates: ${q.skipped}\n` +
    `❌ Failed: ${q.failed}\n\n` +
    `Use /videos to see everything.`;
  try {
    await ctx.telegram.sendMessage(chatId, text);
  } catch (_) {}
  clearQueue(chatId);
};

const checkAllDone = (ctx, chatId) => {
  const q = userQueues.get(chatId);
  if (q && q.running === 0 && q.queue.length === 0) {
    // Only send summary if bulk (>1 video)
    if (q.total > 1) sendSummary(ctx, chatId, q).catch(() => {});
    else clearQueue(chatId);
  }
};

const processNext = (ctx, chatId) => {
  const q = getQueue(chatId);

  while (q.running < CONCURRENCY && q.queue.length > 0) {
    const job = q.queue.shift();
    q.running++;

    job.processor()
      .then((result) => {
        if (result.skipped) q.skipped++; else q.done++;
        q.running--;
        sendVideoResult(ctx, chatId, result).catch(() => {});
        processNext(ctx, chatId);
      })
      .catch((err) => {
        q.failed++;
        q.running--;
        logger.error({ err, chatId }, 'BulkQueue: job failed');
        sendVideoResult(ctx, chatId, { success: false, title: job.title, error: err.message }).catch(() => {});
        processNext(ctx, chatId);
      })
      .finally(() => checkAllDone(ctx, chatId));
  }
};

/**
 * @param {object} ctx
 * @param {string} chatId
 * @param {string} title
 * @param {Function} processor — async fn returning { title, shareUrl } or { skipped: true }
 */
const enqueue = (ctx, chatId, title, processor) => {
  const q = getQueue(chatId);
  q.queue.push({ title, processor });
  q.total++;

  if (q.flushTimer) clearTimeout(q.flushTimer);
  q.flushTimer = setTimeout(() => {
    q.flushTimer = null;
    processNext(ctx, chatId);
  }, 500);
};

module.exports = { enqueue, getQueue, clearQueue };
