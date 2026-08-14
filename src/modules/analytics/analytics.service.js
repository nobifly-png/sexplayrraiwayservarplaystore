const ViewLedger = require('../playback/viewLedger.model');
const PlaybackSession = require('../playback/playbackSession.model');
const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const { VIEW_TYPE } = require('../../common/enums');
const { VIEW_TO_COUNTED_RATIO } = require('../../common/constants');
const { NotFoundError } = require('../../common/errors');
const mongoose = require('mongoose');

const buildDateMatch = (startDate, endDate) => {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) range.$lte = new Date(endDate);
  return { createdAt: range };
};

/**
 * Convert real views to counted views (4 real views = 1 counted view)
 * Only shows complete views - partial views (0.25, 0.50, 0.75) are hidden
 * Examples: 1 session = 0 views, 4 sessions = 1 view, 7 sessions = 1 view, 8 sessions = 2 views
 */
const calculateCountedViews = (realViews) => {
  return Math.floor(realViews / VIEW_TO_COUNTED_RATIO);
};

/**
 * Calculate display earnings based on complete views only
 * Hides partial earnings until a complete view (4 sessions) is reached
 * Examples: 
 * - 2 sessions × $0.001 = $0.002 earned, but displays $0.000 (hidden)
 * - 4 sessions × $0.001 = $0.004 earned, displays $0.004 (shown)
 * - 6 sessions × $0.001 = $0.006 earned, but displays $0.004 (4 complete sessions only)
 */
const calculateDisplayEarnings = (realViews, totalEarnings) => {
  const completeViews = Math.floor(realViews / VIEW_TO_COUNTED_RATIO);
  if (completeViews === 0 || realViews === 0) {
    return 0; // Hide earnings if no complete view
  }
  // Calculate earnings per session, then multiply by complete sessions
  const earningsPerSession = realViews > 0 ? totalEarnings / realViews : 0;
  return completeViews * VIEW_TO_COUNTED_RATIO * earningsPerSession;
};

class AnalyticsService {
  async getCreatorOverview(creatorId, { startDate, endDate } = {}) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const dateMatch = buildDateMatch(startDate, endDate);

    const sessionMatch = { creatorId: creatorObjectId, ...dateMatch };
    const ledgerMatch = { creatorId: creatorObjectId, ...dateMatch };

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult] = await Promise.all([
      ViewLedger.countDocuments(ledgerMatch), // Use ViewLedger for total (source of truth)
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...ledgerMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    // Convert to counted views (4:1 ratio) and calculate display earnings
    return {
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings)
    };
  }

  async getVideoAnalytics(creatorId, videoId, { startDate, endDate } = {}) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const videoObjectId = new mongoose.Types.ObjectId(videoId);
    const video = await Video.findOne({ _id: videoObjectId, creatorId: creatorObjectId });
    if (!video) return null;

    const dateMatch = buildDateMatch(startDate, endDate);
    const ledgerMatch = { videoId: videoObjectId, ...dateMatch };

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult] = await Promise.all([
      ViewLedger.countDocuments(ledgerMatch), // Use ViewLedger for total (source of truth)
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...ledgerMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    // Convert to counted views (4:1 ratio) and calculate display earnings
    return {
      video: { id: video._id, title: video.title, type: video.type },
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings)
    };
  }

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

    // Convert counts to counted views (4:1 ratio)
    return series.map(entry => ({
      ...entry,
      count: calculateCountedViews(entry.count)
    }));
  }

  async getLinkAnalytics(creatorId, linkId) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const linkObjectId = new mongoose.Types.ObjectId(linkId);

    const link = await Link.findOne({ _id: linkObjectId, creatorId: creatorObjectId });
    if (!link) throw new NotFoundError('Link not found');

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult] = await Promise.all([
      ViewLedger.countDocuments({ linkId: linkObjectId }), // Use ViewLedger for total (source of truth)
      ViewLedger.countDocuments({ linkId: linkObjectId, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ linkId: linkObjectId, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { linkId: linkObjectId, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    // Convert to counted views (4:1 ratio) and calculate display earnings
    return {
      link: { id: link._id, shortCode: link.shortCode, isActive: link.isActive },
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings)
    };
  }

  async getAdminDashboard({ startDate, endDate } = {}) {
    const dateMatch = buildDateMatch(startDate, endDate);

    const [totalRealViews, validRealViews, rejectedRealViews, earningsResult, topCreatorsRaw] = await Promise.all([
      ViewLedger.countDocuments(dateMatch), // Use ViewLedger as source of truth
      ViewLedger.countDocuments({ ...dateMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...dateMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...dateMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ]),
      ViewLedger.aggregate([
        { $match: { ...dateMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: '$creatorId', validViews: { $sum: 1 }, earnings: { $sum: '$earningsAmount' } } },
        { $sort: { earnings: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'creator' } },
        { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            validViews: 1,
            earnings: 1,
            creator: { name: '$creator.name', email: '$creator.email' }
          }
        }
      ])
    ]);

    const totalEarnings = earningsResult[0]?.totalEarnings || 0;

    // Convert top creators views to counted views and display earnings
    const topCreators = topCreatorsRaw.map(creator => ({
      ...creator,
      validViews: calculateCountedViews(creator.validViews),
      earnings: calculateDisplayEarnings(creator.validViews, creator.earnings)
    }));

    // Convert to counted views (4:1 ratio) and calculate display earnings
    return {
      totalViews: calculateCountedViews(totalRealViews),
      validViews: calculateCountedViews(validRealViews),
      rejectedViews: calculateCountedViews(rejectedRealViews),
      totalEarnings: calculateDisplayEarnings(validRealViews, totalEarnings),
      topCreators
    };
  }
}

module.exports = new AnalyticsService();
