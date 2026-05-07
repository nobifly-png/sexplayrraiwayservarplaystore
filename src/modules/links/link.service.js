const Link = require('./link.model');
const Video = require('../videos/video.model');
const { generateShortCode } = require('../../common/utils');
const { NotFoundError, BadRequestError } = require('../../common/errors');
const { VIDEO_STATUS, AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const auditService = require('../audit/audit.service');

class LinkService {
  async createLink(creatorId, videoId, auditCtx = {}) {
    const video = await Video.findOne({ _id: videoId, creatorId, isDeleted: false });
    if (!video) throw new NotFoundError('Video not found');
    if (video.status !== VIDEO_STATUS.READY) throw new BadRequestError('Video is not ready for sharing');

    let shortCode;
    let attempts = 0;
    while (attempts < 10) {
      shortCode = generateShortCode();
      const existing = await Link.findOne({ shortCode });
      if (!existing) break;
      attempts++;
      if (attempts === 10) throw new Error('Failed to generate unique short code, please retry');
    }

    const link = await Link.create({ videoId, creatorId, shortCode, isActive: true });

    auditService.logAction({
      userId: creatorId,
      action: AUDIT_ACTION.LINK_CREATED,
      entityType: AUDIT_ENTITY_TYPE.LINK,
      entityId: link._id,
      metadata: { shortCode, videoId },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return link;
  }

  async getVideoLinks(creatorId, videoId) {
    const video = await Video.findOne({ _id: videoId, creatorId });
    if (!video) throw new NotFoundError('Video not found');
    return await Link.find({ videoId }).sort({ createdAt: -1 });
  }

  async toggleLink(creatorId, linkId, auditCtx = {}) {
    const link = await Link.findOne({ _id: linkId, creatorId });
    if (!link) throw new NotFoundError('Link not found');

    link.isActive = !link.isActive;
    await link.save();

    auditService.logAction({
      userId: creatorId,
      action: AUDIT_ACTION.LINK_TOGGLED,
      entityType: AUDIT_ENTITY_TYPE.LINK,
      entityId: link._id,
      metadata: { isActive: link.isActive },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return link;
  }

  async resolveLinkByShortCode(shortCode) {
    const link = await Link.findOne({ shortCode }).populate('videoId');
    if (!link || !link.isActive) throw new NotFoundError('Link not found or inactive');

    const video = link.videoId;
    if (!video || video.isDeleted || video.status !== VIDEO_STATUS.READY) {
      throw new NotFoundError('Video not available');
    }

    return { link, video };
  }
}

module.exports = new LinkService();
