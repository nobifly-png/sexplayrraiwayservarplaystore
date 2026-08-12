const express = require('express');
const authController = require('./auth.controller');
const validate = require('../../middlewares/validate.middleware');
const authenticate = require('../../middlewares/auth.middleware');
const { authLimiter } = require('../../middlewares/rateLimit.middleware');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} = require('./auth.validation');

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);
router.post('/logout', authLimiter, validate(logoutSchema), authController.logout);
router.post('/logout-all', authLimiter, authenticate, authController.logoutAll);
router.get('/me', authenticate, authController.me);
router.post(
  '/change-password',
  authLimiter,
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

// Google OAuth routes
router.get('/google', authLimiter, authController.googleLogin);
router.get('/google/callback', authLimiter, authController.googleCallback);

module.exports = router;
