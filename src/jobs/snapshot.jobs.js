const cron = require('node-cron');
const snapshotService = require('../modules/analytics/snapshot.service');
const logger = require('../config/logger');

/**
 * Refresh all creator snapshots every 12 hours.
 * Runs at 00:00 and 12:00 server time every day.
 * Dashboard and wallet display reads come from these snapshots,
 * so views + earnings only update twice a day.
 */
const refreshViewSnapshots = async () => {
  logger.info('Snapshot job: triggered — refreshing all creator view snapshots');
  try {
    const result = await snapshotService.refreshAllSnapshots();
    logger.info(result, 'Snapshot job: finished');
  } catch (err) {
    logger.error({ err }, 'Snapshot job: unexpected error during full refresh');
  }
};

let snapshotTask = null;

const startSnapshotJob = () => {
  // Cron: "0 0,12 * * *" = at minute 0 of hours 0 and 12, every day
  snapshotTask = cron.schedule('0 0,12 * * *', refreshViewSnapshots, {
    timezone: 'UTC'
  });
  logger.info('Snapshot job: scheduled (every 12 hours at 00:00 and 12:00 UTC)');

  // Run once immediately on startup so the dashboard has data right away
  // (avoids showing all-zeros until the first cron fires)
  refreshViewSnapshots().catch((err) =>
    logger.error({ err }, 'Snapshot job: initial startup refresh failed (non-fatal)')
  );
};

const stopSnapshotJob = () => {
  if (snapshotTask) {
    snapshotTask.stop();
    snapshotTask = null;
    logger.info('Snapshot job: stopped');
  }
};

module.exports = { startSnapshotJob, stopSnapshotJob, refreshViewSnapshots };
