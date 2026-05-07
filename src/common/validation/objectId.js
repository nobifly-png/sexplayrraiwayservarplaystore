const mongoose = require('mongoose');
const Joi = require('joi');

/**
 * Joi schema for MongoDB ObjectId strings (24 hex chars, valid for mongoose).
 */
const objectIdSchema = Joi.string()
  .trim()
  .length(24)
  .pattern(/^[0-9a-fA-F]{24}$/)
  .custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  })
  .messages({
    'string.length': 'Invalid id format',
    'any.invalid': 'Invalid id'
  });

module.exports = {
  objectIdSchema
};
