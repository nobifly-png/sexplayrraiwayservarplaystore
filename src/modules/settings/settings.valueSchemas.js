const Joi = require('joi');
const {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  MIN_WATCH_SECONDS,
  MAX_VIEWS_PER_IP_PER_HOUR,
  MIN_WITHDRAWAL_AMOUNT,
  DEFAULT_EARNINGS_PER_VIEW
} = require('../../common/constants');

/**
 * Joi schemas for `value` field only, keyed by setting key.
 * Bounds keep business rules sane; tune in one place.
 */
const SETTING_VALUE_SCHEMAS = {
  earningsPerValidView: Joi.number()
    .min(0)
    .max(1000)
    .required()
    .messages({ 'number.base': 'earningsPerValidView must be a number' }),

  minimumWithdrawalAmount: Joi.number()
    .min(0)
    .max(1e9)
    .required()
    .messages({ 'number.base': 'minimumWithdrawalAmount must be a number' }),

  maxViewsPerIpPerHour: Joi.number()
    .integer()
    .min(1)
    .max(100000)
    .required()
    .messages({ 'number.base': 'maxViewsPerIpPerHour must be an integer' }),

  minimumWatchSeconds: Joi.number()
    .min(0)
    .max(86400)
    .required()
    .messages({ 'number.base': 'minimumWatchSeconds must be a number' }),

  allowedVideoMimeTypes: Joi.array()
    .items(Joi.string().trim().valid(...ALLOWED_VIDEO_MIME_TYPES))
    .min(1)
    .max(20)
    .required()
    .messages({ 'array.min': 'allowedVideoMimeTypes must list at least one allowed type' }),

  maxUploadSizeBytes: Joi.number()
    .integer()
    .min(1024)
    .max(10737418240) // 10GB cap
    .required()
    .messages({ 'number.base': 'maxUploadSizeBytes must be an integer' }),

  maintenanceMode: Joi.boolean().required(),

  telegramBotEnabled: Joi.boolean().required()
};

const ALLOWED_SETTING_KEYS = Object.keys(SETTING_VALUE_SCHEMAS);

/**
 * Validate a single setting value for a key. Returns normalized value from Joi.
 */
const validateSettingValue = (key, value) => {
  const schema = SETTING_VALUE_SCHEMAS[key];
  if (!schema) {
    return { error: new Error(`Unknown setting key: ${key}`) };
  }
  const { error, value: normalized } = schema.validate(value, { abortEarly: false });
  if (error) {
    return { error: new Error(error.details.map((d) => d.message).join(', ')) };
  }
  return { value: normalized };
};

module.exports = {
  SETTING_VALUE_SCHEMAS,
  ALLOWED_SETTING_KEYS,
  validateSettingValue
};
