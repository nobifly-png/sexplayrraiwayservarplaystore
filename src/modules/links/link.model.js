const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
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
  shortCode: {
    type: String,
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes (shortCode already indexed via unique: true)
linkSchema.index({ videoId: 1 });
linkSchema.index({ creatorId: 1 });

module.exports = mongoose.model('Link', linkSchema);
