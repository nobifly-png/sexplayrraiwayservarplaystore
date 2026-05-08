const IngestJob = require('./ingestJob.model');
const { INGEST_STATUS } = require('./ingestJob.model');
const Video = require('../videos/video.model');
const { VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');
const { normalizeTeraboxUrl, SUPPORTED_SOURCES } = require('./link.parser');
const logger = require('../../config/logger');

/**
 * Derive a human-readable title from a URL.
 */
const titleFromUrl = (url, source) => {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const last = pathParts[pathParts.length - 1] || '';
    const clean = decodeURIComponent(last)
      .replace(/[-_]/g, ' ')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .trim();
    if (clean.length >= 3) return clean.slice(0, 120);
  } catch { /* ignore */ }
  return `${source} Video`;
};

/**
 * Normalize URL per source.
 */
const normalizeUrl = (url, source) => {
  if (source === SUPPORTED_SOURCES.TERABOX) return normalizeTeraboxUrl(url);
  try {
    const parsed = new URL(url);
    // Strip common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid'].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    return parsed.toString();
  } catch {
    return url;
  }
};

class IngestService {
  /**
   * Full pipeline: validate → deduplicate → create DB records → return job.
   * This is synchronous from the bot's perspective — no background queue needed
   * since EXTERNAL_REF videos are immediately READY.
   */
  async ingest(creatorId, rawUrl, source, telegramCtx = {}) {
    const normalizedUrl = normalizeUrl(rawUrl, source);

    logger.info({ creatorId, source, normalizedUrl }, 'Ingest: starting');

    // Duplicate check — same creator, same normalized URL, not failed
    const existing = await IngestJob.findOne({
      creatorId,
      normalizedUrl,
      status: { $in: [INGEST_STATUS.DONE, INGEST_STATUS.PROCESSING, INGEST_STATUS.PENDING] }
    });

    if (existing) {
      logger.info({ jobId: existing._id }, 'Ingest: duplicate detected');
      return { status: INGEST_STATUS.DUPLICATE, job: existing };
    }

    // Create job record
    const job = await IngestJob.create({
      creatorId,
      sourceUrl: rawUrl,
      normalizedUrl,
      source,
      status: INGEST_STATUS.PROCESSING,
      telegramChatId: telegramCtx.chatId ? String(telegramCtx.chatId) : undefined,
      telegramMessageId: telegramCtx.messageId
    });

    try {
      const title = titleFromUrl(normalizedUrl, source);

      // Create ClipNova video as EXTERNAL_REF — immediately READY, no upload needed
      const video = await Video.create({
        creatorId,
        title,
        description: `Imported via Telegram from ${source}`,
        type: VIDEO_TYPE.EXTERNAL_REF,
        externalUrl: normalizedUrl,
        status: VIDEO_STATUS.READY
      });

      job.videoId = video._id;
      job.title = title;
      job.status = INGEST_STATUS.DONE;
      job.metadata = { source, videoId: video._id };
      await job.save();

      logger.info({ jobId: job._id, videoId: video._id }, 'Ingest: done');
      return { status: INGEST_STATUS.DONE, job, video };
    } catch (err) {
      job.status = INGEST_STATUS.FAILED;
      job.errorMessage = err.message;
      await job.save();
      logger.error({ err, jobId: job._id }, 'Ingest: failed');
      return { status: INGEST_STATUS.FAILED, job, error: err.message };
    }
  }

  async getCreatorJobs(creatorId, limit = 10) {
    return IngestJob.find({ creatorId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('videoId', 'title status');
  }
}

module.exports = new IngestService();
