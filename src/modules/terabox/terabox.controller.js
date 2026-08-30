/**
 * TeraBox Controller
 * POST /api/terabox/convert — resolves a TeraBox link, uploads to R2, returns Zaxgram link
 * GET  /api/terabox/quota   — returns current daily quota usage
 */

const teraboxService = require('./terabox.service');
const TeraboxJob = require('./terabox.model');
const { TERABOX_JOB_STATUS } = require('./terabox.model');
const Video = require('../videos/video.model');
const linkService = require('../links/link.service');
const { VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');
const { successResponse } = require('../../common/helpers/response.helper');
const logger = require('../../config/logger');

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.zaxgram.com').replace(/\/$/, '');

// Normalize TeraBox URL for dedup
const normalizeTeraboxUrl = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch { return url.toLowerCase(); }
};

// Validate TeraBox URL
const isTeraboxUrl = (url) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('terabox') || host.includes('1024tera') || host.includes('4funbox') ||
           host.includes('freeterabox') || host.includes('mirrobox') || host.includes('nephobox');
  } catch { return false; }
};

const teraboxController = {
  /**
   * POST /api/terabox/convert
   * Body: { teraboxUrl: string }
   */
  async convert(req, res, next) {
    const { teraboxUrl } = req.body;
    const userId = req.user.userId;

    try {
      if (!teraboxUrl || typeof teraboxUrl !== 'string') {
        return res.status(400).json({ success: false, message: 'teraboxUrl is required' });
      }

      if (!isTeraboxUrl(teraboxUrl)) {
        return res.status(400).json({ success: false, message: 'URL must be a valid TeraBox share link' });
      }

      const normalizedUrl = normalizeTeraboxUrl(teraboxUrl);

      // Dedup check — if same user already converted this link
      const existing = await TeraboxJob.findOne({
        requestedByUserId: userId,
        normalizedUrl,
        status: TERABOX_JOB_STATUS.DONE
      });

      if (existing) {
        logger.info({ jobId: existing._id }, 'TeraBox: returning cached result');
        return successResponse(res, {
          zaxgramUrl: existing.zaxgramUrl,
          filename: existing.filename,
          fileSizeBytes: existing.fileSizeBytes,
          cached: true
        }, 'Already converted — returning existing link');
      }

      // Create job record
      const job = await TeraboxJob.create({
        requestedByUserId: userId,
        originalTeraboxUrl: teraboxUrl,
        normalizedUrl,
        status: TERABOX_JOB_STATUS.PROCESSING
      });

      try {
        // Convert: resolve → stream to R2
        const { storageKey, publicUrl, filename, fileSize, mimeType, duration, thumbUrl } = await teraboxService.convertToR2(teraboxUrl, userId);

        // Create Video record
        const video = await Video.create({
          creatorId: userId,
          title: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 200) || 'TeraBox Video',
          description: `Imported from TeraBox`,
          type: VIDEO_TYPE.DIRECT_UPLOAD,
          storageKey,
          fileName: filename,
          mimeType,
          fileSize,
          durationSeconds: duration || undefined,
          thumbnailUrl: thumbUrl || undefined,
          status: VIDEO_STATUS.READY,
          uploadSource: 'TELEGRAM_LINK',
          createdViaBot: false
        });

        // Create share link
        const link = await linkService.createLink(userId, video._id.toString());
        const zaxgramUrl = `${FRONTEND_URL}/watch/${link.shortCode}`;

        // Update job to DONE
        job.status = TERABOX_JOB_STATUS.DONE;
        job.r2Key = storageKey;
        job.r2PublicUrl = publicUrl;
        job.filename = filename;
        job.fileSizeBytes = fileSize;
        job.mimeType = mimeType;
        job.videoId = video._id;
        job.zaxgramUrl = zaxgramUrl;
        job.completedAt = new Date();
        await job.save();

        logger.info({ jobId: job._id, zaxgramUrl }, 'TeraBox: conversion complete');

        return successResponse(res, {
          zaxgramUrl,
          filename,
          fileSizeBytes: fileSize,
          cached: false
        }, 'TeraBox video converted successfully');

      } catch (err) {
        job.status = TERABOX_JOB_STATUS.FAILED;
        job.errorReason = err.message;
        job.completedAt = new Date();
        await job.save();

        logger.error({ err: err.message, jobId: job._id }, 'TeraBox: conversion failed');

        const msg = err.message.includes('quota') ? 'Daily quota exceeded. Try again tomorrow.' :
                    err.message.includes('rate limit') ? 'Too many requests. Please wait.' :
                    err.message.includes('no files') ? 'No downloadable files found in this TeraBox link.' :
                    err.message.includes('timed out') ? 'TeraBox server took too long to respond.' :
                    'Failed to convert TeraBox link. Please check the link and try again.';

        return res.status(422).json({ success: false, message: msg });
      }

    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/terabox/quota
   * Returns current daily quota usage
   */
  async quota(req, res, next) {
    try {
      const status = teraboxService.getQuotaStatus();
      return successResponse(res, status, 'Quota status');
    } catch (err) {
      next(err);
    }
  }
};

module.exports = teraboxController;
