const Joi = require('joi');
const { ALLOWED_SETTING_KEYS } = require('./settings.valueSchemas');

/**
 * Structure + allowed keys only; value types/ranges enforced in settings.service via validateSettingValue.
 */
const updateSettingsSchema = Joi.object({
  settings: Joi.array()
    .items(
      Joi.object({
        key: Joi.string()
          .valid(...ALLOWED_SETTING_KEYS)
          .required()
          .messages({ 'any.only': `key must be one of: ${ALLOWED_SETTING_KEYS.join(', ')}` }),
        value: Joi.any().required()
      })
    )
    .min(1)
    .required()
});

module.exports = {
  updateSettingsSchema
};
