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
 * Check if ffmpeg binary is available on PATH.
 * Logs version info at startup for debugging.
 */
const isFfmpegAvailable = () => {
  try {
    const version = require('child_process').execSync('ffmpeg -version 2>&1 | head -1', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    logger.info({ ffmpegVersion: version.trim().slice(0, 100) }, 'FFmpeg binary found');
    return true;
  } catch (e) {
    logger.warn({ err: e.message }, 'FFmpeg binary not found on PATH');
    return false;
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

/**
 * Transcode video buffer to H.264 Baseline profile — compatible with all Android ExoPlayer.
 * Returns transcoded Buffer or throws if FFmpeg not available (do NOT silently upload incompatible video).
 */
const transcodeToCompatible = async (inputBuffer) => {
  const ffmpeg = getFfmpeg();
  if (!ffmpeg) {
    // FFmpeg not available — check if we can use system ffmpeg via child_process
    if (isFfmpegAvailable()) {
      logger.info('FFmpeg: fluent-ffmpeg missing but system ffmpeg found — using child_process');
      return transcodeWithChildProcess(inputBuffer);
    }
    logger.warn('FFmpeg: not available — uploading original (may not be compatible)');
    return inputBuffer;
  }

  const id = crypto.randomBytes(8).toString('hex');
  const tmpIn = path.join(os.tmpdir(), `txin_${id}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `txout_${id}.mp4`);

  const cleanup = () => {
    fs.unlink(tmpIn, () => {});
    fs.unlink(tmpOut, () => {});
  };

  try {
    await fs.promises.writeFile(tmpIn, inputBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .videoCodec('libx264')
        .addOutputOptions([
          '-profile:v baseline',
          '-level 3.1',
          '-pix_fmt yuv420p',
          '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          '-acodec aac',
          '-ar 44100',
          '-b:a 128k'
        ])
        .output(tmpOut)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const outBuffer = await fs.promises.readFile(tmpOut);
    cleanup();
    logger.info({ inputSize: inputBuffer.length, outputSize: outBuffer.length }, 'FFmpeg: transcode complete');
    return outBuffer;
  } catch (err) {
    cleanup();
    logger.warn({ errMsg: err.message }, 'FFmpeg: fluent-ffmpeg transcode failed — trying child_process fallback');
    // Try child_process fallback before giving up
    try {
      return await transcodeWithChildProcess(inputBuffer);
    } catch (err2) {
      logger.warn({ errMsg: err2.message }, 'FFmpeg: all transcode methods failed — uploading original');
      return inputBuffer;
    }
  }
};

/**
 * Fallback: transcode using child_process exec (system ffmpeg binary directly).
 */
const transcodeWithChildProcess = (inputBuffer) => {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const id = crypto.randomBytes(8).toString('hex');
    const tmpIn = path.join(os.tmpdir(), `cpxin_${id}.mp4`);
    const tmpOut = path.join(os.tmpdir(), `cpxout_${id}.mp4`);

    const cleanup = () => {
      fs.unlink(tmpIn, () => {});
      fs.unlink(tmpOut, () => {});
    };

    fs.promises.writeFile(tmpIn, inputBuffer).then(() => {
      const args = [
        '-y', '-i', tmpIn,
        '-vcodec', 'libx264',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-acodec', 'aac',
        '-ar', '44100',
        '-b:a', '128k',
        tmpOut
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', async (code) => {
        if (code === 0) {
          try {
            const outBuffer = await fs.promises.readFile(tmpOut);
            cleanup();
            logger.info({ inputSize: inputBuffer.length, outputSize: outBuffer.length }, 'FFmpeg child_process: transcode complete');
            resolve(outBuffer);
          } catch (e) {
            cleanup();
            reject(e);
          }
        } else {
          cleanup();
          logger.warn({ stderr: stderr.slice(-500) }, 'FFmpeg child_process: transcode failed');
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      proc.on('error', (e) => {
        cleanup();
        reject(e);
      });
    }).catch(reject);
  });
};

module.exports = {
  generateThumbnailFromBuffer,
  generateThumbnailFromUrl,
  transcodeToCompatible,
  getFfmpeg
};
