const Video = require('./video.model');
const { deleteR2Object } = require('../telegram/r2.utils');
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
    
    // Populate the first active link for each video
    const Link = require('../links/link.model');
    const videos = await Video.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    
    // Fetch links for all videos in parallel
    const videoIds = videos.map(v => v._id);
    const links = await Link.find({ 
      videoId: { $in: videoIds }, 
      isActive: true 
    }).sort({ createdAt: 1 }).lean();
    
    // Map first link to each video
    const linksByVideoId = {};
    links.forEach(link => {
      if (!linksByVideoId[link.videoId.toString()]) {
        linksByVideoId[link.videoId.toString()] = link;
      }
    });
    
    // Attach link to each video
    return videos.map(video => ({
      ...video,
      link: linksByVideoId[video._id.toString()] || null
    }));
  }

  async getVideoById(videoId, creatorId) {
    const video = await Video.findOne({ _id: videoId, creatorId, isDeleted: false }).lean();
    if (!video) throw new NotFoundError('Video not found');
    
    // Fetch the first active link for this video
    const Link = require('../links/link.model');
    const link = await Link.findOne({ videoId, isActive: true }).sort({ createdAt: 1 }).lean();
    
    return {
      ...video,
      link: link || null
    };
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

    // Safe R2 deletion: only delete the file if no other active video references same storageKey
    if (video.storageKey) {
      const otherRefs = await Video.countDocuments({
        storageKey: video.storageKey,
        isDeleted: false,
        _id: { $ne: video._id }
      });
      if (otherRefs === 0) {
        deleteR2Object(video.storageKey).catch(() => {});
      }
    }
    // Same check for thumbnail (only delete if no other video uses it)
    if (video.thumbnailKey) {
      const otherThumbRefs = await Video.countDocuments({
        thumbnailKey: video.thumbnailKey,
        isDeleted: false,
        _id: { $ne: video._id }
      });
      if (otherThumbRefs === 0) {
        deleteR2Object(video.thumbnailKey).catch(() => {});
      }
    }

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

    // Safe R2 deletion: only delete the file if no other active video references same storageKey
    if (video.storageKey) {
      const otherRefs = await Video.countDocuments({
        storageKey: video.storageKey,
        isDeleted: false,
        _id: { $ne: video._id }
      });
      if (otherRefs === 0) {
        deleteR2Object(video.storageKey).catch(() => {});
      }
    }
    if (video.thumbnailKey) {
      const otherThumbRefs = await Video.countDocuments({
        thumbnailKey: video.thumbnailKey,
        isDeleted: false,
        _id: { $ne: video._id }
      });
      if (otherThumbRefs === 0) {
        deleteR2Object(video.thumbnailKey).catch(() => {});
      }
    }

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
