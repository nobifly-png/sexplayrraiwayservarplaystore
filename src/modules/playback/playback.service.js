const PlaybackSession = require('./playbackSession.model');
const PlaybackEvent = require('./playbackEvent.model');
const ViewLedger = require('./viewLedger.model');
const mongoose = require('mongoose');
const Link = require('../links/link.model');
const Video = require('../videos/video.model');
const fraudService = require('../fraud/fraud.service');
const walletService = require('../wallet/wallet.service');
const logger = require('../../config/logger');
const { getDeviceType, generateIdempotencyKey } = require('../../common/utils');
const { NotFoundError, BadRequestError } = require('../../common/errors');
const { PLAYBACK_SESSION_STATUS, PLAYBACK_EVENT_TYPE, VIDEO_TYPE, VIDEO_STATUS, VIEW_TYPE } = require('../../common/enums');
const { getMinimumWatchSeconds } = require('../../common/utils/settingsHelpers');
const { getSetting } = require('../../common/utils/settingsCache');

class PlaybackService {
  async createSession(linkId, ipAddress, userAgent, fingerprint) {
    const link = await Link.findById(linkId).populate('videoId');
    
    if (!link || !link.isActive) {
      throw new NotFoundError('Link not found or inactive');
    }

    const video = link.videoId;
    if (!video || video.isDeleted || video.status !== VIDEO_STATUS.READY) {
      throw new NotFoundError('Video not available');
    }

    const fraudChecks = [
      await fraudService.checkIpAbuse(ipAddress, video._id),
      await fraudService.checkMultiVideoIpAbuse(ipAddress),
      await fraudService.checkBotPattern(userAgent)
    ];

    const fraudScore = fraudService.calculateFraudScore(fraudChecks);
    const deviceType = getDeviceType(userAgent);

    const now = new Date();
    const session = await PlaybackSession.create({
      videoId: video._id,
      linkId: link._id,
      creatorId: video.creatorId,
      ipAddress,
      userAgent,
      fingerprint,
      deviceType,
      fraudScore,
      status: PLAYBACK_SESSION_STATUS.STARTED,
      lastEventAt: now,
      lastPositionSeconds: 0
    });

    await Promise.all(
      fraudChecks
        .filter((check) => check.isFraud)
        .map((check) =>
          fraudService.createFraudFlag({
            creatorId: video.creatorId,
            videoId: video._id,
            sessionId: session._id,
            type: check.type,
            reason: check.reason,
            severity: check.severity
          }).catch((err) =>
            logger.error({ err, sessionId: session._id }, 'Failed to create fraud flag')
          )
        )
    );

    await PlaybackEvent.create({
      sessionId: session._id,
      videoId: video._id,
      eventType: PLAYBACK_EVENT_TYPE.PAGE_OPEN
    });

    return session;
  }

  async createEvent(data) {
    const session = await PlaybackSession.findById(data.sessionId);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.status === PLAYBACK_SESSION_STATUS.CLOSED) {
      throw new BadRequestError('Session already finalized');
    }

    if (data.eventType === PLAYBACK_EVENT_TYPE.PLAY && !session.manualPlayStarted) {
      session.manualPlayStarted = true;
      session.status = PLAYBACK_SESSION_STATUS.ACTIVE;
      // Reset timing baseline so subsequent PROGRESS checks are accurate
      session.lastEventAt = new Date();
      session.lastPositionSeconds = 0;
    }

    if (data.eventType === PLAYBACK_EVENT_TYPE.PROGRESS || data.eventType === PLAYBACK_EVENT_TYPE.HEARTBEAT) {
      if (!session.manualPlayStarted) {
        throw new BadRequestError('Manual play is required before progress events');
      }

      const now = new Date();
      const lastEventTime = session.lastEventAt instanceof Date && !isNaN(session.lastEventAt)
        ? session.lastEventAt
        : session.startedAt;
      const elapsedSeconds = Math.max(0, (now.getTime() - lastEventTime.getTime()) / 1000);
      const nextPosition = Math.max(0, data.positionSeconds || 0);
      const lastPosition = session.lastPositionSeconds ?? session.watchTimeSeconds ?? 0;
      const increment = nextPosition - lastPosition;

      // Allow: real elapsed + 10s buffer (covers first event, network delay, player buffering)
      // Block only truly impossible jumps far beyond wall-clock time
      const allowedIncrement = elapsedSeconds + 10;

      if (increment < 0) {
        // Negative jump = backward seek — flag but don't block (user may rewind)
        const seekCheck = fraudService.checkSeekAbuse(session, nextPosition);
        if (seekCheck.isFraud) {
          fraudService.createFraudFlag({
            creatorId: session.creatorId,
            videoId: session.videoId,
            sessionId: session._id,
            type: seekCheck.type,
            reason: seekCheck.reason,
            severity: seekCheck.severity,
            evidence: seekCheck.evidence
          }).catch(() => {});
        }
      } else if (increment > allowedIncrement) {
        throw new BadRequestError('Unrealistic playback progression detected');
      }

      session.lastPositionSeconds = nextPosition;

      if (nextPosition > session.watchTimeSeconds) {
        session.watchTimeSeconds = nextPosition;
      }
    }

