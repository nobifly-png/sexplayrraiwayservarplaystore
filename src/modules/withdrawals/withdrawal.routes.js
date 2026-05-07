const express = require('express');
const withdrawalController = require('./withdrawal.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const validateParams = require('../../middlewares/validateParams.middleware');
const { withdrawalLimiter, adminLimiter } = require('../../middlewares/rateLimit.middleware');
const { USER_ROLES } = require('../../common/enums');
const {
  createWithdrawalSchema,
  reviewWithdrawalSchema,
  withdrawalAdminListQuerySchema
} = require('./withdrawal.validation');
const { withdrawalIdParam } = require('../../common/validation/routeParams');

const router = express.Router();

router.post(
  '/',
  withdrawalLimiter,
  authenticate,
  authorize(USER_ROLES.CREATOR_ADMIN),
  validate(createWithdrawalSchema),
  withdrawalController.createWithdrawal
);

router.get(
  '/',
  authenticate,
  authorize(USER_ROLES.CREATOR_ADMIN),
  withdrawalController.getWithdrawals
);

router.get(
  '/admin/all',
  adminLimiter,
  authenticate,
  authorize(USER_ROLES.SUPER_ADMIN),
  validateQuery(withdrawalAdminListQuerySchema),
  withdrawalController.getAllWithdrawals
);

router.patch(
  '/:id/approve',
  adminLimiter,
  authenticate,
  authorize(USER_ROLES.SUPER_ADMIN),
  validateParams(withdrawalIdParam),
  validate(reviewWithdrawalSchema),
  withdrawalController.approveWithdrawal
);

router.patch(
  '/:id/reject',
  adminLimiter,
  authenticate,
  authorize(USER_ROLES.SUPER_ADMIN),
  validateParams(withdrawalIdParam),
  validate(reviewWithdrawalSchema),
  withdrawalController.rejectWithdrawal
);

router.patch(
  '/:id/paid',
  adminLimiter,
  authenticate,
  authorize(USER_ROLES.SUPER_ADMIN),
  validateParams(withdrawalIdParam),
  withdrawalController.markAsPaid
);

module.exports = router;
