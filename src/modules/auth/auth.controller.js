const authService = require('./auth.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');
const User = require('../users/user.model');

class AuthController {
  async register(req, res, next) {
    try {
      const result = await authService.register(
        req.body,
        getClientIp(req),
        req.headers['user-agent']
      );
      successResponse(res, result, 'Registration successful', 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const result = await authService.login(
        req.body.email,
        req.body.password,
        getClientIp(req),
        req.headers['user-agent']
      );
      successResponse(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async refresh(req, res, next) {
    try {
      const tokens = await authService.refresh(
        req.body.refreshToken,
        getClientIp(req),
        req.headers['user-agent']
      );
      successResponse(res, tokens, 'Token refreshed');
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      await authService.logout(
        req.body.refreshToken,
        req.user?.userId,
        getClientIp(req),
        req.headers['user-agent']
      );
      successResponse(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(req, res, next) {
    try {
      await authService.logoutAll(
        req.user.userId,
        getClientIp(req),
        req.headers['user-agent']
      );
      successResponse(res, null, 'Logged out from all devices');
    } catch (error) {
      next(error);
    }
  }

  async me(req, res, next) {
    try {
      const user = await User.findById(req.user.userId).select('-passwordHash');
      successResponse(res, user, 'User retrieved');
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      await authService.changePassword(
        req.user.userId,
        req.body.currentPassword,
        req.body.newPassword
      );
      successResponse(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const result = await authService.forgotPassword(req.body.email);
      successResponse(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const result = await authService.resetPassword(
        req.body.token,
        req.body.newPassword
      );
      successResponse(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
