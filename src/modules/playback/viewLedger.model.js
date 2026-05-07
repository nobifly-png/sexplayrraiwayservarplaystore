const mongoose = require('mongoose');
const { VIEW_TYPE } = require('../../common/enums');

const viewLedgerSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlaybackSession',
    required: true,
    unique: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  linkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Link',
    required: true
  },
  viewType: {
    type: String,
    enum: Object.values(VIEW_TYPE),
    required: true
  },
  reason: {
    type: String
  },
  earningsAmount: {
    type: Number,
    default: 0
  },
  processedAt: {
    type: Date,
    default: Date.now
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

// Indexes (sessionId and idempotencyKey already indexed via unique: true)
viewLedgerSchema.index({ videoId: 1 });
viewLedgerSchema.index({ creatorId: 1, processedAt: 1 });
viewLedgerSchema.index({ linkId: 1 });

module.exports = mongoose.model('ViewLedger', viewLedgerSchema);
