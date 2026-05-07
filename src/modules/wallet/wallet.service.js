const Wallet = require('./wallet.model');
const WalletTransaction = require('./walletTransaction.model');
const SystemSetting = require('../settings/systemSetting.model');
const { generateIdempotencyKey } = require('../../common/utils');
const { WALLET_TRANSACTION_TYPE } = require('../../common/enums');
const { CURRENCY } = require('../../common/constants');
const { WALLET_TX_MAX_LIMIT } = require('../../common/constants/pagination');
const { getEarningsPerValidView } = require('../../common/utils/settingsHelpers');
const { BadRequestError } = require('../../common/errors');
const mongoose = require('mongoose');

class WalletService {
  async getOrCreateWallet(creatorId) {
    let wallet = await Wallet.findOne({ creatorId });
    
    if (!wallet) {
      wallet = await Wallet.create({ creatorId });
    }

    return wallet;
  }

  async getWallet(creatorId) {
    return await this.getOrCreateWallet(creatorId);
  }

  async creditEarnings(creatorId, sessionId, videoId) {
    const earningsPerViewSetting = await SystemSetting.findOne({ key: 'earningsPerValidView' });
    const earningsAmount = getEarningsPerValidView(earningsPerViewSetting);
    const idempotencyKey = generateIdempotencyKey('earning', sessionId);
    const session = await mongoose.startSession();

    try {
      let creditedAmount = earningsAmount;

      await session.withTransaction(async () => {
        const existingTransaction = await WalletTransaction.findOne({ idempotencyKey }).session(session);
        if (existingTransaction) {
          creditedAmount = existingTransaction.amount;
          return;
        }

        await Wallet.findOneAndUpdate(
          { creatorId },
          {
            $setOnInsert: { creatorId },
            $inc: { totalEarnings: earningsAmount, availableBalance: earningsAmount }
          },
          { upsert: true, new: true, session }
        );

        await WalletTransaction.create([{
          creatorId,
          type: WALLET_TRANSACTION_TYPE.VIEW_EARNING,
          amount: earningsAmount,
          currency: CURRENCY,
          referenceType: 'PlaybackSession',
          referenceId: sessionId,
          idempotencyKey,
          description: 'Earnings from valid view'
        }], { session });
      });

      return creditedAmount;
    } finally {
      await session.endSession();
    }
  }

  async getTransactions(creatorId, limit = 50) {
    const n = Math.min(WALLET_TX_MAX_LIMIT, Math.max(1, Number(limit) || 50));
    return await WalletTransaction.find({ creatorId })
      .sort({ createdAt: -1 })
      .limit(n);
  }

  async moveToWithdrawal(creatorId, amount, withdrawalId, options = {}) {
    const idempotencyKey = generateIdempotencyKey('withdrawal-request', withdrawalId.toString());
    await this.applyWithdrawalMovement({
      creatorId,
      amount,
      type: WALLET_TRANSACTION_TYPE.WITHDRAWAL_REQUEST,
      referenceId: withdrawalId,
      idempotencyKey,
      inc: { availableBalance: -amount, pendingBalance: amount },
      description: 'Withdrawal requested',
      session: options.session
    });
  }

  async revertWithdrawal(creatorId, amount, withdrawalId, options = {}) {
    const idempotencyKey = generateIdempotencyKey('withdrawal-reject', withdrawalId.toString());
    await this.applyWithdrawalMovement({
      creatorId,
      amount,
      type: WALLET_TRANSACTION_TYPE.WITHDRAWAL_REJECTED,
      referenceId: withdrawalId,
      idempotencyKey,
      inc: { pendingBalance: -amount, availableBalance: amount },
      description: 'Withdrawal rejected - funds returned',
      session: options.session
    });
  }

  async completeWithdrawal(creatorId, amount, withdrawalId, options = {}) {
    const idempotencyKey = generateIdempotencyKey('withdrawal-paid', withdrawalId.toString());
    await this.applyWithdrawalMovement({
      creatorId,
      amount,
      type: WALLET_TRANSACTION_TYPE.WITHDRAWAL_PAID,
      referenceId: withdrawalId,
      idempotencyKey,
      inc: { pendingBalance: -amount, lifetimeWithdrawn: amount },
      description: 'Withdrawal paid',
      transactionAmount: amount,
      session: options.session
    });
  }

  async applyWithdrawalMovement({
    creatorId,
    amount,
    type,
    referenceId,
    idempotencyKey,
    inc,
    description,
    transactionAmount,
    session
  }) {
    if (session) {
      return this.applyWithdrawalMovementWithSession({
        creatorId,
        amount,
        type,
        referenceId,
        idempotencyKey,
        inc,
        description,
        transactionAmount,
        session
      });
    }

    const standaloneSession = await mongoose.startSession();
    try {
      await standaloneSession.withTransaction(async () => {
        await this.applyWithdrawalMovementWithSession({
          creatorId,
          amount,
          type,
          referenceId,
          idempotencyKey,
          inc,
          description,
          transactionAmount,
          session: standaloneSession
        });
      });
    } finally {
      await standaloneSession.endSession();
    }
  }

  async applyWithdrawalMovementWithSession({
    creatorId,
    amount,
    type,
    referenceId,
    idempotencyKey,
    inc,
    description,
    transactionAmount,
    session
  }) {
    const existing = await WalletTransaction.findOne({ idempotencyKey }).session(session);
    if (existing) {
      return;
    }

    await Wallet.findOneAndUpdate(
      { creatorId },
      { $setOnInsert: { creatorId } },
      { upsert: true, new: true, session }
    );

    const walletFilter = { creatorId };
    if (inc.availableBalance && inc.availableBalance < 0) {
      walletFilter.availableBalance = { $gte: Math.abs(inc.availableBalance) };
    }
    if (inc.pendingBalance && inc.pendingBalance < 0) {
      walletFilter.pendingBalance = { $gte: Math.abs(inc.pendingBalance) };
    }

    const walletUpdate = await Wallet.updateOne(walletFilter, { $inc: inc }, { session });
    if (walletUpdate.modifiedCount !== 1) {
      throw new BadRequestError('Wallet balance check failed for withdrawal movement');
    }

    await WalletTransaction.create([{
      creatorId,
      type,
      amount: transactionAmount ?? -amount,
      currency: CURRENCY,
      referenceType: 'WithdrawalRequest',
      referenceId,
      idempotencyKey,
      description
    }], { session });
  }
}

module.exports = new WalletService();
