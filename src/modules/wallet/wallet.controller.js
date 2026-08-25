const walletService = require('./wallet.service');
const snapshotService = require('../analytics/snapshot.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { formatCurrency } = require('../../common/utils');

class WalletController {
  async getWallet(req, res, next) {
    try {
      const [wallet, snapshot] = await Promise.all([
        walletService.getWallet(req.user.userId),
        snapshotService.getSnapshotOrDefault(req.user.userId)
      ]);

      const rawWallet = wallet.toObject();

      // Use snapshot display earnings (4:1 ratio already applied, same as dashboard).
      // This guarantees Total Earnings and Available Balance move in lockstep with
      // whatever the creator sees on the analytics dashboard.
      const displayEarnings = snapshot.totalEarnings;

      // Available balance = snapshot earnings minus pending/withdrawn
      // (pending and lifetimeWithdrawn are always real-time from the wallet model)
      const adjustedAvailable = Math.max(
        0,
        displayEarnings - (rawWallet.pendingBalance || 0) - (rawWallet.lifetimeWithdrawn || 0)
      );

      const formattedWallet = {
        ...rawWallet,
        totalEarnings: displayEarnings,
        availableBalance: adjustedAvailable,
        totalEarningsFormatted: formatCurrency(displayEarnings),
        availableBalanceFormatted: formatCurrency(adjustedAvailable),
        pendingBalanceFormatted: formatCurrency(rawWallet.pendingBalance),
        lifetimeWithdrawnFormatted: formatCurrency(rawWallet.lifetimeWithdrawn),
        snapshotAt: snapshot.snapshotAt  // optional: lets frontend show "last updated"
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
