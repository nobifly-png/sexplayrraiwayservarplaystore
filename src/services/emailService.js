const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const logger = require('../config/logger');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

/**
 * Send password reset email using Gmail API with OAuth2
 * @param {string} toEmail - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
async function sendResetEmail(toEmail, resetToken) {
  try {
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = accessTokenResponse.token;

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `Zexgram <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: 'Reset Your Password - Zexgram',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password for your Zexgram account.</p>
          <p>Click the button below to reset your password:</p>
          <a href="${resetLink}" 
             style="display: inline-block; background: #3b82f6; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 8px;
                    margin: 16px 0; font-weight: bold;">
            Reset Password
          </a>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666; background: #f3f4f6; padding: 10px; border-radius: 4px;">${resetLink}</p>
          <p>This link expires in <strong>1 hour</strong>.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `Reset your password: ${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, you can safely ignore this email.`
    };

    const mail = new MailComposer(mailOptions);
    const message = await mail.compile().build();
    
    const rawMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage }
    });

    logger.info({ email: toEmail, messageId: result.data.id }, '✅ Password reset email sent via Gmail API');
    return { success: true, messageId: result.data.id };
    
  } catch (error) {
    logger.error({ error: error.message, email: toEmail }, '❌ Gmail API email sending failed');
    throw new Error('Failed to send reset email: ' + error.message);
  }
}

module.exports = { sendResetEmail };
