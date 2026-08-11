const walletService = require('./wallet.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { formatCurrency } = require('../../common/utils');

class WalletController {
  async getWallet(req, res, next) {
    try {
      const wallet = await walletService.getWallet(req.user.userId);
      
      // Format currency for display
      const formattedWallet = {
        ...wallet.toObject(),
        totalEarningsFormatted: formatCurrency(wallet.totalEarnings),
        availableBalanceFormatted: formatCurrency(wallet.availableBalance),
        pendingBalanceFormatted: formatCurrency(wallet.pendingBalance),
        lifetimeWithdrawnFormatted: formatCurrency(wallet.lifetimeWithdrawn)
      };
      
      successResponse(res, formattedWallet, 'Wallet retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req, res, next) {
    try {
      const { limit } = req.query;
      const transactions = await walletService.getTransactions(req.user.userId, limit);
      
      // Format currency for each transaction
      const formattedTransactions = transactions.map(txn => ({
        ...txn.toObject(),
        amountFormatted: formatCurrency(Math.abs(txn.amount))
      }));
      
      successResponse(res, formattedTransactions, 'Transactions retrieved');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WalletController();
