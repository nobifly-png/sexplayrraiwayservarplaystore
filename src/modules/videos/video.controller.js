const videoService = require('./video.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');

const auditCtx = (req) => ({ ip: getClientIp(req), userAgent: req.headers['user-agent'] });

const videoController = {
  async createVideo(req, res, next) {
    try {
      const video = await videoService.createVideo(req.user.userId, req.body, auditCtx(req));
      successResponse(res, video, 'Video created successfully', 201);
    } catch (error) {
      next(error);
    }
  },

  async getVideos(req, res, next) {
    try {
      const videos = await videoService.getCreatorVideos(req.user.userId, req.query);
      successResponse(res, videos, 'Videos retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getVideo(req, res, next) {
    try {
      const video = await videoService.getVideoById(req.params.id, req.user.userId);
      successResponse(res, video, 'Video retrieved');
    } catch (error) {
      next(error);
    }
  },

  async updateVideo(req, res, next) {
    try {
      const video = await videoService.updateVideo(req.params.id, req.user.userId, req.body, auditCtx(req));
      successResponse(res, video, 'Video updated successfully');
    } catch (error) {
      next(error);
    }
  },

  async deleteVideo(req, res, next) {
    try {
      await videoService.deleteVideo(req.params.id, req.user.userId, auditCtx(req));
      successResponse(res, null, 'Video deleted successfully');
    } catch (error) {
      next(error);
    }
  }
};

module.exports = videoController;
