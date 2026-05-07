const Joi = require('joi');
const { WITHDRAWAL_STATUS } = require('../../common/enums');
const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require('../../common/constants/pagination');

const upiMethod = Joi.object({
  type: Joi.string().valid('UPI').insensitive().required(),
  upiId: Joi.string().trim().min(3).max(128).required()
}).unknown(false);

const bankMethod = Joi.object({
  type: Joi.string().valid('BANK_TRANSFER').insensitive().required(),
  accountHolderName: Joi.string().trim().min(2).max(200).required(),
  accountNumber: Joi.string().trim().min(5).max(40).required(),
  ifscCode: Joi.string().trim().length(11).uppercase().required(),
  bankName: Joi.string().trim().max(200).optional()
}).unknown(false);

const paypalMethod = Joi.object({
  type: Joi.string().valid('PAYPAL').insensitive().required(),
  paypalEmail: Joi.string().trim().email().lowercase().required()
}).unknown(false);

const paymentMethodSchema = Joi.alternatives()
  .try(upiMethod, bankMethod, paypalMethod)
  .custom((value) => ({
    ...value,
    type: String(value.type).toUpperCase()
  }));

const createWithdrawalSchema = Joi.object({
  amount: Joi.number().positive().max(1e12).required(),
  paymentMethod: paymentMethodSchema.required()
});

const withdrawalAdminListQuerySchema = Joi.object({
  status: Joi.string().valid(...Object.values(WITHDRAWAL_STATUS)),
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
});

const reviewWithdrawalSchema = Joi.object({
  adminNote: Joi.string().allow('')
});

module.exports = {
  createWithdrawalSchema,
  reviewWithdrawalSchema,
  withdrawalAdminListQuerySchema,
  paymentMethodSchema
};
