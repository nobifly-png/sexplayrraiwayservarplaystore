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

// Simply return the actual earnings stored in DB — no recalculation needed.
// Old rate ($0.13) was applied at write time; recalculating distorts the number.
const calculateDisplayEarnings = (_realViews, totalEarnings) => totalEarnings;

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
      totalViews:    calculateCountedViews(validRealViews),
      validViews:    calculateCountedViews(validRealViews),
      rejectedViews: rejectedRealViews,
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
      totalViews:    calculateCountedViews(validRealViews),
      validViews:    calculateCountedViews(validRealViews),
      rejectedViews: rejectedRealViews,
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings)
    };
  }

  /**
   * Admin dashboard.
   * - Platform totals: live from ViewLedger
   * - Top Creators: live from ViewLedger with validViews, rejectedViews, pendingViews, earnings
   *   pendingViews = raw views that came in AFTER the last snapshot (not yet counted in creator dashboard)
   */
  async getAdminDashboard({ startDate, endDate } = {}) {
    const dateMatch = buildDateMatch(startDate, endDate);
    const ViewSnapshot = require('./viewSnapshot.model');

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult, topCreatorsRaw] = await Promise.all([
      // Platform-wide totals — live
      ViewLedger.countDocuments(dateMatch),
      ViewLedger.countDocuments({ ...dateMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...dateMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...dateMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ]),
      // Top creators — all raw counts from ViewLedger, pendingViews calculated below
      ViewLedger.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: '$creatorId',
            validRaw:    { $sum: { $cond: [{ $eq: ['$viewType', VIEW_TYPE.VALID] },    1, 0] } },
            rejectedRaw: { $sum: { $cond: [{ $eq: ['$viewType', VIEW_TYPE.REJECTED] }, 1, 0] } },
            earnings:    { $sum: '$earningsAmount' }
          }
        },
        { $sort: { earnings: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'creator'
          }
        },
        { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
        // Pull latest snapshot to calculate pendingViews
        {
          $lookup: {
            from: 'viewsnapshots',
            localField: '_id',
            foreignField: 'creatorId',
            as: 'snapshot'
          }
        },
        { $unwind: { path: '$snapshot', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            // totalViews = counted valid (÷4) — same as what creator sees
            validViews:    { $floor: { $divide: ['$validRaw', VIEW_TO_COUNTED_RATIO] } },
            rejectedViews: '$rejectedRaw',  // raw count — actual rejections
            // pendingViews = raw views since last snapshot (not yet shown to creator)
            pendingViews: {
              $max: [
                0,
                {
                  $subtract: [
                    { $add: ['$validRaw', '$rejectedRaw'] },
                    { $ifNull: ['$snapshot.rawTotalViews', 0] }
                  ]
                }
              ]
            },
            earnings: 1,
            creator: { name: '$creator.name', email: '$creator.email' }
          }
        }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    return {
      // Platform totals — totalViews = counted valid, rejectedViews = raw actual count
      totalViews:    calculateCountedViews(validRealViews),
      validViews:    calculateCountedViews(validRealViews),
      rejectedViews: rejectedRealViews,
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings),
      // Top creators with pending views (views arrived since last snapshot)
      topCreators: topCreatorsRaw
    };
  }
}

module.exports = new AnalyticsService();
