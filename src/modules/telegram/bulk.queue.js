const logger = require('../../config/logger');

/**
 * Bulk video queue — per chatId queue.
 * Processes videos with controlled concurrency (3 parallel max).
 * Sends progress updates via Telegram.
 */

const CONCURRENCY = 3; // max parallel uploads per user

// chatId -> { queue: [], running: 0, total: 0, done: 0, failed: 0, progressMsgId: null, timer: null }
const userQueues = new Map();

const getQueue = (chatId) => {
  if (!userQueues.has(chatId)) {
    userQueues.set(chatId, {
      queue: [],
      running: 0,
      total: 0,
      done: 0,
      failed: 0,
      results: [],
      progressMsgId: null,
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

/**
 * Update the progress message in Telegram.
 */
const updateProgress = async (ctx, chatId, q) => {
  const total = q.total;
  const done = q.done + q.failed;
  const bar = buildProgressBar(done, total);

  const text =
    `⏳ *Processing Videos...*\n\n` +
    `${bar}\n` +
    `✅ Done: ${q.done}  ❌ Failed: ${q.failed}  📦 Total: ${total}`;

  try {
    if (q.progressMsgId) {
      await ctx.telegram.editMessageText(chatId, q.progressMsgId, undefined, text, { parse_mode: 'Markdown' });
    } else {
      const msg = await ctx.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      q.progressMsgId = msg.message_id;
    }
  } catch (_) {
    // edit can fail if message too old — ignore
  }
};

/**
 * Send final summary when all videos are done.
 */
const sendSummary = async (ctx, chatId, q) => {
  const successResults = q.results.filter((r) => r.success);
  const failedResults = q.results.filter((r) => !r.success);

  let text = `🎉 *Import Complete!*\n\n✅ ${q.done} imported  ❌ ${q.failed} failed\n\n`;

  if (successResults.length > 0) {
    text += `*Your Share Links:*\n`;
    // Show max 30 links to avoid message too long
    const toShow = successResults.slice(0, 30);
    toShow.forEach((r, i) => {
      text += `${i + 1}\\. *${escMd(r.title)}*\n🔗 ${r.shareUrl}\n\n`;
    });
    if (successResults.length > 30) {
      text += `_...and ${successResults.length - 30} more. Use /videos to see all._\n`;
    }
  }

  if (failedResults.length > 0) {
    text += `\n*Failed:*\n`;
    failedResults.slice(0, 10).forEach((r) => {
      text += `• ${escMd(r.title || 'Unknown')}: ${escMd(r.error)}\n`;
    });
  }

  try {
    if (q.progressMsgId) {
      await ctx.telegram.editMessageText(chatId, q.progressMsgId, undefined, text, { parse_mode: 'MarkdownV2' })
        .catch(() => ctx.telegram.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' }));
    } else {
      await ctx.telegram.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
    }
  } catch (_) {
    // fallback plain text
    const plain = `Import Complete! ✅ ${q.done} imported ❌ ${q.failed} failed\n\nUse /videos to see all your videos.`;
    await ctx.telegram.sendMessage(chatId, plain).catch(() => {});
  }

  clearQueue(chatId);
};

/**
 * Process next items in queue up to CONCURRENCY limit.
 */
const processNext = async (ctx, chatId) => {
  const q = getQueue(chatId);

  while (q.running < CONCURRENCY && q.queue.length > 0) {
    const job = q.queue.shift();
    q.running++;

    // Run job async — do not await here
    job.processor()
      .then((result) => {
        q.done++;
        q.running--;
        q.results.push({ success: true, title: result.title, shareUrl: result.shareUrl });
        updateProgress(ctx, chatId, q).catch(() => {});
        processNext(ctx, chatId);
      })
      .catch((err) => {
        q.failed++;
        q.running--;
        q.results.push({ success: false, title: job.title, error: err.message });
        logger.error({ err, chatId }, 'BulkQueue: job failed');
        updateProgress(ctx, chatId, q).catch(() => {});
        processNext(ctx, chatId);
      })
      .finally(() => {
        // Check if all done
        const qCurrent = userQueues.get(chatId);
        if (qCurrent && qCurrent.running === 0 && qCurrent.queue.length === 0) {
          sendSummary(ctx, chatId, qCurrent).catch(() => {});
        }
      });
  }
};

/**
 * Add a video job to the queue.
 * Jobs are batched — a 500ms flush timer groups rapid forwards.
 *
 * @param {object} ctx - Telegraf context
 * @param {string} chatId
 * @param {string} title - display title
 * @param {Function} processor - async function that returns { title, shareUrl }
 */
const enqueue = (ctx, chatId, title, processor) => {
  const q = getQueue(chatId);

  q.queue.push({ title, processor });
  q.total++;

  // Reset flush timer — wait 500ms after last message before starting
  if (q.flushTimer) clearTimeout(q.flushTimer);
  q.flushTimer = setTimeout(() => {
    q.flushTimer = null;
    processNext(ctx, chatId);
  }, 500);
};

const buildProgressBar = (done, total) => {
  if (!total) return '';
  const pct = Math.round((done / total) * 10);
  return '█'.repeat(pct) + '░'.repeat(10 - pct) + ` ${done}/${total}`;
};

const escMd = (text) => {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
};

module.exports = { enqueue, getQueue, clearQueue };
