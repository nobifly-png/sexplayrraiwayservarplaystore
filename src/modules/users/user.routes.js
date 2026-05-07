const express = require('express');
const userController = require('./user.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');
const { USER_ROLES } = require('../../common/enums');
const { updateProfileSchema } = require('./user.validation');

const router = express.Router();

router.patch(
  '/me',
  authenticate,
  authorize(USER_ROLES.CREATOR_ADMIN),
  validate(updateProfileSchema),
  userController.updateProfile
);

module.exports = router;
