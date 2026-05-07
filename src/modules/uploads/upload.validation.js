const Joi = require('joi');
const { objectIdSchema } = require('../../common/validation/objectId');
const { MAX_UPLOAD_SIZE_BYTES } = require('../../common/constants');

const initiateUploadSchema = Joi.object({
  videoId: objectIdSchema.required(),
  fileName: Joi.string().min(1).max(512).pattern(/^[^\\/]+$/).required(),
  fileSize: Joi.number().integer().positive().max(MAX_UPLOAD_SIZE_BYTES).required(),
  mimeType: Joi.string().min(3).max(128).required()
});

const completeUploadSchema = Joi.object({
  videoId: objectIdSchema.required()
});

module.exports = {
  initiateUploadSchema,
  completeUploadSchema
};
