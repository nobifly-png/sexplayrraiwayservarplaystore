const { PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2Client, bucketName, isR2Configured } = require('../../config/r2');
const Video = require('../videos/video.model');
const UploadIntent = require('./uploadIntent.model');
const { generateStorageKey, sanitizeUploadFileName } = require('../../common/utils');
const { BadRequestError, NotFoundError } = require('../../common/errors');
const { VIDEO_TYPE, VIDEO_STATUS, UPLOAD_STATUS } = require('../../common/enums');
const SystemSetting = require('../settings/systemSetting.model');
const { UPLOAD_INTENT_EXPIRY_MINUTES, SIGNED_URL_EXPIRY_SECONDS } = require('../../common/constants');
const { getAllowedVideoMimeTypes, getMaxUploadSizeBytes } = require('../../common/utils/settingsHelpers');

const MIN_VERIFIED_OBJECT_BYTES = 1024;

const isSizeWithinTolerance = (expected, actual) => {
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
  if (actual <= 0) return false;
  const diff = Math.abs(actual - expected);
  const tolerance = Math.max(expected * 0.01, 1024);
  return diff <= tolerance;
};

const normalizeContentType = (ct) => {
  if (!ct || typeof ct !== 'string') return '';
  return ct.split(';')[0].trim().toLowerCase();
};

class UploadService {
  async initiateUpload(creatorId, data) {
    if (!isR2Configured()) {
      throw new BadRequestError('Video upload service is not configured. Please contact administrator.');
    }

    if (!r2Client) {
      throw new BadRequestError('Storage service is temporarily unavailable');
    }

    let safeFileName;
    try {
      safeFileName = sanitizeUploadFileName(data.fileName);
    } catch {
      throw new BadRequestError('Invalid file name');
    }

    const mimeSetting = await SystemSetting.findOne({ key: 'allowedVideoMimeTypes' });
    const allowedMimes = getAllowedVideoMimeTypes(mimeSetting);
    if (!allowedMimes.includes(data.mimeType)) {
      throw new BadRequestError('Invalid file type for current system settings');
    }

    const sizeSetting = await SystemSetting.findOne({ key: 'maxUploadSizeBytes' });
    const maxBytes = getMaxUploadSizeBytes(sizeSetting);
    if (data.fileSize > maxBytes) {
      throw new BadRequestError('File size exceeds configured maximum limit');
    }

    const video = await Video.findOne({
      _id: data.videoId,
      creatorId,
      type: VIDEO_TYPE.DIRECT_UPLOAD,
      status: VIDEO_STATUS.UPLOADING
    });

    if (!video) {
      throw new NotFoundError('Video not found or not eligible for upload');
    }

    const storageKey = generateStorageKey(creatorId, safeFileName);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      ContentType: data.mimeType
    });

    const signedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: SIGNED_URL_EXPIRY_SECONDS
    });

    const expiresAt = new Date(Date.now() + UPLOAD_INTENT_EXPIRY_MINUTES * 60 * 1000);

    // No multi-document transaction: works on standalone MongoDB. Partial unique index on
    // (videoId) where status=INITIATED prevents duplicate active intents under concurrency.
    await UploadIntent.updateMany(
      { videoId: data.videoId, status: UPLOAD_STATUS.INITIATED },
      { $set: { status: UPLOAD_STATUS.EXPIRED } }
    );

    try {
      await UploadIntent.create({
        creatorId,
        videoId: data.videoId,
        storageKey,
        expectedSize: data.fileSize,
        mimeType: data.mimeType,
        status: UPLOAD_STATUS.INITIATED,
        expiresAt
      });
    } catch (error) {
      if (error && error.code === 11000) {
        throw new BadRequestError('An upload is already in progress for this video. Retry shortly.');
      }
      throw error;
    }

    video.storageKey = storageKey;
    video.fileName = safeFileName;
    video.mimeType = data.mimeType;
    video.fileSize = data.fileSize;
    await video.save();

    return {
      uploadUrl: signedUrl,
      storageKey,
      expiresAt
    };
  }

  async completeUpload(creatorId, videoId) {
    if (!isR2Configured()) {
      throw new BadRequestError('Video upload service is not configured. Please contact administrator.');
    }

    if (!r2Client) {
      throw new BadRequestError('Storage service is temporarily unavailable');
    }

    const video = await Video.findOne({
      _id: videoId,
      creatorId,
      type: VIDEO_TYPE.DIRECT_UPLOAD
    });

    if (!video) {
      throw new NotFoundError('Video not found');
    }

    if (video.status === VIDEO_STATUS.READY) {
      throw new BadRequestError('Video upload already completed');
    }

    if (video.status !== VIDEO_STATUS.UPLOADING) {
      throw new BadRequestError('Video is not awaiting upload completion');
    }

    const uploadIntent = await UploadIntent.findOne({
      videoId,
      creatorId,
      status: UPLOAD_STATUS.INITIATED
    });

    if (!uploadIntent) {
      throw new BadRequestError('No active upload intent found');
    }

    if (uploadIntent.expiresAt.getTime() < Date.now()) {
      uploadIntent.status = UPLOAD_STATUS.EXPIRED;
      await uploadIntent.save();
      throw new BadRequestError('Upload session expired. Please initiate upload again');
    }

    if (!video.storageKey || video.storageKey !== uploadIntent.storageKey) {
      throw new BadRequestError('Upload session mismatch');
    }

    if ((video.mimeType || '') !== (uploadIntent.mimeType || '')) {
      throw new BadRequestError('Upload session mismatch');
    }

    const markIntentAndVideoFailed = async () => {
      uploadIntent.status = UPLOAD_STATUS.FAILED;
      await uploadIntent.save();
      video.status = VIDEO_STATUS.FAILED;
      await video.save();
    };

    try {
      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: video.storageKey
      });

      const head = await r2Client.send(headCommand);
      const contentLength = head.ContentLength ?? 0;

      if (contentLength < MIN_VERIFIED_OBJECT_BYTES) {
        await markIntentAndVideoFailed();
        throw new BadRequestError('Uploaded file is too small or empty');
      }

      if (!isSizeWithinTolerance(uploadIntent.expectedSize, contentLength)) {
        await markIntentAndVideoFailed();
        throw new BadRequestError('Uploaded file size does not match expected size');
      }

      const headCt = normalizeContentType(head.ContentType);
      const expectedMime = (uploadIntent.mimeType || '').toLowerCase();
      if (headCt && expectedMime && headCt !== expectedMime) {
        await markIntentAndVideoFailed();
        throw new BadRequestError('Uploaded file type does not match declared type');
      }

      uploadIntent.status = UPLOAD_STATUS.VERIFIED;
      await uploadIntent.save();

      video.status = VIDEO_STATUS.READY;
      video.fileSize = contentLength;
      await video.save();

      return video;
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      try {
        await markIntentAndVideoFailed();
      } catch (_) {
        // best-effort persistence after storage error
      }
      throw new BadRequestError('Upload verification failed. File not found in storage or could not be verified');
    }
  }
}

module.exports = new UploadService();
