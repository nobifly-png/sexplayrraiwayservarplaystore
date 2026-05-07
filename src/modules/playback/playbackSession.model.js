const mongoose = require('mongoose');
const { PLAYBACK_SESSION_STATUS } = require('../../common/enums');

const playbackSessionSchema = new mongoose.Schema({
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  linkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Link',
    required: true
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  fingerprint: {
    type: String
  },
  country: {
    type: String
  },
  deviceType: {
    type: String
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  lastEventAt: {
    type: Date,
    default: Date.now
  },
  watchTimeSeconds: {
    type: Number,
    default: 0
  },
  lastPositionSeconds: {
    type: Number,
    default: 0
  },
  manualPlayStarted: {
    type: Boolean,
    default: false
  },
  completedMinimumWatch: {
    type: Boolean,
    default: false
  },
  isValidView: {
    type: Boolean
  },
  rejectionReason: {
    type: String
  },
  fraudScore: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: Object.values(PLAYBACK_SESSION_STATUS),
    default: PLAYBACK_SESSION_STATUS.STARTED
  }
}, {
  timestamps: true
});

playbackSessionSchema.index({ videoId: 1 });
playbackSessionSchema.index({ linkId: 1 });
playbackSessionSchema.index({ creatorId: 1 });
playbackSessionSchema.index({ ipAddress: 1, videoId: 1, startedAt: 1 }); // fraud IP check
playbackSessionSchema.index({ status: 1 });

module.exports = mongoose.model('PlaybackSession', playbackSessionSchema);
