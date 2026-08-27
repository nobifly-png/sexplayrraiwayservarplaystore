const ViewLedger = require('../playback/viewLedger.model');
const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const snapshotService = require('./snapshot.service');
const { VIEW_TYPE } = require('../../common/enums');
const { VIEW_TO_COUNTED_RATIO } = require('../../common/constants');
const { NotFoundError } = require('../../common/errors');
const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Helpers (still used for admin dashboard + time-series which stay live,
// and for per-video / per-link which don't have per-entity snapshots)
// ---------------------------------------------------------------------------

const buildDateMatch = (startDate, endDate) => {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) range.$lte = new Date(endDate);
  return { createdAt: range };
};

const calculateCountedViews = (realViews) =>
  Math.floor(realViews / VIEW_TO_COUNTED_RATIO);

const calculateDisplayEarnings = (realViews, totalEarnings) => {
  const completeViews = Math.floor(realViews / VIEW_TO_COUNTED_RATIO);
  if (completeViews === 0 || realViews === 0) return 0;
  const earningsPerSession = totalEarnings / realViews;
  return completeViews * VIEW_TO_COUNTED_RATIO * earningsPerSession;
};

// ---------------------------------------------------------------------------

class AnalyticsService {
  /**
   * Creator overview — reads from the 12-hour snapshot.
   * Views and earnings only update when the cron job fires (00:00 / 12:00 UTC).
   * Date filters are intentionally ignored here; the snapshot is a full
   * all-time aggregate. Pass startDate/endDate only when you need live data
   * (admin use-case handled separately in getAdminDashboard).
   */
  async getCreatorOverview(creatorId) {
    const snapshot = await snapshotService.getSnapshotOrDefault(creatorId);

    return {
      totalViews: snapshot.totalViews,
      validViews: snapshot.validViews,
      rejectedViews: snapshot.rejectedViews,
      totalEarnings: snapshot.totalEarnings,
      snapshotAt: snapshot.snapshotAt   // lets frontend show "last updated" if needed
    };
  }

  /**
   * Per-video analytics — still queries ViewLedger live.
   * Per-video snapshots are not stored separately; volume per video is lower.
   */
  async getVideoAnalytics(creatorId, videoId, { startDate, endDate } = {}) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const videoObjectId = new mongoose.Types.ObjectId(videoId);
    const video = await Video.findOne({ _id: videoObjectId, creatorId: creatorObjectId });
    if (!video) return null;

    const dateMatch = buildDateMatch(startDate, endDate);
    const ledgerMatch = { videoId: videoObjectId, ...dateMatch };

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult] = await Promise.all([
      ViewLedger.countDocuments(ledgerMatch),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...ledgerMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    return {
      video: { id: video._id, title: video.title, type: video.type },
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings)
    };
  }

  /**
   * Time-series chart data — always live (used for graphs, not headline numbers).
   */
  async getTimeSeries(creatorId, { startDate, endDate, groupBy = 'day' } = {}) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const dateMatch = buildDateMatch(startDate, endDate);
    const dateFormat = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const series = await ViewLedger.aggregate([
      { $match: { creatorId: creatorObjectId, ...dateMatch } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: '$createdAt' } },
            viewType: '$viewType'
          },
          count: { $sum: 1 },
          earnings: { $sum: '$earningsAmount' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    return series.map(entry => ({
      ...entry,
      count: calculateCountedViews(entry.count)
    }));
  }

  /**
   * Per-link analytics — still queries ViewLedger live.
   */
  async getLinkAnalytics(creatorId, linkId) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const linkObjectId = new mongoose.Types.ObjectId(linkId);

    const link = await Link.findOne({ _id: linkObjectId, creatorId: creatorObjectId });
    if (!link) throw new NotFoundError('Link not found');

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult] = await Promise.all([
      ViewLedger.countDocuments({ linkId: linkObjectId }),
      ViewLedger.countDocuments({ linkId: linkObjectId, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ linkId: linkObjectId, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { linkId: linkObjectId, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    return {
      link: { id: link._id, shortCode: link.shortCode, isActive: link.isActive },
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings)
    };
  }

  /**
   * Admin dashboard.
   * - Platform totals (totalViews, validViews, rejectedViews, totalEarnings)
   *   remain live from ViewLedger so admin always sees real-time platform health.
   * - Top Creators section reads from ViewSnapshot so the numbers shown here
   *   match exactly what each creator sees on their own dashboard — critical for
   *   correct payment amounts.
   */
  async getAdminDashboard({ startDate, endDate } = {}) {
    const dateMatch = buildDateMatch(startDate, endDate);
    const ViewSnapshot = require('./viewSnapshot.model');

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult, topSnapshotsRaw] = await Promise.all([
      // Platform-wide totals — live
      ViewLedger.countDocuments(dateMatch),
      ViewLedger.countDocuments({ ...dateMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...dateMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...dateMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ]),
      // Top creators — from snapshot (same numbers as creator dashboard)
      ViewSnapshot.aggregate([
        { $sort: { totalEarnings: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: 'creatorId',
            foreignField: '_id',
            as: 'creator'
          }
        },
        { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: '$creatorId',
            validViews: '$validViews',       // already counted (4:1 applied)
            earnings: '$totalEarnings',       // already display earnings
            snapshotAt: '$snapshotAt',
            creator: { name: '$creator.name', email: '$creator.email' }
          }
        }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    return {
      // Platform totals — live from ViewLedger
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings),
      // Top creators — snapshot values (match creator's own dashboard exactly)
      topCreators: topSnapshotsRaw
    };
  }
}

module.exports = new AnalyticsService();
