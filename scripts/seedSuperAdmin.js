require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../src/modules/users/user.model');
const { USER_ROLES } = require('../src/common/enums');
const logger = require('../src/config/logger');
const { mongoUri, superAdmin } = require('../src/config/env');
const {
  assertSuperAdminEmailAllowedForSeed,
  isSuperAdminEmailAllowed,
  normalizeEmail
} = require('../src/config/superAdminPolicy');

const seedSuperAdmin = async () => {
  try {
    if (!mongoUri) {
      throw new Error('MONGODB_URI is required');
    }
    if (!superAdmin.password || superAdmin.password.length < 8) {
      throw new Error('SUPER_ADMIN_PASSWORD must be set and at least 8 characters long');
    }

    assertSuperAdminEmailAllowedForSeed(superAdmin.email);

    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    const targetEmail = normalizeEmail(superAdmin.email);

    const unauthorizedSuperAdmins = await User.find({ role: USER_ROLES.SUPER_ADMIN });
    for (const u of unauthorizedSuperAdmins) {
      if (!isSuperAdminEmailAllowed(u.email)) {
        logger.warn({ email: u.email }, 'Downgrading SUPER_ADMIN not in allowlist');
        u.role = USER_ROLES.CREATOR_ADMIN;
        await u.save();
      }
    }

    const existing = await User.findOne({ email: targetEmail });

    if (existing) {
      existing.role = USER_ROLES.SUPER_ADMIN;
      existing.name = superAdmin.name;
      existing.passwordHash = await bcrypt.hash(superAdmin.password, 12);
      await existing.save();
      logger.info({ email: existing.email }, 'Super admin updated (password and role refreshed)');
      return;
    }

    const passwordHash = await bcrypt.hash(superAdmin.password, 12);

    const admin = await User.create({
      name: superAdmin.name,
      email: targetEmail,
      passwordHash,
      role: USER_ROLES.SUPER_ADMIN
    });

    logger.info('Super admin created successfully');
    logger.info({ email: admin.email }, 'Account email');
    logger.info('IMPORTANT: Change the password after first login.');
  } catch (error) {
    logger.error('Error seeding super admin:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

seedSuperAdmin();
