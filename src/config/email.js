const { sendResetEmail } = require('../services/emailService');
const logger = require('./logger');

/**
 * Email configuration for ClipNova
 * Uses Gmail API with OAuth2 for password reset emails
 */

/**
 * Send password reset email using Gmail API
 * @param {string} email - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const result = await sendResetEmail(email, resetToken);
    logger.info({ email, messageId: result.messageId }, 'Password reset email sent successfully via Gmail API');
    return { success: true, messageId: result.messageId };
  } catch (error) {
    logger.error({ error: error.message, email }, 'Failed to send password reset email via Gmail API');
    throw error;
  }
};

module.exports = {
  sendPasswordResetEmail
};
