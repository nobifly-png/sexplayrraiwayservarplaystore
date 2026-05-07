const Joi = require('joi');
const { PLAYBACK_EVENT_TYPE } = require('../../common/enums');
const { objectIdSchema } = require('../../common/validation/objectId');

const createSessionSchema = Joi.object({
  linkId: objectIdSchema.required(),
  fingerprint: Joi.string().max(512).allow('').optional()
});

const createEventSchema = Joi.object({
  sessionId: objectIdSchema.required(),
  eventType: Joi.string().valid(...Object.values(PLAYBACK_EVENT_TYPE)).required(),
  positionSeconds: Joi.number().min(0).max(86400),
  meta: Joi.object().unknown(true)
});

const finalizeSessionSchema = Joi.object({
  sessionId: objectIdSchema.required()
});

module.exports = {
  createSessionSchema,
  createEventSchema,
  finalizeSessionSchema
};
