const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../users/user.model');
const RefreshSession = require('./refreshSession.model');
const PasswordResetToken = require('./passwordResetToken.model');
const Wallet = require('../wallet/wallet.model');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../config/jwt');
const { hashToken } = require('../../common/utils');
const { ConflictError, UnauthorizedError, BadRequestError, NotFoundError } = require('../../common/errors');
const { USER_ROLES, USER_STATUS, AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const { isSuperAdminEmailAllowed } = require('../../config/superAdminPolicy');
const auditService = require('../audit/audit.service');
const logger = require('../../config/logger');
const { sendPasswordResetEmail } = require('../../config/email');
const googleOAuthService = require('../../services/googleOAuth.service');

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

  async forgotPassword(email) {
    const user = await User.findOne({ email });
    
    // Security: Don't reveal if email exists or not
    if (!user) {
      logger.info({ email }, 'Forgot password requested for non-existent email');
      return {
        success: true,
        message: 'If the email exists, a password reset link has been sent to your email'
      };
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new BadRequestError('Account is blocked');
    }

    // Invalidate any existing unused tokens for this user
    await PasswordResetToken.updateMany(
      { userId: user._id, isUsed: false },
      { isUsed: true, usedAt: new Date() }
    );

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordResetToken.create({
      userId: user._id,
      token: resetToken,
      expiresAt
    });

    // Send password reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken);
      logger.info({ userId: user._id, email: user.email }, 'Password reset email sent successfully');
    } catch (error) {
      logger.error({ err: error, userId: user._id, email: user.email }, 'Failed to send password reset email');
      
      // In development, return token if email fails
      if (process.env.NODE_ENV === 'development') {
        return {
          success: true,
          message: 'Email sending failed. Here is your reset token for testing',
          resetToken,
          resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
          error: 'Email service unavailable'
        };
      }
      
      // In production: token is already saved in DB
      // Return success so user knows request was received
      // Admin can manually share token from DB if needed
      logger.warn({ userId: user._id }, 'Email failed but token saved - returning success to avoid timeout');
      return {
        success: true,
        message: 'If the email exists, a password reset link has been sent to your email'
      };
    }

    return {
      success: true,
      message: 'If the email exists, a password reset link has been sent to your email'
    };
  }

  async resetPassword(token, newPassword) {
    const resetToken = await PasswordResetToken.findOne({
      token,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!resetToken) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const user = await User.findById(resetToken.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new BadRequestError('Account is blocked');
    }

    // Update password
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    // Mark token as used
    resetToken.isUsed = true;
    resetToken.usedAt = new Date();
    await resetToken.save();

    // Logout all sessions for security
    await RefreshSession.updateMany(
      { userId: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );

    logger.info({ userId: user._id }, 'Password reset successful');

    auditService.logAction({
      userId: user._id,
      action: AUDIT_ACTION.PASSWORD_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user._id
    });

    return {
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    };
  }
}

module.exports = new AuthService();

  /**
   * Handle Google OAuth login
   * @param {string} code - Authorization code from Google
   * @param {string} ipAddress - User IP address
   * @param {string} userAgent - User agent string
   * @returns {Promise<{user: Object, accessToken: string, refreshToken: string}>}
   */
  async loginWithGoogle(code, ipAddress, userAgent) {
    // Exchange code for user info
    const googleUser = await googleOAuthService.authenticateUser(code);

    if (!googleUser.verified_email) {
      throw new BadRequestError('Google account email is not verified');
    }

    // Find or create user
    let user = await User.findOne({ email: googleUser.email });

    if (user) {
      // Existing user - link Google account if not already linked
      if (!user.googleId) {
        user.googleId = googleUser.id;
        user.profilePicture = googleUser.picture;
        await user.save();
        logger.info({ userId: user._id, email: user.email }, 'Linked Google account to existing user');
      }

      // Check if account is blocked
      if (user.status === USER_STATUS.BLOCKED) {
        throw new UnauthorizedError('Account is blocked');
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      // New user - create account
      user = await User.create({
        name: googleUser.name,
        email: googleUser.email,
        googleId: googleUser.id,
        profilePicture: googleUser.picture,
        role: USER_ROLES.CREATOR_ADMIN,
        status: USER_STATUS.ACTIVE
        // No password needed for Google users
      });

      // Create wallet for new user
      await Wallet.create({ creatorId: user._id });

      logger.info({ userId: user._id, email: user.email }, 'Created new user via Google OAuth');
    }

    // Generate JWT tokens
    const tokens = await this.createSession(user, ipAddress, userAgent);

    // Log audit
    auditService.logAction({
      userId: user._id,
      action: AUDIT_ACTION.USER_LOGIN,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user._id,
      ip: ipAddress,
      userAgent,
      metadata: { loginMethod: 'google' }
    });

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      },
      ...tokens
    };
  }
