const playbackService = require('./playback.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');
const logger = require('../../config/logger');
const Link = require('../links/link.model');

class PlaybackController {
  async createSession(req, res, next) {
    try {
      let { linkId, videoId, fingerprint } = req.body;

      logger.info({ linkId, videoId, fingerprint: !!fingerprint }, 'Playback: createSession incoming');

      // Fallback: if linkId missing but videoId provided, resolve latest active link
      if (!linkId && videoId) {
        const link = await Link.findOne({ videoId, isActive: true }).sort({ createdAt: -1 });
        if (!link) {
          return res.status(404).json({ success: false, message: 'No active link found for this video' });
        }
        linkId = link._id.toString();
        logger.info({ videoId, resolvedLinkId: linkId }, 'Playback: linkId resolved via videoId fallback');
      }

      const session = await playbackService.createSession(
        linkId,
        getClientIp(req),
        req.headers['user-agent'],
        fingerprint
      );

      logger.info({ sessionId: session._id, linkId }, 'Playback: session created successfully');
      successResponse(res, { sessionId: session._id }, 'Session created', 201);
    } catch (error) {
      next(error);
    }
  }

  async createEvent(req, res, next) {
    try {
      await playbackService.createEvent(req.body);
      successResponse(res, null, 'Event recorded');
    } catch (error) {
      next(error);
    }
  }

  async finalizeSession(req, res, next) {
    try {
      const result = await playbackService.finalizeSession(req.body.sessionId);
      successResponse(res, result, 'Session finalized');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlaybackController();
