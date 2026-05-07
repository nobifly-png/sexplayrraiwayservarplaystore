const linkService = require('./link.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');
const { publicBaseUrl } = require('../../config/r2');

const auditCtx = (req) => ({ ip: getClientIp(req), userAgent: req.headers['user-agent'] });

const linkController = {
  async createLink(req, res, next) {
    try {
      const link = await linkService.createLink(req.user.userId, req.body.videoId, auditCtx(req));
      successResponse(res, link, 'Link created successfully', 201);
    } catch (error) {
      next(error);
    }
  },

  async getVideoLinks(req, res, next) {
    try {
      const links = await linkService.getVideoLinks(req.user.userId, req.params.videoId);
      successResponse(res, links, 'Links retrieved');
    } catch (error) {
      next(error);
    }
  },

  async toggleLink(req, res, next) {
    try {
      const link = await linkService.toggleLink(req.user.userId, req.params.id, auditCtx(req));
      successResponse(res, link, 'Link status updated');
    } catch (error) {
      next(error);
    }
  },

  async resolveShortLink(req, res, next) {
    try {
      const { link, video } = await linkService.resolveLinkByShortCode(req.params.shortCode);
      const videoUrl = video.storageKey && publicBaseUrl
        ? `${publicBaseUrl}/${video.storageKey}`
        : video.externalUrl || null;

      successResponse(res, {
        video: { id: video._id, title: video.title, description: video.description, type: video.type, videoUrl },
        link: { id: link._id, shortCode: link.shortCode }
      }, 'Link resolved');
    } catch (error) {
      next(error);
    }
  }
};

module.exports = linkController;
