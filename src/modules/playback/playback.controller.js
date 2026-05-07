const playbackService = require('./playback.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');

class PlaybackController {
  async createSession(req, res, next) {
    try {
      const session = await playbackService.createSession(
        req.body.linkId,
        getClientIp(req),
        req.headers['user-agent'],
        req.body.fingerprint
      );
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
