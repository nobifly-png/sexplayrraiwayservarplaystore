const FraudFlag = require('./fraudFlag.model');
const PlaybackSession = require('../playback/playbackSession.model');
const { successResponse } = require('../../common/helpers/response.helper');
const { NotFoundError } = require('../../common/errors');
const { AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const auditService = require('../audit/audit.service');
const { getClientIp } = require('../../common/utils/ip');

class FraudController {
  async getFraudFlags(req, res, next) {
    try {
      const query = {};
      const { resolved, severity, page, limit } = req.query;

      if (resolved !== undefined) {
        query.resolved = resolved;
      }
      if (severity) {
        query.severity = severity;
      }

      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const skip = (safePage - 1) * safeLimit;

      const flags = await FraudFlag.find(query)
        .populate('creatorId', 'name email')
        .populate('videoId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit);

      successResponse(res, flags, 'Fraud flags retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getSessionDetails(req, res, next) {
    try {
      const session = await PlaybackSession.findById(req.params.id)
        .populate('videoId', 'title type')
        .populate('creatorId', 'name email')
        .populate('linkId', 'shortCode');

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      const flags = await FraudFlag.find({ sessionId: session._id });

      successResponse(res, { session, flags }, 'Session details retrieved');
    } catch (error) {
      next(error);
    }
  }

  async resolveFlag(req, res, next) {
    try {
      const flag = await FraudFlag.findById(req.params.id);
      if (!flag) throw new NotFoundError('Fraud flag not found');

      flag.resolved = true;
      flag.resolvedBy = req.user.userId;
      flag.resolvedAt = new Date();
      await flag.save();

      auditService.logAction({
        userId: req.user.userId,
        action: AUDIT_ACTION.FRAUD_FLAG_RESOLVED,
        entityType: AUDIT_ENTITY_TYPE.FRAUD,
        entityId: flag._id,
        metadata: { type: flag.type, severity: flag.severity },
        ip: getClientIp(req),
        userAgent: req.headers['user-agent']
      });

      successResponse(res, flag, 'Fraud flag resolved');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FraudController();
