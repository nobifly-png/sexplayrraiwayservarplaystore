const cron = require('node-cron');
const UploadIntent = require('../modules/uploads/uploadIntent.model');
const RefreshSession = require('../modules/auth/refreshSession.model');
const PlaybackSession = require('../modules/playback/playbackSession.model');
const { UPLOAD_STATUS, PLAYBACK_SESSION_STATUS } = require('../common/enums');
const logger = require('../config/logger');

const cleanupExpiredUploadIntents = async () => {
  try {
    const result = await UploadIntent.updateMany(
      { status: UPLOAD_STATUS.INITIATED, expiresAt: { $lt: new Date() } },
      { $set: { status: UPLOAD_STATUS.EXPIRED } }
    );
    if (result.modifiedCount > 0) {
      logger.info({ count: result.modifiedCount }, 'Jobs: expired upload intents cleaned up');
    }
  } catch (err) {
    logger.error({ err }, 'Jobs: cleanupExpiredUploadIntents failed');
  }
};

const cleanupExpiredRefreshSessions = async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
    const result = await RefreshSession.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { revokedAt: { $lt: cutoff } }
      ]
    });
    if (result.deletedCount > 0) {
      logger.info({ count: result.deletedCount }, 'Jobs: expired refresh sessions deleted');
    }
  } catch (err) {
    logger.error({ err }, 'Jobs: cleanupExpiredRefreshSessions failed');
  }
};

const expireStalePlaybackSessions = async () => {
  try {
    const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours
    const result = await PlaybackSession.updateMany(
      {
        status: { $in: [PLAYBACK_SESSION_STATUS.STARTED, PLAYBACK_SESSION_STATUS.ACTIVE] },
        lastEventAt: { $lt: staleThreshold }
      },
      { $set: { status: PLAYBACK_SESSION_STATUS.CLOSED, rejectionReason: 'Session expired due to inactivity' } }
    );
    if (result.modifiedCount > 0) {
      logger.info({ count: result.modifiedCount }, 'Jobs: stale playback sessions expired');
    }
  } catch (err) {
    logger.error({ err }, 'Jobs: expireStalePlaybackSessions failed');
  }
};

const startJobs = () => {
  // Every 10 minutes
  cron.schedule('*/10 * * * *', cleanupExpiredUploadIntents);

  // Every hour
  cron.schedule('0 * * * *', cleanupExpiredRefreshSessions);

  // Every 30 minutes
  cron.schedule('*/30 * * * *', expireStalePlaybackSessions);

  logger.info('Background jobs scheduled');
};

const stopJobs = () => {
  cron.getTasks().forEach((task) => task.stop());
  logger.info('Background jobs stopped');
};

module.exports = { startJobs, stopJobs };