    const event = await PlaybackEvent.create({
      sessionId: data.sessionId,
      videoId: session.videoId,
      eventType: data.eventType,
      positionSeconds: data.positionSeconds,
      meta: data.meta
    });

    // Partial update — only changed fields, avoids full-doc write on every event
    const $set = { lastEventAt: new Date() };
    if (session.manualPlayStarted !== undefined) $set.manualPlayStarted = session.manualPlayStarted;
    if (session.status !== undefined) $set.status = session.status;
    if (session.lastPositionSeconds !== undefined) $set.lastPositionSeconds = session.lastPositionSeconds;
    if (session.watchTimeSeconds !== undefined) $set.watchTimeSeconds = session.watchTimeSeconds;
    await PlaybackSession.updateOne({ _id: session._id }, { $set });

    return event;
  }

  async finalizeSession(sessionId) {
    const session = await PlaybackSession.findById(sessionId).populate('videoId');
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.status === PLAYBACK_SESSION_STATUS.CLOSED) {
      return {
        isValidView: Boolean(session.isValidView),
        rejectionReason: session.rejectionReason || null,
        watchTimeSeconds: session.watchTimeSeconds
      };
    }

    const video = session.videoId;
    const minWatchSetting = await getSetting('minimumWatchSeconds');
    const minWatchSec = getMinimumWatchSeconds(minWatchSetting);

    let isValidView = false;
    let rejectionReason = null;

    if (!session.manualPlayStarted) {
      rejectionReason = 'No manual play detected';
    } else if (session.watchTimeSeconds < minWatchSec) {
      rejectionReason = `Watch time below minimum (${session.watchTimeSeconds}s < ${minWatchSec}s)`;
    } else if (session.fraudScore >= 50) {
      rejectionReason = 'High fraud score';
    } else if (video.type !== VIDEO_TYPE.DIRECT_UPLOAD) {
      rejectionReason = 'Video type not monetizable';
    } else {
      isValidView = true;
      session.completedMinimumWatch = true;
    }

    const idempotencyKey = generateIdempotencyKey('view', sessionId);
    const dbSession = await mongoose.startSession();
    let earningsAmount = 0;

    try {
      await dbSession.withTransaction(async () => {
        const existingLedger = await ViewLedger.findOne({ idempotencyKey }).session(dbSession);
        if (!existingLedger) {
          if (isValidView) {
            earningsAmount = await walletService.creditEarnings(
              session.creatorId,
              sessionId,
              video._id
            );
          }

          const viewType = isValidView ? VIEW_TYPE.VALID : VIEW_TYPE.REJECTED;
          await ViewLedger.create([{
            sessionId: session._id,
            videoId: video._id,
            creatorId: session.creatorId,
            linkId: session.linkId,
            viewType,
            reason: rejectionReason,
            earningsAmount,
            idempotencyKey
          }], { session: dbSession });
        } else {
          earningsAmount = existingLedger.earningsAmount || 0;
        }

        await PlaybackSession.updateOne(
          { _id: session._id },
          {
            $set: {
              isValidView,
              rejectionReason,
              completedMinimumWatch: isValidView,
              status: PLAYBACK_SESSION_STATUS.CLOSED
            }
          },
          { session: dbSession }
        );
      });
    } catch (error) {
      if (error && error.code === 11000) {
        logger.warn({ sessionId }, 'Duplicate finalize attempt ignored (idempotent)');
      } else {
        throw error;
      }
    } finally {
      await dbSession.endSession();
    }

    return {
      isValidView,
      rejectionReason,
      watchTimeSeconds: session.watchTimeSeconds
    };
  }
}

module.exports = new PlaybackService();
