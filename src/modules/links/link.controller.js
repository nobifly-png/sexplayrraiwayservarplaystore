const linkService = require('./link.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');
const { publicBaseUrl } = require('../../config/r2');
const logger = require('../../config/logger');

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
      const { shortCode } = req.params;
      logger.info({ shortCode, source: 'GET /api/l/:shortCode' }, 'PublicResolve: request');
      const { link, video } = await linkService.resolveLinkByShortCode(shortCode);
      const videoUrl = video.storageKey && publicBaseUrl
        ? `${publicBaseUrl}/${video.storageKey}`
        : video.externalUrl || null;
      logger.info({ shortCode, videoId: video._id, status: video.status }, 'PublicResolve: success');
      successResponse(res, {
        video: { id: video._id, title: video.title, description: video.description, type: video.type, videoUrl },
        link: { id: link._id, shortCode: link.shortCode }
      }, 'Link resolved');
    } catch (error) {
      logger.warn({ shortCode: req.params.shortCode, err: error.message }, 'PublicResolve: failed');
      next(error);
    }
  },

  async resolveByUrl(req, res, next) {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, message: 'url is required' });
      }
      // Extract shortCode from URL: /watch/CODE or /l/CODE or /api/l/CODE
      const match = url.match(/\/(?:watch|(?:api\/)?l)\/([A-Za-z0-9]{4,32})(?:[/?#]|$)/);
      if (!match) {
        return res.status(400).json({ success: false, message: 'Could not extract shortCode from url' });
      }
      const shortCode = match[1];
      logger.info({ shortCode, url, source: 'POST /api/links/resolve' }, 'PublicResolve: request');
      const { link, video } = await linkService.resolveLinkByShortCode(shortCode);
      const videoUrl = video.storageKey && publicBaseUrl
        ? `${publicBaseUrl}/${video.storageKey}`
        : video.externalUrl || null;
      logger.info({ shortCode, videoId: video._id, status: video.status }, 'PublicResolve: success');
      successResponse(res, {
        video: { id: video._id, title: video.title, description: video.description, type: video.type, videoUrl },
        link: { id: link._id, shortCode: link.shortCode }
      }, 'Link resolved');
    } catch (error) {
      logger.warn({ url: req.body?.url, err: error.message }, 'PublicResolve: failed');
      next(error);
    }
  }
};

module.exports = linkController;
