const mongoose = require('mongoose');
const { AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: Object.values(AUDIT_ACTION),
    required: true
  },
  entityType: {
    type: String,
    enum: Object.values(AUDIT_ENTITY_TYPE),
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId
  },
  metadata: {
    type: Object,
    default: {}
  },
  ip: { type: String },
  userAgent: { type: String }
}, { timestamps: true });

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
