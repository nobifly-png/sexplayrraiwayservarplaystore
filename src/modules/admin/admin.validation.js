const Joi = require('joi');
const { USER_ROLES, USER_STATUS, AUDIT_ACTION, AUDIT_ENTITY_TYPE, VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');
const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require('../../common/constants/pagination');
const { objectIdSchema } = require('../../common/validation/routeParams');

const adminUserListQuerySchema = Joi.object({
  role: Joi.string().valid(...Object.values(USER_ROLES)),
  status: Joi.string().valid(...Object.values(USER_STATUS)),
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
});

const auditLogQuerySchema = Joi.object({
  userId: objectIdSchema,
  action: Joi.string().valid(...Object.values(AUDIT_ACTION)),
  entityType: Joi.string().valid(...Object.values(AUDIT_ENTITY_TYPE)),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
});

const adminVideoListQuerySchema = Joi.object({
  status: Joi.string().valid(...Object.values(VIDEO_STATUS)),
  type: Joi.string().valid(...Object.values(VIDEO_TYPE)),
  creatorId: objectIdSchema,
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
});

module.exports = {
  adminUserListQuerySchema,
  auditLogQuerySchema,
  adminVideoListQuerySchema
};
