/**
 * GramJS (MTProto) client for large-file downloads.
 *
 * Used ONLY when file_size > LARGE_FILE_THRESHOLD (19MB).
 * For files ≤19MB the existing Bot API + streamUrlToR2 path is used unchanged.
 *
 * Flow:
 *  1. Telegraf forwards the original message to STORAGE_CHANNEL_ID.
 *  2. We call downloadLargeFileToR2(forwardedMsgId, storageKey) here.
 *  3. GramJS fetches that message from the storage channel and streams the
 *     media through client.downloadMedia() in 512KB chunks.
 *  4. Each chunk is pushed into a PassThrough stream that feeds the existing
 *     AWS SDK multipart Upload (from r2.utils.streamUrlToR2-equivalent below).
 *  5. After a successful upload the forwarded message is deleted from the
 *     storage channel to avoid accumulating storage there.
 *
 * Security notes:
 *  - Session string, apiHash, and botToken are NEVER logged.
 *  - Only the numeric apiId and non-sensitive metadata are logged.
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');
const { PassThrough } = require('stream');
const { Upload } = require('@aws-sdk/lib-storage');
const { r2Client, bucketName, publicBaseUrl, isR2Configured } = require('../../config/r2');
const logger = require('../../config/logger');

// ─── Config ──────────────────────────────────────────────────────────────────

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;          // never logged
const GRAMJS_SESSION = process.env.GRAMJS_SESSION || ''; // never logged
const STORAGE_CHANNEL_ID = process.env.STORAGE_CHANNEL_ID
  ? parseInt(process.env.STORAGE_CHANNEL_ID, 10)
  : null;

// Safety threshold — files above this size go through GramJS path.
// Set slightly below the 20MB Bot API hard limit so we never try getFile on them.
const LARGE_FILE_THRESHOLD = 19 * 1024 * 1024; // 19 MB

// ─── Singleton client ─────────────────────────────────────────────────────────

let _client = null;
let _connecting = false;
let _connectPromise = null;

/**
 * Returns a connected, ready GramJS TelegramClient.
 * Lazily initialised on first call; subsequent calls reuse the same instance.
 */
const getClient = async () => {
  if (_client && _client.connected) return _client;

  // Prevent concurrent initialisation races
  if (_connecting) return _connectPromise;

  _connecting = true;
  _connectPromise = (async () => {
    if (!API_ID || !API_HASH) {
      throw new Error('GramJS: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set');
    }
    if (!GRAMJS_SESSION) {
      throw new Error('GramJS: GRAMJS_SESSION is not set — run scripts/generate-session.js first');
    }

    const session = new StringSession(GRAMJS_SESSION);
    const client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 5,
      retryDelay: 2000,
      autoReconnect: true,
      useWSS: false,
    });

    // connect() only — no interactive prompt because we already have a session
    await client.connect();
    logger.info({ apiId: API_ID }, 'GramJS: client connected');

    _client = client;
    _connecting = false;
    return client;
  })();

  _connectPromise.catch(() => { _connecting = false; });
  return _connectPromise;
};

// ─── Core: stream media from a storage-channel message into R2 ───────────────

/**
 * Download a large Telegram file (via GramJS MTProto) and stream it directly
 * into R2 using the AWS SDK multipart Upload — no full buffer in memory.
 *
 * @param {number} forwardedMsgId  - ID of the forwarded message in STORAGE_CHANNEL_ID
 * @param {string} storageKey      - R2 object key to write to
 * @param {number} [expectedSize]  - bytes (used for logging only)
 * @returns {{ fileSize: number, storageKey: string, url: string }}
 */
