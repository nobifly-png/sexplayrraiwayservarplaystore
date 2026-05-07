const userService = require('./user.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { getClientIp } = require('../../common/utils/ip');

class UserController {
  async updateProfile(req, res, next) {
    try {
      const user = await userService.updateProfile(
        req.user.userId,
        req.body,
        { ip: getClientIp(req), userAgent: req.headers['user-agent'] }
      );
      successResponse(res, user, 'Profile updated');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
