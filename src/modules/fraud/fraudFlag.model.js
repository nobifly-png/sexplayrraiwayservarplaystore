const mongoose = require('mongoose');
const { FRAUD_TYPE, FRAUD_SEVERITY } = require('../../common/enums');

const fraudFlagSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video'
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlaybackSession'
  },
  type: {
    type: String,
    enum: Object.values(FRAUD_TYPE),
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: Object.values(FRAUD_SEVERITY),
    default: FRAUD_SEVERITY.LOW
  },
  meta: {
    type: Object
  },
  resolved: {
    type: Boolean,
    default: false
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

fraudFlagSchema.index({ sessionId: 1 });
fraudFlagSchema.index({ creatorId: 1 });
fraudFlagSchema.index({ resolved: 1, severity: 1 });

module.exports = mongoose.model('FraudFlag', fraudFlagSchema);
