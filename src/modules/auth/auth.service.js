const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../users/user.model');
const RefreshSession = require('./refreshSession.model');
const Wallet = require('../wallet/wallet.model');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../config/jwt');
const { hashToken } = require('../../common/utils');
const { ConflictError, UnauthorizedError, BadRequestError } = require('../../common/errors');
const { USER_ROLES, USER_STATUS, AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const { isSuperAdminEmailAllowed } = require('../../config/superAdminPolicy');
const auditService = require('../audit/audit.service');

class AuthService {
  async register(data, ipAddress, userAgent) {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    let user;
    try {
      user = await User.create({
        name: data.name,
        email: data.email,
        passwordHash,
        role: USER_ROLES.CREATOR_ADMIN
      });
    } catch (err) {
      if (err.code === 11000) throw new ConflictError('Email already registered');
      throw err;
    }

    await Wallet.create({ creatorId: user._id });

    const tokens = await this.createSession(user, ipAddress, userAgent);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      ...tokens
    };
  }

  async login(email, password, ipAddress, userAgent) {
    const user = await User.findOne({ email });
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new UnauthorizedError('Account is blocked');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.role === USER_ROLES.SUPER_ADMIN && !isSuperAdminEmailAllowed(user.email)) {
      throw new UnauthorizedError('Invalid credentials');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await this.createSession(user, ipAddress, userAgent);

    auditService.logAction({
      userId: user._id,
      action: AUDIT_ACTION.USER_LOGIN,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user._id,
      ip: ipAddress,
      userAgent
    });

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      ...tokens
    };
  }

  async createSession(user, ipAddress, userAgent) {
    const accessToken = generateAccessToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken({
      userId: user._id,
      sessionNonce: crypto.randomUUID()
    });
    
    const tokenHash = hashToken(refreshToken);
    const decoded = jwt.decode(refreshToken);
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshSession.create({
      userId: user._id,
      tokenHash,
      ipAddress,
      userAgent,
      expiresAt
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken, ipAddress, userAgent) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const tokenHash = hashToken(refreshToken);
    const session = await RefreshSession.findOne({ tokenHash, userId: decoded.userId });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.status === USER_STATUS.BLOCKED) {
      throw new UnauthorizedError('User not found or blocked');
    }

    if (user.role === USER_ROLES.SUPER_ADMIN && !isSuperAdminEmailAllowed(user.email)) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    session.revokedAt = new Date();
    await session.save();

    const tokens = await this.createSession(user, ipAddress, userAgent);

    return tokens;
  }

  async logout(refreshToken, userId, ipAddress, userAgent) {
    const tokenHash = hashToken(refreshToken);
    await RefreshSession.updateOne({ tokenHash }, { revokedAt: new Date() });
    if (userId) {
      auditService.logAction({
        userId,
        action: AUDIT_ACTION.USER_LOGOUT,
        entityType: AUDIT_ENTITY_TYPE.USER,
        entityId: userId,
        ip: ipAddress,
        userAgent
      });
    }
  }

  async logoutAll(userId, ipAddress, userAgent) {
    await RefreshSession.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date() }
    );
    auditService.logAction({
      userId,
      action: AUDIT_ACTION.USER_LOGOUT_ALL,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      ip: ipAddress,
      userAgent
    });
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    await this.logoutAll(userId);

    auditService.logAction({
      userId,
      action: AUDIT_ACTION.PASSWORD_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId
    });
  }
}

module.exports = new AuthService();
