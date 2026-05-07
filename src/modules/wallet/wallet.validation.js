const Joi = require('joi');
const { WALLET_TX_DEFAULT_LIMIT, WALLET_TX_MAX_LIMIT } = require('../../common/constants/pagination');

const walletTransactionsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(WALLET_TX_MAX_LIMIT).default(WALLET_TX_DEFAULT_LIMIT)
});

module.exports = {
  walletTransactionsQuerySchema
};
