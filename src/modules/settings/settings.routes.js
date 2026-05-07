const express = require('express');
const settingsController = require('./settings.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');
const { adminLimiter } = require('../../middlewares/rateLimit.middleware');
const { USER_ROLES } = require('../../common/enums');
const { updateSettingsSchema } = require('./settings.validation');

const router = express.Router();

router.use(adminLimiter);
router.use(authenticate);
router.use(authorize(USER_ROLES.SUPER_ADMIN));

router.get('/', settingsController.getSettings);
router.patch('/', validate(updateSettingsSchema), settingsController.updateSettings);

module.exports = router;
