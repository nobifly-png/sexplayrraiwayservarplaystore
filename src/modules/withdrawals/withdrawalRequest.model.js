const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS } = require('../../common/enums');

const withdrawalRequestSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(WITHDRAWAL_STATUS),
    default: WITHDRAWAL_STATUS.PENDING
  },
  paymentMethod: {
    type: Object
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  paidAt: {
    type: Date
  },
  adminNote: {
    type: String
  }
}, {
  timestamps: true
});

withdrawalRequestSchema.index({ creatorId: 1, status: 1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index(
  { creatorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: WITHDRAWAL_STATUS.PENDING }
  }
);

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
