const walletService = require('./wallet.service');
const { successResponse } = require('../../common/helpers/response.helper');

class WalletController {
  async getWallet(req, res, next) {
    try {
      const wallet = await walletService.getWallet(req.user.userId);
      successResponse(res, wallet, 'Wallet retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req, res, next) {
    try {
      const { limit } = req.query;
      const transactions = await walletService.getTransactions(req.user.userId, limit);
      successResponse(res, transactions, 'Transactions retrieved');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WalletController();
