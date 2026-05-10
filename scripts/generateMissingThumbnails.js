/**
 * scripts/generateMissingThumbnails.js
 * Safe to run multiple times — skips videos that already have thumbnailUrl.
 * FFmpeg extraction only works if video is locally accessible.
 * On Render free tier: logs skip, does not crash.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB connected');

  const Video = require('../src/modules/videos/video.model');
  const { tryAutoGenerateThumbnail, uploadThumbnailBuffer, extractFrameWithFfmpeg } = require('../src/modules/uploads/thumbnail.service');
  const { r2Client, isR2Configured } = require('../src/config/r2');

  const videos = await Video.find({
    status: 'READY',
    isDeleted: false,
    thumbnailUrl: { $in: [null, undefined, ''] }
  });

  console.log(`Found ${videos.length} videos without thumbnails`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const video of videos) {
    try {
      if (!video.storageKey) {
        console.log(`  SKIP ${video._id} — no storageKey`);
        skipped++;
        continue;
      }

      if (!isR2Configured() || !r2Client) {
        console.log(`  SKIP ${video._id} — R2 not configured`);
        skipped++;
        continue;
      }

      // Try FFmpeg extraction (will silently fail if not available)
      const imgBuffer = await extractFrameWithFfmpeg(null);
      if (!imgBuffer) {
        console.log(`  SKIP ${video._id} — FFmpeg not available`);
        skipped++;
        continue;
      }

      const { thumbnailKey, thumbnailUrl } = await uploadThumbnailBuffer(
        imgBuffer,
        video.creatorId.toString(),
        video._id.toString()
      );

      video.thumbnailUrl = thumbnailUrl;
      video.thumbnailKey = thumbnailKey;
      video.thumbnailSource = 'AUTO';
      await video.save();

      console.log(`  OK ${video._id} — ${thumbnailUrl}`);
      updated++;
    } catch (err) {
      console.error(`  FAIL ${video._id} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
