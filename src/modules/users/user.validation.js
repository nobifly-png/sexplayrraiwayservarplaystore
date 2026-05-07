const Joi = require('joi');

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  email: Joi.string().email({ tlds: { allow: false } })
}).min(1);

module.exports = { updateProfileSchema };
