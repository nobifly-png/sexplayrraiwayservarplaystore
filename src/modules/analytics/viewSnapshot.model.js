const mongoose = require('mongoose');

/**
 * ViewSnapshot stores a pre-computed analytics snapshot for each creator.
 * The snapshot is refreshed every 12 hours by the snapshot cron job.
 * All dashboard and wallet display queries read from this model — NOT from
 * live ViewLedger — so the numbers only update twice a day.
 */
const viewSnapshotSchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // one snapshot doc per creator, overwritten each refresh
  },

  // Counted views (4:1 ratio already applied — ready to display)
  totalViews: { type: Number, default: 0 },
  validViews: { type: Number, default: 0 },
  rejectedViews: { type: Number, default: 0 },

  // Display earnings (4:1 ratio already applied — ready to display)
  totalEarnings: { type: Number, default: 0 },

  // Raw values kept for internal reference / debugging
  rawValidViews: { type: Number, default: 0 },
  rawTotalViews: { type: Number, default: 0 },

  // When this snapshot was last computed
  snapshotAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

viewSnapshotSchema.index({ creatorId: 1 });

module.exports = mongoose.model('ViewSnapshot', viewSnapshotSchema);
