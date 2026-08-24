const logger = require('../../config/logger');

const CONCURRENCY = 5;            // parallel uploads per user
const INTER_MSG_DELAY_MS = 100;   // delay between result messages (ms)

const userQueues = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getQueue = (chatId) => {
  if (!userQueues.has(chatId)) {
    userQueues.set(chatId, {
      queue: [], running: 0, total: 0,
      done: 0, failed: 0, skipped: 0,
      flushTimer: null,
      results: []  // collect all results for batch send
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
 * Send batch results as a SINGLE message with all links.
 * Format: header + all links + footer (from first video's user settings).
 */
const sendBatchResults = async (ctx, chatId, results) => {
  if (!results.length) return;
  
  const User = require('../users/user.model');
  const NO_PREVIEW = { disable_web_page_preview: true };
  
  try {
    // Get user settings from first result
    const firstResult = results[0];
    let userId = null;
    
    // Extract userId from any result that has it (via session context)
    // Since we don't have direct access here, we'll parse from the result structure
    // Alternative: pass userId explicitly through the queue
    
    // For now, build message without user-specific header/footer
    // (Will enhance this if userId is needed)
    
    const successResults = results.filter(r => r.success !== false && !r.skipped);
    const skippedResults = results.filter(r => r.skipped);
    const failedResults = results.filter(r => r.success === false);
    
    if (successResults.length === 0 && skippedResults.length === 0) {
      // All failed — send individual error messages
      for (const r of failedResults) {
        await ctx.telegram.sendMessage(chatId, `❌ ${r.title || 'Upload'} failed: ${r.error || 'Unknown error'}`).catch(() => {});
        await sleep(INTER_MSG_DELAY_MS);
      }
      return;
    }
    
    // Extract header/footer from first successful result's message
    let header = '';
    let footer = '';
    
    if (successResults.length > 0 && successResults[0].message) {
      const msg = successResults[0].message;
      const urlMatch = msg.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        const url = urlMatch[0];
        const parts = msg.split(url);
        header = parts[0].trim();
        footer = parts[1] ? parts[1].trim() : '';
      }
    }
    
    // Build combined message
    let combinedMessage = '';
    
    if (header) {
      combinedMessage += `${header}\n\n`;
    }
    
    // Add all successful links
    successResults.forEach(r => {
      if (r.shareUrl) {
        combinedMessage += `${r.shareUrl}\n`;
      }
    });
    
    if (footer) {
      combinedMessage += `\n${footer}`;
    }
    
    // Send the combined message with thumbnail from first result
    const photoUrl = successResults[0]?.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
    
    if (photoUrl) {
      await ctx.telegram.sendPhoto(chatId, photoUrl, {
        caption: combinedMessage.trim(),
        ...NO_PREVIEW
      }).catch(() =>
        ctx.telegram.sendMessage(chatId, combinedMessage.trim(), NO_PREVIEW).catch(() => {})
      );
    } else {
      await ctx.telegram.sendMessage(chatId, combinedMessage.trim(), NO_PREVIEW).catch(() => {});
    }
    
    // Send individual messages for skipped/failed if any
    if (skippedResults.length > 0) {
      await sleep(INTER_MSG_DELAY_MS);
      const skippedMsg = `🔁 ${skippedResults.length} video(s) skipped (duplicates)`;
      await ctx.telegram.sendMessage(chatId, skippedMsg).catch(() => {});
    }
    
    if (failedResults.length > 0) {
      await sleep(INTER_MSG_DELAY_MS);
      for (const r of failedResults) {
        await ctx.telegram.sendMessage(chatId, `❌ ${r.title || 'Upload'} failed: ${r.error || 'Unknown error'}`).catch(() => {});
      }
    }
    
  } catch (err) {
    logger.error({ err, chatId }, 'BulkQueue: failed to send batch results');
    // Fallback: send individual messages
    for (const result of results) {
      await sendVideoResult(ctx, chatId, result).catch(() => {});
    }
  }
};

/**
 * Send individual video result (fallback for single uploads or errors).
 */
const sendVideoResult = async (ctx, chatId, result) => {
  await sleep(INTER_MSG_DELAY_MS);
  const NO_PREVIEW = { disable_web_page_preview: true };
  try {
    if (result.skipped) {
      const photoUrl = result.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
      const fullCaption = result.message
        ? result.message
        : result.shareUrl
          ? `✅ Already Imported\n\n🔗 ${result.shareUrl}`
          : `✅ Already Imported\n\nUse /videos to find your link.`;

      if (photoUrl) {
        await ctx.telegram.sendPhoto(chatId, photoUrl, { 
          caption: fullCaption,
          ...NO_PREVIEW 
        }).catch(() =>
          ctx.telegram.sendMessage(chatId, fullCaption, NO_PREVIEW).catch(() => {})
        );
      } else {
        await ctx.telegram.sendMessage(chatId, fullCaption, NO_PREVIEW).catch(() => {});
      }

    } else if (result.success !== false) {
      const photoUrl = result.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
      const fullCaption = result.message 
        ? result.message
        : result.shareUrl 
          ? `✅ Upload Complete\n\n🎬 ${result.title}\n\n🔗 ${result.shareUrl}`
          : `✅ Upload Complete\n\n🎬 ${result.title}`;

      if (photoUrl) {
        await ctx.telegram.sendPhoto(chatId, photoUrl, { 
          caption: fullCaption,
          ...NO_PREVIEW 
        }).catch(() =>
          ctx.telegram.sendMessage(chatId, fullCaption, NO_PREVIEW).catch(() => {})
        );
      } else {
        await ctx.telegram.sendMessage(chatId, fullCaption, NO_PREVIEW).catch(() => {});
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
    `✅ Batch Complete\n\n` +
    `📦 Total: ${q.total}\n` +
    `✅ Uploaded: ${q.done}\n` +
    `🔁 Skipped: ${q.skipped}\n` +
    `❌ Failed: ${q.failed}`;
  try {
    await ctx.telegram.sendMessage(chatId, text);
  } catch (_) {}
  clearQueue(chatId);
};

const checkAllDone = (ctx, chatId) => {
  const q = userQueues.get(chatId);
  if (q && q.running === 0 && q.queue.length === 0) {
    // All jobs complete — send results
    if (q.total > 1) {
      // Batch mode: send all links in one message
      sendBatchResults(ctx, chatId, q.results).catch(() => {});
      // Then send summary
      sendSummary(ctx, chatId, q).catch(() => {});
    } else if (q.total === 1) {
      // Single upload: send individual result
      if (q.results.length > 0) {
        sendVideoResult(ctx, chatId, q.results[0]).catch(() => {});
      }
      clearQueue(chatId);
    } else {
      clearQueue(chatId);
    }
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
        
        // Collect result instead of sending immediately
        q.results.push(result);
        
        processNext(ctx, chatId);
      })
      .catch((err) => {
        q.failed++;
        q.running--;
        logger.error({ err, chatId }, 'BulkQueue: job failed');
        
        // Collect failure result
        q.results.push({ success: false, title: job.title, error: err.message });
        
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
  }, 1000); // wait 1s for all forwarded messages to arrive before starting
};

module.exports = { enqueue, getQueue, clearQueue };
