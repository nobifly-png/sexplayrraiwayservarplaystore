/**
 * Migration: Update existing R2 video objects with correct metadata headers.
 * Sets Content-Disposition: inline and Cache-Control on all stored videos.
 *
 * Run: node scripts/migrate-r2-metadata.js
 */

require('dotenv').config();

const { S3Client, CopyObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.R2_BUCKET_NAME;

const updateObjectMetadata = async (storageKey, mimeType) => {
  const contentType = mimeType || 'video/mp4';
  const isVideo = contentType.startsWith('video/');

  // R2/S3 metadata update = copy object onto itself with new metadata
  await r2Client.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${storageKey}`,
    Key: storageKey,
    ContentType: contentType,
    ContentDisposition: 'inline',
    CacheControl: isVideo ? 'public, max-age=31536000' : 'public, max-age=86400',
    MetadataDirective: 'REPLACE'
  }));
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB connected');

  // Inline require after DB connect
  const Video = require('../src/modules/videos/video.model');

  const videos = await Video.find({
    storageKey: { $exists: true, $ne: null },
    isDeleted: false
  }).select('storageKey mimeType title').lean();

  console.log(`Found ${videos.length} videos to migrate`);

  let success = 0, failed = 0;

  for (const video of videos) {
    try {
      await updateObjectMetadata(video.storageKey, video.mimeType);
      console.log(`✅ ${video.storageKey}`);
      success++;
    } catch (err) {
      console.error(`❌ ${video.storageKey} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
