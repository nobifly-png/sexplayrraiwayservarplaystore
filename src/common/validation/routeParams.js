const Joi = require('joi');
const { objectIdSchema } = require('./objectId');

const idParam = Joi.object({
  id: objectIdSchema.required()
});

const videoIdParam = Joi.object({
  videoId: objectIdSchema.required()
});

const withdrawalIdParam = Joi.object({
  id: objectIdSchema.required()
});

const shortCodeParam = Joi.object({
  shortCode: Joi.string().trim().min(4).max(32).required()
});

module.exports = {
  idParam,
  videoIdParam,
  withdrawalIdParam,
  shortCodeParam,
  objectIdSchema
};
