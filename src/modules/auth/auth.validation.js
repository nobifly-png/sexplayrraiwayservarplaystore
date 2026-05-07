const Joi = require('joi');

const emailSchema = Joi.string().email({ tlds: { allow: false } });

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: emailSchema.required(),
  password: Joi.string().min(8).required()
});

const loginSchema = Joi.object({
  email: emailSchema.required(),
  password: Joi.string().required()
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const logoutSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema
};
