const Joi = require('joi');
const { objectIdSchema } = require('../../common/validation/objectId');

const createLinkSchema = Joi.object({
  videoId: objectIdSchema.required()
});

module.exports = {
  createLinkSchema
};
