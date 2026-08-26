const https = require('https');
const http = require('http');
const { Upload } = require('@aws-sdk/lib-storage');
const { PutObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { r2Client, bucketName, publicBaseUrl, isR2Configured } = require('../../config/r2');
const crypto = require('crypto');
const logger = require('../../config/logger');
const { PassThrough } = require('stream');

const MAX_STREAM_BYTES = 2 * 1024 * 1024 * 1024; // 2GB hard cap

/**
 * Stream a remote URL directly into R2 using AWS SDK's Upload (multipart).
 * This handles large files (up to 2GB) without loading into memory.
 * Uses streaming with automatic multipart upload management.
 */
const streamUrlToR2 = (downloadUrl, storageKey, mimeType, expectedSize = null) => {
  return new Promise((resolve, reject) => {
    if (!isR2Configured() || !r2Client) {
      return reject(new Error('R2 not configured'));
    }

    const proto = downloadUrl.startsWith('https') ? https : http;
    const passThrough = new PassThrough();
    
    let totalBytes = 0;
    let downloadStarted = false;

    // Start download
    const request = proto.get(downloadUrl, { timeout: 600000 }, (res) => {  // 10 min timeout for large files
      if (res.statusCode !== 200) {
        res.resume();
        passThrough.destroy();
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }

      downloadStarted = true;

      // Pipe download to passthrough stream
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_STREAM_BYTES) {
          res.destroy();
          passThrough.destroy();
          return reject(new Error('File exceeds maximum allowed size (2GB)'));
        }
        
        // Log progress every 50MB
        if (totalBytes % (50 * 1024 * 1024) < chunk.length) {
          logger.info({ 
            downloaded: `${(totalBytes / 1024 / 1024).toFixed(1)}MB`,
            expected: expectedSize ? `${(expectedSize / 1024 / 1024).toFixed(1)}MB` : 'unknown'
          }, 'StreamToR2: download progress');
        }
      });

      res.on('error', (err) => {
        passThrough.destroy(err);
      });

      // Pipe response to passthrough
      res.pipe(passThrough);
    });

    request.on('error', (err) => {
      if (!downloadStarted) {
        passThrough.destroy(err);
        reject(err);
      }
    });

    request.on('timeout', () => {
      request.destroy();
      passThrough.destroy(new Error('Download request timed out'));
      reject(new Error('Download request timed out'));
    });

    // Upload stream to R2 using multipart upload
    const isVideo = (mimeType || '').startsWith('video/');

    // 15-minute hard timeout: if upload stalls, abort and reject
    let uploadTimeoutId;
    
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: bucketName,
        Key: storageKey,
        Body: passThrough,
        ContentType: mimeType || 'application/octet-stream',
        ContentDisposition: 'inline',
        CacheControl: isVideo ? 'public, max-age=31536000' : 'public, max-age=86400'
      },
      queueSize: 4,         // concurrent parts
      partSize: 10 * 1024 * 1024, // 10MB parts (minimum for multipart)
      leavePartsOnError: false    // cleanup on failure
    });

    upload.on('httpUploadProgress', (progress) => {
      // Start the 15-min stall timeout on first progress event
      if (!uploadTimeoutId) {
        uploadTimeoutId = setTimeout(() => {
          upload.abort().catch(() => {});
          passThrough.destroy(new Error('Upload stalled — 15 minute timeout reached'));
        }, 15 * 60 * 1000);
      }
      if (progress.loaded && progress.total) {
        const percent = ((progress.loaded / progress.total) * 100).toFixed(1);
        logger.info({ 
          loaded: `${(progress.loaded / 1024 / 1024).toFixed(1)}MB`,
          total: `${(progress.total / 1024 / 1024).toFixed(1)}MB`,
          percent: `${percent}%`
        }, 'StreamToR2: upload progress');
      }
    });
    upload.done()
      .then(() => {
        clearTimeout(uploadTimeoutId);
        logger.info({ storageKey, totalBytes }, 'StreamToR2: complete');
        resolve({ fileSize: totalBytes, storageKey, url: `${publicBaseUrl}/${storageKey}` });
      })
      .catch((err) => {
        clearTimeout(uploadTimeoutId);
        logger.error({ err: err.message, storageKey }, 'StreamToR2: upload failed');
        // Ensure request is aborted
        if (request) {
          request.destroy();
        }
        reject(err);
      });
  });
};

/**
 * Upload a buffer directly to R2.
 * Used for small files and thumbnails.
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
 * Delete an object from R2.
 * Called only when no other Video document references the same storageKey.
 */
const deleteR2Object = async (storageKey) => {
  if (!isR2Configured() || !r2Client) throw new Error('R2 not configured');
  if (!storageKey) return;

  await r2Client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: storageKey
  }));

  logger.info({ storageKey }, 'R2: object deleted');
};

/**
 * Get public URL for a storage key.
 */
const getPublicUrl = (storageKey) =>
  storageKey ? `${publicBaseUrl}/${storageKey}` : null;

module.exports = {
  streamUrlToR2,
  uploadBufferToR2,
  copyR2Object,
  deleteR2Object,
  buildVideoStorageKey,
  buildThumbnailStorageKey,
  getPublicUrl
};
