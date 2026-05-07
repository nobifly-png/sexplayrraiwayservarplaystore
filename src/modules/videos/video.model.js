const mongoose = require('mongoose');
const { VIDEO_TYPE, VIDEO_STATUS } = require('../../common/enums');

const videoSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: Object.values(VIDEO_TYPE),
    required: true
  },
  externalUrl: {
    type: String
  },
  storageKey: {
    type: String
  },
  fileName: {
    type: String
  },
  mimeType: {
    type: String
  },
  fileSize: {
    type: Number
  },
  durationSeconds: {
    type: Number
  },
  status: {
    type: String,
    enum: Object.values(VIDEO_STATUS),
    default: VIDEO_STATUS.UPLOADING
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

videoSchema.index({ creatorId: 1, isDeleted: 1 });
videoSchema.index({ status: 1 });
videoSchema.index({ type: 1 });

module.exports = mongoose.model('Video', videoSchema);
