const mongoose = require('mongoose');
const { USER_ROLES, USER_STATUS } = require('../../common/enums');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.CREATOR_ADMIN
  },
  status: {
    type: String,
    enum: Object.values(USER_STATUS),
    default: USER_STATUS.ACTIVE
  },
  lastLoginAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes (email already indexed via unique: true)
userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
