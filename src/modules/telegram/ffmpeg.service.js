const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('../../config/logger');

/**
 * Try to require fluent-ffmpeg. Returns null if not installed.
 */
const getFfmpeg = () => {
  try {
    return require('fluent-ffmpeg');
  } catch {
    return null;
  }
};

/**
 * Generate a thumbnail from a video buffer using FFmpeg.
 * Writes temp files, extracts frame at seekSeconds, cleans up.
 * Returns jpg Buffer or null — NEVER throws.
 *
 * @param {Buffer} videoBuffer
 * @param {number} seekSeconds - timestamp to extract frame from
 * @returns {Promise<Buffer|null>}
 */
const generateThumbnailFromBuffer = async (videoBuffer, seekSeconds = 2) => {
  const ffmpeg = getFfmpeg();
  if (!ffmpeg) {
    logger.warn('FFmpeg: fluent-ffmpeg not installed — skipping thumbnail generation');
    return null;
  }

  const id = crypto.randomBytes(8).toString('hex');
  const tmpIn = path.join(os.tmpdir(), `ffin_${id}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `ffout_${id}.jpg`);

  const cleanup = () => {
    fs.unlink(tmpIn, () => {});
    fs.unlink(tmpOut, () => {});
  };

  try {
    await fs.promises.writeFile(tmpIn, videoBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .seekInput(seekSeconds)
        .frames(1)
        .size('640x?')           // scale width to 640, keep aspect ratio
        .outputOptions(['-q:v 3']) // quality: 1=best, 31=worst; 3 is high quality
        .output(tmpOut)
        .on('end', resolve)
        .on('error', (err) => reject(err))
        .run();
    });

    const imgBuffer = await fs.promises.readFile(tmpOut);
    cleanup();
    logger.info({ seekSeconds, size: imgBuffer.length }, 'FFmpeg: thumbnail generated');
    return imgBuffer;
  } catch (err) {
    cleanup();
    logger.warn({ errMsg: err.message }, 'FFmpeg: thumbnail generation failed — continuing without thumbnail');
    return null;
  }
};

/**
 * Generate thumbnail from a remote URL.
 * Downloads to temp file, extracts frame, cleans up.
 * Returns jpg Buffer or null — NEVER throws.
 *
 * @param {string} videoUrl
 * @param {number} seekSeconds
 * @returns {Promise<Buffer|null>}
 */
const generateThumbnailFromUrl = async (videoUrl, seekSeconds = 2) => {
  const ffmpeg = getFfmpeg();
  if (!ffmpeg) {
    logger.warn('FFmpeg: not available — skipping URL thumbnail generation');
    return null;
  }

  const id = crypto.randomBytes(8).toString('hex');
  const tmpOut = path.join(os.tmpdir(), `ffout_${id}.jpg`);

  const cleanup = () => fs.unlink(tmpOut, () => {});

  try {
    // FFmpeg can read directly from URL — no need to download first
    await new Promise((resolve, reject) => {
      ffmpeg(videoUrl)
        .seekInput(seekSeconds)
        .frames(1)
        .size('640x?')
        .outputOptions(['-q:v 3'])
        .output(tmpOut)
        .on('end', resolve)
        .on('error', (err) => reject(err))
        .run();
    });

    const imgBuffer = await fs.promises.readFile(tmpOut);
    cleanup();
    logger.info({ videoUrl: videoUrl.slice(0, 60), seekSeconds }, 'FFmpeg: URL thumbnail generated');
    return imgBuffer;
  } catch (err) {
    cleanup();
    logger.warn({ errMsg: err.message }, 'FFmpeg: URL thumbnail generation failed');
    return null;
  }
};

module.exports = {
  generateThumbnailFromBuffer,
  generateThumbnailFromUrl,
  getFfmpeg
};
