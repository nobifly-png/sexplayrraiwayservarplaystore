const https = require('https');
const http = require('http');
const { PutObjectCommand, GetObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { r2Client, bucketName, publicBaseUrl, isR2Configured } = require('../../config/r2');
const crypto = require('crypto');
const logger = require('../../config/logger');

const MAX_STREAM_BYTES = 2 * 1024 * 1024 * 1024; // 2GB hard cap

/**
 * Stream a remote URL directly into R2 using chunked buffer.
 * Avoids writing to disk. Collects stream into buffer then uploads.
 * For very large files this is memory-bound — acceptable for Telegram's 2GB limit.
 */
const streamUrlToR2 = (downloadUrl, storageKey, mimeType) => {
  return new Promise((resolve, reject) => {
    if (!isR2Configured() || !r2Client) {
      return reject(new Error('R2 not configured'));
    }

    const proto = downloadUrl.startsWith('https') ? https : http;

    const request = proto.get(downloadUrl, { timeout: 120000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }

      const chunks = [];
      let totalBytes = 0;

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_STREAM_BYTES) {
          res.destroy();
          return reject(new Error('File exceeds maximum allowed size'));
        }
        chunks.push(chunk);
      });

      res.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks, totalBytes);
          const isVideo = (mimeType || '').startsWith('video/');
          await r2Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: storageKey,
            Body: buffer,
            ContentType: mimeType || 'application/octet-stream',
            ContentLength: totalBytes,
            ContentDisposition: 'inline',
            CacheControl: isVideo ? 'public, max-age=31536000' : 'public, max-age=86400'
          }));
          logger.info({ storageKey, totalBytes }, 'R2: stream upload complete');
          resolve({ fileSize: totalBytes });
        } catch (err) {
          reject(err);
        }
      });

      res.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Download request timed out'));
    });
  });
};

/**
 * Upload a buffer directly to R2.
 */
const uploadBufferToR2 = async (buffer, storageKey, mimeType) => {
  if (!isR2Configured() || !r2Client) throw new Error('R2 not configured');

  const isVideo = (mimeType || '').startsWith('video/');
  await r2Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
    ContentLength: buffer.length,
    ContentDisposition: 'inline',
    CacheControl: isVideo ? 'public, max-age=31536000' : 'public, max-age=86400'
  }));

  return { storageKey, url: `${publicBaseUrl}/${storageKey}` };
};

/**
 * Server-side copy within R2 — no download needed.
 * Used for duplicating videos/thumbnails without re-uploading.
 */
const copyR2Object = async (sourceKey, destKey) => {
  if (!isR2Configured() || !r2Client) throw new Error('R2 not configured');

  await r2Client.send(new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${sourceKey}`,
    Key: destKey
  }));

  logger.info({ sourceKey, destKey }, 'R2: server-side copy complete');
  return { storageKey: destKey, url: `${publicBaseUrl}/${destKey}` };
};

/**
 * Build a storage key for a video.
 */
const buildVideoStorageKey = (creatorId, ext = 'mp4') => {
  const random = crypto.randomBytes(8).toString('hex');
  return `videos/${creatorId}/${Date.now()}-${random}.${ext}`;
};

/**
 * Build a storage key for a thumbnail.
 */
const buildThumbnailStorageKey = (creatorId, videoId) =>
  `thumbnails/${creatorId}/${videoId}.jpg`;

/**
 * Get public URL for a storage key.
 */
const getPublicUrl = (storageKey) =>
  storageKey ? `${publicBaseUrl}/${storageKey}` : null;

module.exports = {
  streamUrlToR2,
  uploadBufferToR2,
  copyR2Object,
  buildVideoStorageKey,
  buildThumbnailStorageKey,
  getPublicUrl
};
