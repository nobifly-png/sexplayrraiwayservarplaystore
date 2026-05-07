const uploadService = require('./upload.service');
const { successResponse } = require('../../common/helpers/response.helper');

class UploadController {
  async initiateUpload(req, res, next) {
    try {
      const result = await uploadService.initiateUpload(req.user.userId, req.body);
      successResponse(res, result, 'Upload initiated successfully');
    } catch (error) {
      next(error);
    }
  }

  async completeUpload(req, res, next) {
    try {
      const video = await uploadService.completeUpload(req.user.userId, req.body.videoId);
      successResponse(res, video, 'Upload completed successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UploadController();
