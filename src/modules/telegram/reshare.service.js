const Link = require('../links/link.model');
const Video = require('../videos/video.model');
const linkService = require('../links/link.service');
const { NotFoundError } = require('../../common/errors');
const { VIDEO_STATUS } = require('../../common/enums');
const logger = require('../../config/logger');

/**
 * Given any ClipNova shortCode and a requesting userId,
 * find the original video and create a brand-new link
 * owned by the requesting user.
 *
 * Rules:
 * - Original video must exist and be READY
 * - If requesting user already has a link for this video, return existing one
 * - Otherwise create a fresh link under their account
 */
const reshareLink = async (shortCode, requestingUserId) => {
  // 1. Resolve the original link → video
  const originalLink = await Link.findOne({ shortCode }).populate('videoId');

  if (!originalLink) {
    throw new NotFoundError('Link not found');
  }

  const video = originalLink.videoId;

  if (!video || video.isDeleted || video.status !== VIDEO_STATUS.READY) {
    throw new NotFoundError('Video is not available');
  }

  const videoId = video._id.toString();
  const requestingUserIdStr = requestingUserId.toString();

  logger.info({
    shortCode,
    videoId,
    originalCreatorId: video.creatorId,
    requestingUserId: requestingUserIdStr
  }, 'Reshare: creating new link for requesting user');

  // 2. Check if requesting user already has an active link for this video
  const existingLink = await Link.findOne({
    videoId: video._id,
    creatorId: requestingUserId,
    isActive: true
  });

  if (existingLink) {
    logger.info({ linkId: existingLink._id }, 'Reshare: returning existing link');
    return { link: existingLink, video, isNew: false };
  }

  // 3. Create new link under requesting user's account
  const newLink = await linkService.createLink(requestingUserIdStr, videoId);

  logger.info({ newLinkId: newLink._id, shortCode: newLink.shortCode }, 'Reshare: new link created');

  return { link: newLink, video, isNew: true };
};

module.exports = { reshareLink };
