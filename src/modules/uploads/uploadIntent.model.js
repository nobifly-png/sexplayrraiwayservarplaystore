const mongoose = require('mongoose');
const { UPLOAD_STATUS } = require('../../common/enums');

const uploadIntentSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  storageKey: {
    type: String,
    required: true
  },
  expectedSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(UPLOAD_STATUS),
    default: UPLOAD_STATUS.INITIATED
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

uploadIntentSchema.index({ status: 1 });
uploadIntentSchema.index({ expiresAt: 1 });
/** At most one active INITIATED intent per video (prevents duplicate concurrent uploads). */
uploadIntentSchema.index(
  { videoId: 1 },
  { unique: true, partialFilterExpression: { status: UPLOAD_STATUS.INITIATED } }
);

module.exports = mongoose.model('UploadIntent', uploadIntentSchema);
