const adminService = require('./admin.service');
const auditService = require('../audit/audit.service');
const videoService = require('../videos/video.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');

const auditCtx = (req) => ({ ip: getClientIp(req), userAgent: req.headers['user-agent'] });

const adminController = {
  async getUsers(req, res, next) {
    try {
      const users = await adminService.getAllUsers(req.query);
      successResponse(res, users, 'Users retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getUser(req, res, next) {
    try {
      const user = await adminService.getUserById(req.params.id);
      successResponse(res, user, 'User retrieved');
    } catch (error) {
      next(error);
    }
  },

  async blockUser(req, res, next) {
    try {
      const user = await adminService.blockUser(req.params.id, req.user.userId, auditCtx(req));
      successResponse(res, user, 'User blocked');
    } catch (error) {
      next(error);
    }
  },

  async unblockUser(req, res, next) {
    try {
      const user = await adminService.unblockUser(req.params.id, req.user.userId, auditCtx(req));
      successResponse(res, user, 'User unblocked');
    } catch (error) {
      next(error);
    }
  },

  async getAuditLogs(req, res, next) {
    try {
      const result = await auditService.getLogs(req.query);
      successResponse(res, result, 'Audit logs retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getVideos(req, res, next) {
    try {
      const result = await videoService.adminGetVideos(req.query);
      successResponse(res, result, 'Videos retrieved');
    } catch (error) {
      next(error);
    }
  },

  async deleteVideo(req, res, next) {
    try {
      await videoService.adminDeleteVideo(req.params.id, req.user.userId, auditCtx(req));
      successResponse(res, null, 'Video deleted');
    } catch (error) {
      next(error);
    }
  }
};

module.exports = adminController;
