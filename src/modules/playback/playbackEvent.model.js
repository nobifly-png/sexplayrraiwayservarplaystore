const mongoose = require('mongoose');
const { PLAYBACK_EVENT_TYPE } = require('../../common/enums');

const playbackEventSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlaybackSession',
    required: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  eventType: {
    type: String,
    enum: Object.values(PLAYBACK_EVENT_TYPE),
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  positionSeconds: {
    type: Number
  },
  meta: {
    type: Object
  }
}, {
  timestamps: true
});

playbackEventSchema.index({ sessionId: 1, timestamp: 1 });
playbackEventSchema.index({ videoId: 1 });

module.exports = mongoose.model('PlaybackEvent', playbackEventSchema);
