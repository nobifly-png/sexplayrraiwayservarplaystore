const AuditLog = require('./auditLog.model');
const logger = require('../../config/logger');

class AuditService {
  /**
   * Fire-and-forget audit log. Never throws — audit must not break business logic.
   * @param {object} payload
   * @param {string} payload.userId
   * @param {string} payload.action  - AUDIT_ACTION value
   * @param {string} payload.entityType - AUDIT_ENTITY_TYPE value
   * @param {string} [payload.entityId]
   * @param {object} [payload.metadata]
   * @param {string} [payload.ip]
   * @param {string} [payload.userAgent]
   */
  logAction(payload) {
    AuditLog.create({
      userId: payload.userId,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId || undefined,
      metadata: payload.metadata || {},
      ip: payload.ip || undefined,
      userAgent: payload.userAgent || undefined
    }).catch((err) =>
      logger.error({ err, payload }, 'AuditService: failed to write audit log')
    );
  }

  async getLogs(filters = {}) {
    const query = {};
    const { userId, action, entityType, startDate, endDate, page = 1, limit = 50 } = filters;

    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(query)
    ]);

    return { logs, total, page, limit };
  }
}

module.exports = new AuditService();
