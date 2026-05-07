const ViewLedger = require('../playback/viewLedger.model');
const PlaybackSession = require('../playback/playbackSession.model');
const Video = require('../videos/video.model');
const Link = require('../links/link.model');
const { VIEW_TYPE } = require('../../common/enums');
const { NotFoundError } = require('../../common/errors');
const mongoose = require('mongoose');

const buildDateMatch = (startDate, endDate) => {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) range.$lte = new Date(endDate);
  return { createdAt: range };
};

class AnalyticsService {
  async getCreatorOverview(creatorId, { startDate, endDate } = {}) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const dateMatch = buildDateMatch(startDate, endDate);

    const sessionMatch = { creatorId: creatorObjectId, ...dateMatch };
    const ledgerMatch = { creatorId: creatorObjectId, ...dateMatch };

    const [totalViews, validViews, rejectedViews, earningsResult] = await Promise.all([
      PlaybackSession.countDocuments(sessionMatch),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...ledgerMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    return {
      totalViews,
      validViews,
      rejectedViews,
      totalEarnings: earningsResult[0]?.totalEarnings || 0
    };
  }

  async getVideoAnalytics(creatorId, videoId, { startDate, endDate } = {}) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const videoObjectId = new mongoose.Types.ObjectId(videoId);
    const video = await Video.findOne({ _id: videoObjectId, creatorId: creatorObjectId });
    if (!video) return null;

    const dateMatch = buildDateMatch(startDate, endDate);
    const ledgerMatch = { videoId: videoObjectId, ...dateMatch };

    const [totalViews, validViews, rejectedViews, earningsResult] = await Promise.all([
      PlaybackSession.countDocuments({ videoId: videoObjectId, ...dateMatch }),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ ...ledgerMatch, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { ...ledgerMatch, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    return {
      video: { id: video._id, title: video.title, type: video.type },
      totalViews,
      validViews,
      rejectedViews,
      totalEarnings: earningsResult[0]?.totalEarnings || 0
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

    return series;
  }

  async getLinkAnalytics(creatorId, linkId) {
    const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
    const linkObjectId = new mongoose.Types.ObjectId(linkId);

    const link = await Link.findOne({ _id: linkObjectId, creatorId: creatorObjectId });
    if (!link) throw new NotFoundError('Link not found');

    const [totalViews, validViews, rejectedViews, earningsResult] = await Promise.all([
      PlaybackSession.countDocuments({ linkId: linkObjectId }),
      ViewLedger.countDocuments({ linkId: linkObjectId, viewType: VIEW_TYPE.VALID }),
      ViewLedger.countDocuments({ linkId: linkObjectId, viewType: VIEW_TYPE.REJECTED }),
      ViewLedger.aggregate([
        { $match: { linkId: linkObjectId, viewType: VIEW_TYPE.VALID } },
        { $group: { _id: null, totalEarnings: { $sum: '$earningsAmount' } } }
      ])
    ]);

    return {
      link: { id: link._id, shortCode: link.shortCode, isActive: link.isActive },
      totalViews,
      validViews,
      rejectedViews,
      totalEarnings: earningsResult[0]?.totalEarnings || 0
    };
  }

  async getAdminDashboard({ startDate, endDate } = {}) {
    const dateMatch = buildDateMatch(startDate, endDate);

    const [totalViews, validViews, rejectedViews, earningsResult, topCreatorsRaw] = await Promise.all([
      PlaybackSession.countDocuments(dateMatch),
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

    return {
      totalViews,
      validViews,
      rejectedViews,
      totalEarnings: earningsResult[0]?.totalEarnings || 0,
      topCreators: topCreatorsRaw
    };
  }
}

module.exports = new AnalyticsService();
