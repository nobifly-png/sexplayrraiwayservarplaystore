const PlaybackSession = require('./playbackSession.model');
const PlaybackEvent = require('./playbackEvent.model');
const ViewLedger = require('./viewLedger.model');
const mongoose = require('mongoose');
const Link = require('../links/link.model');
const Video = require('../videos/video.model');
const walletService = require('../wallet/wallet.service');
const logger = require('../../config/logger');
const { getDeviceType, generateIdempotencyKey } = require('../../common/utils');
const { NotFoundError, BadRequestError } = require('../../common/errors');
const { PLAYBACK_SESSION_STATUS, PLAYBACK_EVENT_TYPE, VIDEO_STATUS, VIEW_TYPE } = require('../../common/enums');
const { VIEW_TO_COUNTED_RATIO } = require('../../common/constants');

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

    logger.info({ linkId, videoId: video._id, videoStatus: video.status }, 'Playback: link and video resolved');

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
      status: PLAYBACK_SESSION_STATUS.STARTED,
      lastEventAt: now,
      lastPositionSeconds: 0
    });

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
        // Backward seek — allow without flagging (no fraud system)
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

    // Partial update — only changed fields
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

    // ── Round-robin 4:1 rule ─────────────────────────────────────────────────
    // Every VIEW_TO_COUNTED_RATIO-th (4th) view for this creator = VALID
    // All others = REJECTED
    // e.g. counts 0,1,2 → REJECTED; count 3 → VALID; count 4,5,6 → REJECTED; count 7 → VALID ...
    const existingCount = await ViewLedger.countDocuments({ creatorId: session.creatorId });
    const isValidView = (existingCount % VIEW_TO_COUNTED_RATIO === VIEW_TO_COUNTED_RATIO - 1);
    const rejectionReason = isValidView ? null : `Round-robin: view ${existingCount + 1} of ${VIEW_TO_COUNTED_RATIO}`;

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
              session.videoId._id
            );
          }

          const viewType = isValidView ? VIEW_TYPE.VALID : VIEW_TYPE.REJECTED;
          await ViewLedger.create([{
            sessionId: session._id,
            videoId: session.videoId._id,
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
