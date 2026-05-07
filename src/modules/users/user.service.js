const User = require('./user.model');
const { ConflictError, NotFoundError } = require('../../common/errors');
const { AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const auditService = require('../audit/audit.service');

class UserService {
  async updateProfile(userId, data, auditCtx = {}) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    if (data.email && data.email !== user.email) {
      const existing = await User.findOne({ email: data.email });
      if (existing) throw new ConflictError('Email already in use');
      user.email = data.email;
    }

    if (data.name) user.name = data.name;

    await user.save();

    auditService.logAction({
      userId,
      action: AUDIT_ACTION.PROFILE_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      metadata: { fields: Object.keys(data) },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };
  }
}

module.exports = new UserService();
