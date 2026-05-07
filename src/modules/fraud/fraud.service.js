const PlaybackSession = require('../playback/playbackSession.model');
const FraudFlag = require('./fraudFlag.model');
const { FRAUD_TYPE, FRAUD_SEVERITY } = require('../../common/enums');
const SystemSetting = require('../settings/systemSetting.model');
const { getMaxViewsPerIpPerHour } = require('../../common/utils/settingsHelpers');
const logger = require('../../config/logger');

class FraudService {
  async checkIpAbuse(ipAddress, videoId) {
    const setting = await SystemSetting.findOne({ key: 'maxViewsPerIpPerHour' });
    const maxPerHour = getMaxViewsPerIpPerHour(setting);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentSessions = await PlaybackSession.countDocuments({
      ipAddress,
      videoId,
      startedAt: { $gte: oneHourAgo }
    });

    if (recentSessions >= maxPerHour) {
      return {
        isFraud: true,
        type: FRAUD_TYPE.RATE_ABUSE,
        reason: `Too many views from same IP on same video (${recentSessions}/${maxPerHour} per hour)`,
        severity: FRAUD_SEVERITY.HIGH,
        evidence: { ipAddress, videoId, recentSessions, maxPerHour }
      };
    }

    return { isFraud: false };
  }

  async checkMultiVideoIpAbuse(ipAddress) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const distinctVideos = await PlaybackSession.distinct('videoId', {
      ipAddress,
      startedAt: { $gte: oneHourAgo }
    });

    // Flag if same IP hits more than 20 distinct videos in 1 hour
    if (distinctVideos.length > 20) {
      return {
        isFraud: true,
        type: FRAUD_TYPE.DUPLICATE_IP,
        reason: `IP accessing too many distinct videos (${distinctVideos.length} in last hour)`,
        severity: FRAUD_SEVERITY.HIGH,
        evidence: { ipAddress, distinctVideoCount: distinctVideos.length }
      };
    }

    return { isFraud: false };
  }

  async checkBotPattern(userAgent) {
    if (!userAgent) {
      return {
        isFraud: true,
        type: FRAUD_TYPE.BOT_PATTERN,
        reason: 'Missing user agent',
        severity: FRAUD_SEVERITY.MEDIUM,
        evidence: { userAgent }
      };
    }

    const botPatterns = /bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer|playwright/i;
    if (botPatterns.test(userAgent)) {
      return {
        isFraud: true,
        type: FRAUD_TYPE.BOT_PATTERN,
        reason: 'Bot or automated tool detected in user agent',
        severity: FRAUD_SEVERITY.MEDIUM,
        evidence: { userAgent }
      };
    }

    return { isFraud: false };
  }

  checkSeekAbuse(session, newPositionSeconds) {
    if (!session.manualPlayStarted) return { isFraud: false };

    const now = Date.now();
    const lastEventTime = session.lastEventAt instanceof Date && !isNaN(session.lastEventAt)
      ? session.lastEventAt
      : (session.startedAt instanceof Date && !isNaN(session.startedAt) ? session.startedAt : new Date());
    const elapsedMs = now - lastEventTime.getTime();
    const elapsedSeconds = Math.max(0, elapsedMs / 1000);
    const jump = newPositionSeconds - session.watchTimeSeconds;

    // Seeking forward more than 3x elapsed wall-clock time is suspicious
    if (jump > 0 && jump > Math.max(5, elapsedSeconds * 3)) {
      return {
        isFraud: true,
        type: FRAUD_TYPE.SUSPICIOUS_BEHAVIOR,
        reason: `Abnormal seek detected: jumped ${jump.toFixed(1)}s in ${elapsedSeconds.toFixed(1)}s`,
        severity: FRAUD_SEVERITY.MEDIUM,
        evidence: { jump, elapsedSeconds, watchTimeSeconds: session.watchTimeSeconds, newPositionSeconds }
      };
    }

    return { isFraud: false };
  }

  async createFraudFlag(data) {
    try {
      await FraudFlag.create({
        creatorId: data.creatorId,
        videoId: data.videoId,
        sessionId: data.sessionId,
        type: data.type,
        reason: data.reason,
        severity: data.severity,
        meta: data.evidence || data.meta || {}
      });
    } catch (err) {
      logger.error({ err, data }, 'FraudService: failed to create fraud flag');
    }
  }

  calculateFraudScore(checks) {
    let score = 0;
    for (const check of checks) {
      if (!check.isFraud) continue;
      if (check.severity === FRAUD_SEVERITY.HIGH) score += 50;
      else if (check.severity === FRAUD_SEVERITY.MEDIUM) score += 30;
      else score += 10;
    }
    return Math.min(score, 100);
  }
}

module.exports = new FraudService();
