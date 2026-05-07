const Video = require('./video.model');
const { NotFoundError } = require('../../common/errors');
const { VIDEO_TYPE, VIDEO_STATUS, AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const auditService = require('../audit/audit.service');

class VideoService {
  async createVideo(creatorId, data, auditCtx = {}) {
    const videoData = {
      creatorId,
      title: data.title,
      description: data.description,
      type: data.type
    };

    if (data.type === VIDEO_TYPE.EXTERNAL_REF) {
      videoData.externalUrl = data.externalUrl;
      videoData.status = VIDEO_STATUS.READY;
    } else {
      videoData.status = VIDEO_STATUS.UPLOADING;
    }

    const video = await Video.create(videoData);

    auditService.logAction({
      userId: creatorId,
      action: AUDIT_ACTION.VIDEO_CREATED,
      entityType: AUDIT_ENTITY_TYPE.VIDEO,
      entityId: video._id,
      metadata: { title: video.title, type: video.type },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return video;
  }

  async getCreatorVideos(creatorId, filters = {}) {
    const query = { creatorId, isDeleted: false };
    const { status, type, page, limit } = filters;

    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (page - 1) * limit;
    return await Video.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
  }

  async getVideoById(videoId, creatorId) {
    const video = await Video.findOne({ _id: videoId, creatorId, isDeleted: false });
    if (!video) throw new NotFoundError('Video not found');
    return video;
  }

  async updateVideo(videoId, creatorId, data, auditCtx = {}) {
    const video = await Video.findOne({ _id: videoId, creatorId, isDeleted: false });
    if (!video) throw new NotFoundError('Video not found');

    if (data.title) video.title = data.title;
    if (data.description !== undefined) video.description = data.description;
    await video.save();

    auditService.logAction({
      userId: creatorId,
      action: AUDIT_ACTION.VIDEO_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.VIDEO,
      entityId: video._id,
      metadata: { changes: data },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return video;
  }

  async deleteVideo(videoId, creatorId, auditCtx = {}) {
    const video = await Video.findOne({ _id: videoId, creatorId, isDeleted: false });
    if (!video) throw new NotFoundError('Video not found');

    video.isDeleted = true;
    video.deletedAt = new Date();
    video.status = VIDEO_STATUS.DELETED;
    await video.save();

    auditService.logAction({
      userId: creatorId,
      action: AUDIT_ACTION.VIDEO_DELETED,
      entityType: AUDIT_ENTITY_TYPE.VIDEO,
      entityId: video._id,
      metadata: { title: video.title },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });
  }

  async adminDeleteVideo(videoId, adminId, auditCtx = {}) {
    const video = await Video.findOne({ _id: videoId, isDeleted: false });
    if (!video) throw new NotFoundError('Video not found');

    video.isDeleted = true;
    video.deletedAt = new Date();
    video.status = VIDEO_STATUS.DELETED;
    await video.save();

    auditService.logAction({
      userId: adminId,
      action: AUDIT_ACTION.ADMIN_VIDEO_DELETED,
      entityType: AUDIT_ENTITY_TYPE.VIDEO,
      entityId: video._id,
      metadata: { title: video.title, creatorId: video.creatorId },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });
  }

  async adminGetVideos(filters = {}) {
    const query = { isDeleted: false };
    const { status, type, creatorId, page = 1, limit = 50 } = filters;

    if (status) query.status = status;
    if (type) query.type = type;
    if (creatorId) query.creatorId = creatorId;

    const skip = (page - 1) * limit;
    const [videos, total] = await Promise.all([
      Video.find(query)
        .populate('creatorId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Video.countDocuments(query)
    ]);

    return { videos, total, page, limit };
  }

  async getVideoByIdPublic(videoId) {
    const video = await Video.findOne({ _id: videoId, isDeleted: false, status: VIDEO_STATUS.READY });
    if (!video) throw new NotFoundError('Video not found or not available');
    return video;
  }
}

module.exports = new VideoService();
