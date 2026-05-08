const mongoose = require('mongoose');

const INGEST_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  DUPLICATE: 'DUPLICATE'
};

const ingestJobSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video'
  },
  sourceUrl: {
    type: String,
    required: true
  },
  normalizedUrl: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(INGEST_STATUS),
    default: INGEST_STATUS.PENDING
  },
  telegramChatId: {
    type: String
  },
  telegramMessageId: {
    type: Number
  },
  title: {
    type: String
  },
  errorMessage: {
    type: String
  },
  metadata: {
    type: Object,
    default: {}
  }
}, { timestamps: true });

ingestJobSchema.index({ creatorId: 1, createdAt: -1 });
ingestJobSchema.index({ normalizedUrl: 1, creatorId: 1 });
ingestJobSchema.index({ status: 1 });

module.exports = mongoose.model('IngestJob', ingestJobSchema);
module.exports.INGEST_STATUS = INGEST_STATUS;
