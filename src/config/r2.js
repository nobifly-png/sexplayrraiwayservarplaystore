const { S3Client } = require('@aws-sdk/client-s3');
const { r2 } = require('./env');
const logger = require('./logger');

const isPlaceholder = (value) => {
  if (!value) return true;
  const normalized = String(value).toLowerCase();
  return (
    normalized.includes('replace-with') ||
    normalized.includes('placeholder') ||
    normalized.includes('your-')
  );
};

// Check if R2 is properly configured
const isR2Configured = () => {
  return (
    !isPlaceholder(r2.accountId) &&
    !isPlaceholder(r2.accessKeyId) &&
    !isPlaceholder(r2.secretAccessKey) &&
    !isPlaceholder(r2.bucketName)
  );
};

let r2Client = null;

// Only initialize R2 client if properly configured
if (isR2Configured()) {
  try {
    r2Client = new S3Client({
      region: r2.region,
      endpoint: r2.endpoint || `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey
      }
    });
    logger.info('Cloudflare R2 client initialized successfully');
  } catch (error) {
    logger.warn('Failed to initialize R2 client:', error.message);
  }
} else {
  logger.warn('Cloudflare R2 not configured - upload endpoints will not work');
}

module.exports = {
  r2Client,
  bucketName: r2.bucketName,
  publicBaseUrl: r2.publicBaseUrl,
  isR2Configured
};
