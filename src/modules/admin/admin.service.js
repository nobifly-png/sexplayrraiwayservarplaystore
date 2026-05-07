const User = require('../users/user.model');
const { NotFoundError } = require('../../common/errors');
const { USER_STATUS, AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const auditService = require('../audit/audit.service');

class AdminService {
  async getAllUsers(filters = {}) {
    const query = {};
    const { role, status, page, limit } = filters;
    if (role) query.role = role;
    if (status) query.status = status;
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(query).select('-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query)
    ]);
    return { users, total, page, limit };
  }

  async getUserById(userId) {
    const user = await User.findById(userId).select('-passwordHash');
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async blockUser(userId, adminId, auditCtx = {}) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    user.status = USER_STATUS.BLOCKED;
    await user.save();

    auditService.logAction({
      userId: adminId,
      action: AUDIT_ACTION.ADMIN_BLOCK_USER,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user._id,
      metadata: { targetEmail: user.email },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return user;
  }

  async unblockUser(userId, adminId, auditCtx = {}) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    user.status = USER_STATUS.ACTIVE;
    await user.save();

    auditService.logAction({
      userId: adminId,
      action: AUDIT_ACTION.ADMIN_UNBLOCK_USER,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user._id,
      metadata: { targetEmail: user.email },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return user;
  }
}

module.exports = new AdminService();