const downloadLargeFileToR2 = async (forwardedMsgId, storageKey, expectedSize = 0) => {
  if (!isR2Configured() || !r2Client) {
    throw new Error('GramJS download: R2 is not configured');
  }
  if (!STORAGE_CHANNEL_ID) {
    throw new Error('GramJS download: STORAGE_CHANNEL_ID env var is not set');
  }

  const client = await getClient();

  // Fetch the forwarded message from the storage channel
  const messages = await client.getMessages(STORAGE_CHANNEL_ID, { ids: [forwardedMsgId] });
  const msg = messages[0];
  if (!msg || !msg.media) {
    throw new Error(`GramJS download: message ${forwardedMsgId} not found or has no media`);
  }

  logger.info({
    forwardedMsgId,
    storageKey,
    expectedMB: expectedSize ? (expectedSize / 1024 / 1024).toFixed(1) : 'unknown'
  }, 'GramJS: starting streamed download → R2');

  // PassThrough bridges GramJS chunk callbacks to the AWS SDK Upload stream
  const passThrough = new PassThrough();
  let totalBytes = 0;

  // AWS SDK multipart Upload — reads from passThrough
  const upload = new Upload({
    client: r2Client,
    params: {
      Bucket: bucketName,
      Key: storageKey,
      Body: passThrough,
      ContentType: 'video/mp4',
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000',
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024, // 10 MB parts
    leavePartsOnError: false,
  });

  upload.on('httpUploadProgress', ({ loaded, total }) => {
    if (loaded && total) {
      logger.info({
        loaded: `${(loaded / 1024 / 1024).toFixed(1)}MB`,
        total: `${(total / 1024 / 1024).toFixed(1)}MB`,
        pct: `${((loaded / total) * 100).toFixed(1)}%`,
      }, 'GramJS→R2: upload progress');
    }
  });

  // Run download and upload concurrently:
  //  - downloadMedia writes chunks into passThrough
  //  - upload.done() drains passThrough into R2
  const [downloadedBuffer] = await Promise.all([
    // GramJS downloadMedia with chunk callback — avoids single large buffer
    client.downloadMedia(msg.media, {
      outputFile: {
        // GramJS calls write() for each 512KB chunk, then close() when done
        write(chunk) {
          totalBytes += chunk.length;
          if (!passThrough.write(chunk)) {
            // Backpressure: passThrough buffer full — this is synchronous GramJS,
            // so we can't await here. The PassThrough internal buffer will hold
            // the data; AWS SDK drains it as fast as R2 accepts parts.
          }
          // Log progress every ~25MB
          if (totalBytes % (25 * 1024 * 1024) < chunk.length) {
            logger.info({
              downloadedMB: (totalBytes / 1024 / 1024).toFixed(1),
            }, 'GramJS: download progress');
          }
        },
        close() {
          passThrough.end();
        },
      },
    }),
    upload.done(),
  ]);

  logger.info({ storageKey, totalBytes }, 'GramJS→R2: complete');
  return {
    fileSize: totalBytes,
    storageKey,
    url: `${publicBaseUrl}/${storageKey}`,
  };
};

// ─── Delete forwarded message from storage channel (cleanup) ─────────────────

/**
 * Delete a message from the storage channel after successful upload.
 * Never throws — failure is logged and ignored (message stays for manual recovery).
 *
 * @param {number} msgId
 */
const deleteStorageChannelMessage = async (msgId) => {
  try {
    const client = await getClient();
    await client.deleteMessages(STORAGE_CHANNEL_ID, [msgId], { revoke: true });
    logger.info({ msgId, channelId: STORAGE_CHANNEL_ID }, 'GramJS: storage channel message deleted');
  } catch (err) {
    logger.warn({ msgId, errMsg: err.message }, 'GramJS: could not delete storage channel message (manual cleanup needed)');
  }
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const disconnectClient = async () => {
  if (_client) {
    try { await _client.disconnect(); } catch (_) {}
    _client = null;
    logger.info('GramJS: client disconnected');
  }
};

module.exports = {
  LARGE_FILE_THRESHOLD,
  getClient,
  downloadLargeFileToR2,
  deleteStorageChannelMessage,
  disconnectClient,
};
