const mongoose = require('mongoose');
const { WALLET_TRANSACTION_TYPE } = require('../../common/enums');

const walletTransactionSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: Object.values(WALLET_TRANSACTION_TYPE),
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String
  },
  referenceType: {
    type: String
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true
  },
  description: {
    type: String
  }
}, {
  timestamps: true
});

walletTransactionSchema.index({ creatorId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
