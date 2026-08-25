const mongoose = require('mongoose');
const ViewLedger = require('../playback/viewLedger.model');
const ViewSnapshot = require('./viewSnapshot.model');
const { VIEW_TYPE } = require('../../common/enums');
const { VIEW_TO_COUNTED_RATIO } = require('../../common/constants');
const logger = require('../../config/logger');

/**
 * Convert raw session count → display count (4:1 ratio)
 */
const calculateCountedViews = (realViews) => Math.floor(realViews / VIEW_TO_COUNTED_RATIO);

/**
 * Calculate display earnings aligned to complete 4-session sets.
 * Partial earnings (< 4 sessions) are hidden.
 */
const calculateDisplayEarnings = (realViews, totalEarnings) => {
  const completeViews = Math.floor(realViews / VIEW_TO_COUNTED_RATIO);
  if (completeViews === 0 || realViews === 0) return 0;
  const earningsPerSession = totalEarnings / realViews;
  return completeViews * VIEW_TO_COUNTED_RATIO * earningsPerSession;
};

class SnapshotService {
  /**
   * Compute and persist a fresh snapshot for ONE creator.
   * Called by the cron job (for all creators) or on-demand (admin).
   */
  async refreshCreatorSnapshot(creatorId) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult] = await Promise.all([
      ViewLedger.countDocuments({ creatorId: creatorObjectId }),
      ViewLedger.countDocuments({ creatorId: creatorObjectId, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ creatorId: creatorObjectId, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { creatorId: creatorObjectId, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    const rawEarnings = earningsResult[0]?.totalEarnings || 0;

    const snapshot = {
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, rawEarnings),
      rawValidViews: validRealViews,
      rawTotalViews: totalRealViews,
      snapshotAt: new Date()
    };

    // Upsert — create if first time, overwrite if exists
    await ViewSnapshot.findOneAndUpdate(
      { creatorId: creatorObjectId },
      { $set: { ...snapshot, creatorId: creatorObjectId } },
      { upsert: true, new: true }
    );

    return snapshot;
  }

  /**
   * Refresh snapshots for ALL creators that have at least one ViewLedger entry.
   * Called by the 12-hour cron job.
   */
  async refreshAllSnapshots() {
    const start = Date.now();
    logger.info('Snapshot job: starting full refresh');

    // Get all distinct creatorIds from ViewLedger
    const creatorIds = await ViewLedger.distinct('creatorId');

    if (creatorIds.length === 0) {
      logger.info('Snapshot job: no creators found, skipping');
      return { refreshed: 0, failed: 0 };
    }

    let refreshed = 0;
    let failed = 0;

    // Process in small batches to avoid memory spikes
    const BATCH_SIZE = 50;
    for (let i = 0; i < creatorIds.length; i += BATCH_SIZE) {
      const batch = creatorIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((creatorId) =>
          this.refreshCreatorSnapshot(creatorId)
            .then(() => { refreshed++; })
            .catch((err) => {
              failed++;
              logger.error({ err, creatorId }, 'Snapshot job: failed for creator');
            })
        )
      );
    }

    const duration = Date.now() - start;
    logger.info({ refreshed, failed, durationMs: duration }, 'Snapshot job: full refresh complete');
    return { refreshed, failed };
  }

  /**
   * Read the latest snapshot for a creator.
   * Returns null if no snapshot exists yet (first run before any cron).
   */
  async getSnapshot(creatorId) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    return await ViewSnapshot.findOne({ creatorId: creatorObjectId }).lean();
  }

  /**
   * Read snapshot or fall back to empty zeros if not yet computed.
   * This prevents dashboard errors on very first server start.
   */
  async getSnapshotOrDefault(creatorId) {
    const snapshot = await this.getSnapshot(creatorId);
    if (snapshot) return snapshot;

    return {
      totalViews: 0,
      validViews: 0,
      rejectedViews: 0,
      totalEarnings: 0,
      rawValidViews: 0,
      rawTotalViews: 0,
      snapshotAt: null
    };
  }
}

module.exports = new SnapshotService();
