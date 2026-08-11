const WithdrawalRequest = require('./withdrawalRequest.model');
const walletService = require('../wallet/wallet.service');
const Wallet = require('../wallet/wallet.model');
const { BadRequestError, NotFoundError } = require('../../common/errors');
const { WITHDRAWAL_STATUS, AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const { getMinimumWithdrawalAmount } = require('../../common/utils/settingsHelpers');
const { getSetting } = require('../../common/utils/settingsCache');
const auditService = require('../audit/audit.service');
const mongoose = require('mongoose');

class WithdrawalService {
  async createWithdrawal(creatorId, amount, paymentMethod) {
    const dbSession = await mongoose.startSession();
    try {
      let createdWithdrawal = null;

      await dbSession.withTransaction(async () => {
        const minWithdrawalSetting = await getSetting('minimumWithdrawalAmount');
        const minAmount = getMinimumWithdrawalAmount(minWithdrawalSetting);

        if (amount < minAmount) {
          throw new BadRequestError(`Minimum withdrawal amount is $${minAmount}`);
        }

        const wallet = await Wallet.findOneAndUpdate(
          { creatorId },
          { $setOnInsert: { creatorId } },
          { upsert: true, new: true, session: dbSession }
        );
        if (wallet.availableBalance < amount) {
          throw new BadRequestError('Insufficient balance');
        }

        const pendingWithdrawal = await WithdrawalRequest.findOne({
          creatorId,
          status: WITHDRAWAL_STATUS.PENDING
        }).session(dbSession);

        if (pendingWithdrawal) {
          throw new BadRequestError('You already have a pending withdrawal request');
        }

        const [withdrawal] = await WithdrawalRequest.create([{
          creatorId,
          amount,
          paymentMethod,
          status: WITHDRAWAL_STATUS.PENDING
        }], { session: dbSession });

        await walletService.moveToWithdrawal(creatorId, amount, withdrawal._id, { session: dbSession });
        createdWithdrawal = withdrawal;
      });

      auditService.logAction({
        userId: creatorId,
        action: AUDIT_ACTION.WITHDRAWAL_REQUESTED,
        entityType: AUDIT_ENTITY_TYPE.WITHDRAWAL,
        entityId: createdWithdrawal._id,
        metadata: { amount, paymentMethod }
      });

      return createdWithdrawal;
    } catch (error) {
      if (error && error.code === 11000) {
        throw new BadRequestError('You already have a pending withdrawal request');
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }
  }

  async getCreatorWithdrawals(creatorId) {
    return await WithdrawalRequest.find({ creatorId }).sort({ createdAt: -1 });
  }

  async getAllWithdrawals(filters = {}) {
    const query = {};
    const {
      status,
      page: rawPage,
      limit: rawLimit
    } = filters;

    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));

    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [withdrawals, total] = await Promise.all([
      WithdrawalRequest.find(query)
        .populate('creatorId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WithdrawalRequest.countDocuments(query)
    ]);

    return { withdrawals, total, page, limit };
  }

  async approveWithdrawal(withdrawalId, adminId, adminNote) {
    const withdrawal = await WithdrawalRequest.findOneAndUpdate(
      { _id: withdrawalId, status: WITHDRAWAL_STATUS.PENDING },
      {
        $set: {
          status: WITHDRAWAL_STATUS.APPROVED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          adminNote
        }
      },
      { new: true }
    );

    if (!withdrawal) {
      const existing = await WithdrawalRequest.findById(withdrawalId);
      if (!existing) throw new NotFoundError('Withdrawal request not found');
      throw new BadRequestError('Withdrawal is not in pending status');
    }

    auditService.logAction({
      userId: adminId,
      action: AUDIT_ACTION.WITHDRAWAL_APPROVED,
      entityType: AUDIT_ENTITY_TYPE.WITHDRAWAL,
      entityId: withdrawal._id,
      metadata: { adminNote, amount: withdrawal.amount }
    });

    return withdrawal;
  }

  async rejectWithdrawal(withdrawalId, adminId, adminNote) {
    const dbSession = await mongoose.startSession();
    try {
      let updated = null;
      await dbSession.withTransaction(async () => {
        updated = await WithdrawalRequest.findOneAndUpdate(
          { _id: withdrawalId, status: WITHDRAWAL_STATUS.PENDING },
          {
            $set: {
              status: WITHDRAWAL_STATUS.REJECTED,
              reviewedBy: adminId,
              reviewedAt: new Date(),
              adminNote
            }
          },
          { new: true, session: dbSession }
        );

        if (!updated) {
          const existing = await WithdrawalRequest.findById(withdrawalId).session(dbSession);
          if (!existing) {
            throw new NotFoundError('Withdrawal request not found');
          }
          throw new BadRequestError('Withdrawal is not in pending status');
        }

        await walletService.revertWithdrawal(
          updated.creatorId,
          updated.amount,
          updated._id,
          { session: dbSession }
        );
      });

      auditService.logAction({
        userId: adminId,
        action: AUDIT_ACTION.WITHDRAWAL_REJECTED,
        entityType: AUDIT_ENTITY_TYPE.WITHDRAWAL,
        entityId: updated._id,
        metadata: { adminNote, amount: updated.amount }
      });

      return updated;
    } finally {
      await dbSession.endSession();
    }
  }

  async markAsPaid(withdrawalId, adminId) {
    const dbSession = await mongoose.startSession();
    try {
      let updated = null;
      await dbSession.withTransaction(async () => {
        updated = await WithdrawalRequest.findOneAndUpdate(
          { _id: withdrawalId, status: WITHDRAWAL_STATUS.APPROVED },
          {
            $set: {
              status: WITHDRAWAL_STATUS.PAID,
              paidAt: new Date()
            }
          },
          { new: true, session: dbSession }
        );

        if (!updated) {
          const existing = await WithdrawalRequest.findById(withdrawalId).session(dbSession);
          if (!existing) {
            throw new NotFoundError('Withdrawal request not found');
          }
          throw new BadRequestError('Withdrawal must be approved before marking as paid');
        }

        await walletService.completeWithdrawal(
          updated.creatorId,
          updated.amount,
          updated._id,
          { session: dbSession }
        );
      });

      auditService.logAction({
        userId: adminId,
        action: AUDIT_ACTION.WITHDRAWAL_PAID,
        entityType: AUDIT_ENTITY_TYPE.WITHDRAWAL,
        entityId: updated._id,
        metadata: { amount: updated.amount }
      });

      return updated;
    } finally {
      await dbSession.endSession();
    }
  }
}

module.exports = new WithdrawalService();
