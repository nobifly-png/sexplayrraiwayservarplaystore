const Joi = require('joi');
const { FRAUD_SEVERITY } = require('../../common/enums');
const { DEFAULT_PAGE, MAX_LIMIT, FRAUD_FLAGS_DEFAULT_LIMIT } = require('../../common/constants/pagination');

const fraudFlagsListQuerySchema = Joi.object({
  resolved: Joi.boolean(),
  severity: Joi.string().valid(...Object.values(FRAUD_SEVERITY)),
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(FRAUD_FLAGS_DEFAULT_LIMIT)
});

module.exports = {
  fraudFlagsListQuerySchema
};
