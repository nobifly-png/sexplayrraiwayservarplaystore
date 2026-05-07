const mongoose = require('mongoose');

const refreshSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  deviceInfo: {
    type: Object
  },
  expiresAt: {
    type: Date,
    required: true
  },
  revokedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes (tokenHash already indexed via unique: true)
refreshSessionSchema.index({ userId: 1 });
refreshSessionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('RefreshSession', refreshSessionSchema);
