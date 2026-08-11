const withdrawalService = require('./withdrawal.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { formatCurrency } = require('../../common/utils');

class WithdrawalController {
  async createWithdrawal(req, res, next) {
    try {
      const withdrawal = await withdrawalService.createWithdrawal(
        req.user.userId,
        req.body.amount,
        req.body.paymentMethod
      );
      
      // Format currency for display
      const formattedWithdrawal = {
        ...withdrawal.toObject(),
        amountFormatted: formatCurrency(withdrawal.amount)
      };
      
      successResponse(res, formattedWithdrawal, 'Withdrawal request created', 201);
    } catch (error) {
      next(error);
    }
  }

  async getWithdrawals(req, res, next) {
    try {
      const withdrawals = await withdrawalService.getCreatorWithdrawals(req.user.userId);
      
      // Format currency for each withdrawal
      const formattedWithdrawals = withdrawals.map(w => ({
        ...w.toObject(),
        amountFormatted: formatCurrency(w.amount)
      }));
      
      successResponse(res, formattedWithdrawals, 'Withdrawals retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getAllWithdrawals(req, res, next) {
    try {
      const result = await withdrawalService.getAllWithdrawals(req.query);
      
      // Format currency for each withdrawal
      const formattedWithdrawals = result.withdrawals.map(w => ({
        ...w.toObject(),
        amountFormatted: formatCurrency(w.amount)
      }));
      
      successResponse(res, { ...result, withdrawals: formattedWithdrawals }, 'All withdrawals retrieved');
    } catch (error) {
      next(error);
    }
  }

  async approveWithdrawal(req, res, next) {
    try {
      const withdrawal = await withdrawalService.approveWithdrawal(
        req.params.id,
        req.user.userId,
        req.body.adminNote
      );
      
      // Format currency for display
      const formattedWithdrawal = {
        ...withdrawal.toObject(),
        amountFormatted: formatCurrency(withdrawal.amount)
      };
      
      successResponse(res, formattedWithdrawal, 'Withdrawal approved');
    } catch (error) {
      next(error);
    }
  }

  async rejectWithdrawal(req, res, next) {
    try {
      const withdrawal = await withdrawalService.rejectWithdrawal(
        req.params.id,
        req.user.userId,
        req.body.adminNote
      );
      
      // Format currency for display
      const formattedWithdrawal = {
        ...withdrawal.toObject(),
        amountFormatted: formatCurrency(withdrawal.amount)
      };
      
      successResponse(res, formattedWithdrawal, 'Withdrawal rejected');
    } catch (error) {
      next(error);
    }
  }

  async markAsPaid(req, res, next) {
    try {
      const withdrawal = await withdrawalService.markAsPaid(req.params.id, req.user.userId);
      
      // Format currency for display
      const formattedWithdrawal = {
        ...withdrawal.toObject(),
        amountFormatted: formatCurrency(withdrawal.amount)
      };
      
      successResponse(res, formattedWithdrawal, 'Withdrawal marked as paid');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WithdrawalController();
