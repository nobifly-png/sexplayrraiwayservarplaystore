require('dotenv').config();
const mongoose = require('mongoose');
const SystemSetting = require('../src/modules/settings/systemSetting.model');
const logger = require('../src/config/logger');
const { mongoUri } = require('../src/config/env');
const {
  DEFAULT_EARNINGS_PER_VIEW,
  MIN_WITHDRAWAL_AMOUNT,
  MAX_VIEWS_PER_IP_PER_HOUR,
  MIN_WATCH_SECONDS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES
} = require('../src/common/constants');

const defaultSettings = [
  {
    key: 'earningsPerValidView',
    value: DEFAULT_EARNINGS_PER_VIEW,
    description: 'Amount earned per valid view in INR'
  },
  {
    key: 'minimumWithdrawalAmount',
    value: MIN_WITHDRAWAL_AMOUNT,
    description: 'Minimum withdrawal amount in INR'
  },
  {
    key: 'maxViewsPerIpPerHour',
    value: MAX_VIEWS_PER_IP_PER_HOUR,
    description: 'Maximum views allowed per IP per hour'
  },
  {
    key: 'minimumWatchSeconds',
    value: MIN_WATCH_SECONDS,
    description: 'Minimum watch time required for valid view'
  },
  {
    key: 'allowedVideoMimeTypes',
    value: ALLOWED_VIDEO_MIME_TYPES,
    description: 'Allowed video MIME types for upload'
  },
  {
    key: 'maxUploadSizeBytes',
    value: MAX_UPLOAD_SIZE_BYTES,
    description: 'Maximum upload size in bytes'
  },
  {
    key: 'maintenanceMode',
    value: false,
    description: 'Enable/disable maintenance mode'
  },
  {
    key: 'telegramBotEnabled',
    value: false,
    description: 'Enable/disable Telegram bot integration'
  }
];

const seedSettings = async () => {
  try {
    if (!mongoUri) {
      throw new Error('MONGODB_URI is required');
    }

    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    for (const setting of defaultSettings) {
      await SystemSetting.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true, new: true }
      );
      logger.info(`Setting '${setting.key}' upserted`);
    }

    logger.info('All system settings seeded successfully');
  } catch (error) {
    logger.error('Error seeding settings:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

seedSettings();
