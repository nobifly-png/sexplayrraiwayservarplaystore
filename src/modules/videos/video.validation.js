const Joi = require('joi');
const { VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');
const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require('../../common/constants/pagination');

const createVideoSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(2000).allow(''),
  type: Joi.string().valid(...Object.values(VIDEO_TYPE)).required(),
  externalUrl: Joi.string().uri().when('type', {
    is: VIDEO_TYPE.EXTERNAL_REF,
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })
});

const updateVideoSchema = Joi.object({
  title: Joi.string().min(1).max(200),
  description: Joi.string().max(2000).allow('')
});

const videoListQuerySchema = Joi.object({
  status: Joi.string().valid(...Object.values(VIDEO_STATUS)),
  type: Joi.string().valid(...Object.values(VIDEO_TYPE)),
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
});

module.exports = {
  createVideoSchema,
  updateVideoSchema,
  videoListQuerySchema
};
