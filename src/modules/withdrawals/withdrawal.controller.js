const withdrawalService = require('./withdrawal.service');
const { successResponse } = require('../../common/helpers/response.helper');

class WithdrawalController {
  async createWithdrawal(req, res, next) {
    try {
      const withdrawal = await withdrawalService.createWithdrawal(
        req.user.userId,
        req.body.amount,
        req.body.paymentMethod
      );
      successResponse(res, withdrawal, 'Withdrawal request created', 201);
    } catch (error) {
      next(error);
    }
  }

  async getWithdrawals(req, res, next) {
    try {
      const withdrawals = await withdrawalService.getCreatorWithdrawals(req.user.userId);
      successResponse(res, withdrawals, 'Withdrawals retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getAllWithdrawals(req, res, next) {
    try {
      const withdrawals = await withdrawalService.getAllWithdrawals(req.query);
      successResponse(res, withdrawals, 'All withdrawals retrieved');
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
      successResponse(res, withdrawal, 'Withdrawal approved');
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
      successResponse(res, withdrawal, 'Withdrawal rejected');
    } catch (error) {
      next(error);
    }
  }

  async markAsPaid(req, res, next) {
    try {
      const withdrawal = await withdrawalService.markAsPaid(req.params.id, req.user.userId);
      successResponse(res, withdrawal, 'Withdrawal marked as paid');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WithdrawalController();
