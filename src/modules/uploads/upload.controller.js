const uploadService = require('./upload.service');
const thumbnailService = require('./thumbnail.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { BadRequestError, NotFoundError } = require('../../common/errors');
const Video = require('../videos/video.model');

const uploadController = {
  async initiateUpload(req, res, next) {
    try {
      const result = await uploadService.initiateUpload(req.user.userId, req.body);
      successResponse(res, result, 'Upload initiated successfully');
    } catch (error) {
      next(error);
    }
  },

  async completeUpload(req, res, next) {
    try {
      const video = await uploadService.completeUpload(req.user.userId, req.body.videoId);
      successResponse(res, video, 'Upload completed successfully');
    } catch (error) {
      next(error);
    }
  },

  async uploadThumbnail(req, res, next) {
    try {
      const { videoId } = req.body;
      if (!videoId) return next(new BadRequestError('videoId is required'));

      const file = req.file;
      const validationError = thumbnailService.validateThumbnailFile(file);
      if (validationError) return next(new BadRequestError(validationError));

      const video = await Video.findOne({ _id: videoId, creatorId: req.user.userId, isDeleted: false });
      if (!video) return next(new NotFoundError('Video not found'));

      const { thumbnailKey, thumbnailUrl } = await thumbnailService.uploadThumbnailBuffer(
        file.buffer,
        req.user.userId,
        videoId,
        file.mimetype
      );

      video.thumbnailUrl = thumbnailUrl;
      video.thumbnailKey = thumbnailKey;
      video.thumbnailSource = 'MANUAL';
      await video.save();

      successResponse(res, { thumbnailUrl, thumbnailKey }, 'Thumbnail uploaded successfully');
    } catch (error) {
      next(error);
    }
  }
};

module.exports = uploadController;
