const { verifyAccessToken } = require('../config/jwt');
const { UnauthorizedError, ForbiddenError } = require('../common/errors');
const User = require('../modules/users/user.model');
const { USER_STATUS, USER_ROLES } = require('../common/enums');
const { isSuperAdminEmailAllowed } = require('../config/superAdminPolicy');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication required');
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new UnauthorizedError('Account is blocked');
    }

    if (user.role === USER_ROLES.SUPER_ADMIN && !isSuperAdminEmailAllowed(user.email)) {
      throw new ForbiddenError('Access denied');
    }

    req.user = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Invalid or expired token'));
    } else {
      next(error);
    }
  }
};

module.exports = authenticate;
