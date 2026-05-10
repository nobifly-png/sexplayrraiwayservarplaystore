const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { r2Client, bucketName, publicBaseUrl, isR2Configured } = require('../../config/r2');
const logger = require('../../config/logger');
const crypto = require('crypto');

const DEFAULT_THUMBNAIL_URL = process.env.DEFAULT_THUMBNAIL_URL || null;

const ALLOWED_THUMB_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_THUMB_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Build R2 key for thumbnail.
 */
const buildThumbnailKey = (userId, videoId) =>
  `thumbnails/${userId}/${videoId}.jpg`;

/**
 * Upload a buffer to R2 as a thumbnail.
 * @returns {{ thumbnailKey, thumbnailUrl }}
 */
const uploadThumbnailBuffer = async (buffer, userId, videoId, mimeType = 'image/jpeg') => {
  if (!isR2Configured() || !r2Client) {
    throw new Error('R2 not configured');
  }

  const key = buildThumbnailKey(userId, videoId);

  await r2Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    ContentLength: buffer.length
  }));

  const thumbnailUrl = `${publicBaseUrl}/${key}`;
  return { thumbnailKey: key, thumbnailUrl };
};

/**
 * Try to extract a thumbnail from a video file using FFmpeg.
 * Returns buffer or null — NEVER throws (logs warning on failure).
 */
const extractFrameWithFfmpeg = async (videoBuffer) => {
  try {
    const ffmpeg = require('fluent-ffmpeg');
    const { Readable, PassThrough } = require('stream');
    const os = require('os');
    const path = require('path');
    const fs = require('fs');

    const tmpIn = path.join(os.tmpdir(), `thumb_in_${crypto.randomBytes(8).toString('hex')}.mp4`);
    const tmpOut = path.join(os.tmpdir(), `thumb_out_${crypto.randomBytes(8).toString('hex')}.jpg`);

    await fs.promises.writeFile(tmpIn, videoBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .seekInput(3)
        .frames(1)
        .output(tmpOut)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const imgBuffer = await fs.promises.readFile(tmpOut);

    // cleanup
    fs.promises.unlink(tmpIn).catch(() => {});
    fs.promises.unlink(tmpOut).catch(() => {});

    return imgBuffer;
  } catch (err) {
    logger.warn({ errMsg: err.message }, 'Thumbnail: FFmpeg not available or failed — skipping auto-generation');
    return null;
  }
};

/**
 * Validate thumbnail file for manual upload.
 */
const validateThumbnailFile = (file) => {
  if (!file) return 'No file provided';
  if (!ALLOWED_THUMB_MIMES.includes(file.mimetype)) return 'Only jpg, png, webp allowed';
  if (file.size > MAX_THUMB_BYTES) return 'Max thumbnail size is 5MB';
  return null;
};

/**
 * Try auto-generate thumbnail after video upload complete.
 * Wraps everything — NEVER crashes the upload flow.
 */
const tryAutoGenerateThumbnail = async (video) => {
  try {
    if (!isR2Configured() || !r2Client) return null;
    if (!video.storageKey) return null;

    // We don't download the full video just for thumbnail on free tier
    // FFmpeg path only works if video buffer is available locally
    // On Render free tier: skip silently
    logger.info({ videoId: video._id }, 'Thumbnail: auto-generation skipped (no local video buffer on serverless)');
    return null;
  } catch (err) {
    logger.warn({ err, videoId: video._id }, 'Thumbnail: auto-generation failed — continuing without thumbnail');
    return null;
  }
};

module.exports = {
  uploadThumbnailBuffer,
  extractFrameWithFfmpeg,
  validateThumbnailFile,
  buildThumbnailKey,
  tryAutoGenerateThumbnail,
  DEFAULT_THUMBNAIL_URL,
  ALLOWED_THUMB_MIMES,
  MAX_THUMB_BYTES
};
