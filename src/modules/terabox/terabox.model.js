/**
 * TeraboxJob model — tracks every TeraBox conversion request.
 * Stores original URL, R2 location, status, and error info.
 */
const mongoose = require('mongoose');

const TERABOX_JOB_STATUS = {
  PENDING:    'PENDING',
  PROCESSING: 'PROCESSING',
  DONE:       'DONE',
  FAILED:     'FAILED'
};

const teraboxJobSchema = new mongoose.Schema({
  requestedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  originalTeraboxUrl: {
    type: String,
    required: true
  },
  normalizedUrl: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(TERABOX_JOB_STATUS),
    default: TERABOX_JOB_STATUS.PENDING
  },
  // R2 result (populated on success)
  r2Key: { type: String },
  r2PublicUrl: { type: String },
  filename: { type: String },
  fileSizeBytes: { type: Number },
  mimeType: { type: String },
  // Zaxgram video + link (populated after Video record created)
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  zaxgramUrl: { type: String },
  // Error info (populated on failure)
  errorReason: { type: String },
  completedAt: { type: Date }
}, {
  timestamps: true
});

// Index for dedup and user history lookups
teraboxJobSchema.index({ requestedByUserId: 1, normalizedUrl: 1 });
teraboxJobSchema.index({ status: 1 });

module.exports = mongoose.model('TeraboxJob', teraboxJobSchema);
module.exports.TERABOX_JOB_STATUS = TERABOX_JOB_STATUS;
