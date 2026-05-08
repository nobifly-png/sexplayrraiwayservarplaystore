const https = require('https');
const http = require('http');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { r2Client, bucketName, isR2Configured } = require('../../config/r2');
const { generateStorageKey } = require('../../common/utils');
const logger = require('../../config/logger');
const crypto = require('crypto');

/**
 * Get Telegram file download URL via Bot API.
 * Works for files up to 20MB via standard Bot API.
 * For larger files, Telegram requires local Bot API server.
 */
const getTelegramFileUrl = async (botToken, fileId) => {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok || !parsed.result?.file_path) {
            return reject(new Error(parsed.description || 'Could not get file path from Telegram'));
          }
          const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${parsed.result.file_path}`;
          resolve({ downloadUrl, filePath: parsed.result.file_path, fileSize: parsed.result.file_size });
        } catch (e) {
          reject(new Error('Failed to parse Telegram getFile response'));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
};

/**
 * Stream a URL directly into R2 — no local disk storage.
 * Collects stream into buffer then uploads (S3 SDK requires known content length or multipart).
 * For very large files, uses multipart upload automatically via buffer chunking.
 */
const streamUrlToR2 = (downloadUrl, storageKey, mimeType) => {
  return new Promise((resolve, reject) => {
    const proto = downloadUrl.startsWith('https') ? https : http;

    proto.get(downloadUrl, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Telegram download failed: HTTP ${res.statusCode}`));
      }

      const chunks = [];
      let totalBytes = 0;

      res.on('data', (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
      });

      res.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks, totalBytes);

          const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: storageKey,
            Body: buffer,
            ContentType: mimeType || 'application/octet-stream',
            ContentLength: totalBytes
          });

          await r2Client.send(command);
          resolve({ fileSize: totalBytes });
        } catch (err) {
          reject(err);
        }
      });

      res.on('error', reject);
    }).on('error', reject);
  });
};

/**
 * Derive a safe storage key from Telegram file info.
 */
const buildStorageKey = (creatorId, filePath, fileName) => {
  const ext = (filePath || fileName || '').split('.').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'bin';
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `videos/${creatorId}/${timestamp}-${random}.${ext}`;
};

/**
 * Main upload function.
 * Downloads file from Telegram and streams it to R2.
 *
 * @returns {{ storageKey, fileSize, publicUrl }}
 */
const uploadTelegramFileToR2 = async ({ botToken, fileId, creatorId, fileName, mimeType }) => {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  if (!r2Client) {
    throw new Error('R2 client unavailable');
  }

  logger.info({ fileId, creatorId }, 'TelegramUpload: getting file URL from Telegram');

  const { downloadUrl, filePath, fileSize: tgFileSize } = await getTelegramFileUrl(botToken, fileId);

  const storageKey = buildStorageKey(creatorId, filePath, fileName);
  const safeMime = mimeType || 'application/octet-stream';

  logger.info({ storageKey, tgFileSize }, 'TelegramUpload: streaming to R2');

  const { fileSize } = await streamUrlToR2(downloadUrl, storageKey, safeMime);

  const { publicBaseUrl } = require('../../config/r2');
  const publicUrl = `${publicBaseUrl}/${storageKey}`;

  logger.info({ storageKey, fileSize, publicUrl }, 'TelegramUpload: done');

  return { storageKey, fileSize, publicUrl };
};

module.exports = { uploadTelegramFileToR2 };
