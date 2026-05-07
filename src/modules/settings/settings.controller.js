const settingsService = require('./settings.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');

class SettingsController {
  async getSettings(req, res, next) {
    try {
      const settings = await settingsService.getAllSettings();
      successResponse(res, settings, 'Settings retrieved');
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req, res, next) {
    try {
      const auditCtx = {
        userId: req.user.userId,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent']
      };
      const settings = await settingsService.updateMultipleSettings(req.body.settings, auditCtx);
      successResponse(res, settings, 'Settings updated');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SettingsController();
