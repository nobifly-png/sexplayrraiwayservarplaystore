const logger = require('../config/logger');

/**
 * Email Service for Zexgram
 * Supports both Resend (recommended) and Gmail API
 */

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'resend'; // 'resend' or 'gmail'

/**
 * Send password reset email using Resend API
 * @param {string} toEmail - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
async function sendResetEmailViaResend(toEmail, resetToken) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px;">
          🎬 Zexgram
        </div>
        <p style="color: #6b7280; margin: 0; font-size: 14px;">Video Monetization Platform</p>
      </div>
      
      <!-- Content -->
      <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 20px; font-weight: 600;">Reset Your Password</h1>
      <p style="margin-bottom: 15px; color: #4b5563; font-size: 16px; line-height: 1.6;">Hello,</p>
      <p style="margin-bottom: 15px; color: #4b5563; font-size: 16px; line-height: 1.6;">We received a request to reset the password for your Zexgram account. Click the button below to create a new password:</p>
      
      <!-- Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
      </div>
      
      <!-- Warning -->
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 6px; font-size: 14px;">
        <strong>⏰ Important:</strong> This link will expire in <strong>1 hour</strong> and can only be used once.
      </div>
      
      <!-- Link Box -->
      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; word-break: break-all; font-size: 13px; color: #6b7280; margin-top: 20px; border: 1px solid #e5e7eb;">
        <p style="margin: 0 0 10px 0; color: #374151; font-weight: 600; font-size: 13px;">Or copy and paste this link:</p>
        <div style="word-break: break-all;">${resetLink}</div>
      </div>
      
      <!-- Security Note -->
      <div style="font-size: 14px; color: #6b7280; margin-top: 25px; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
        <strong style="display: block; margin-bottom: 10px;">🔒 Security Note:</strong>
        <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
          <li>If you didn't request this password reset, you can safely ignore this email.</li>
          <li>Your password won't change until you click the link above and set a new one.</li>
          <li>Never share this link with anyone.</li>
          <li>This link will automatically expire after 1 hour for your security.</li>
        </ul>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; color: #9ca3af; font-size: 13px; margin-top: 30px; padding-top: 30px;">
      <p style="margin: 5px 0;"><strong>Zexgram</strong> - Earn Money from Your Videos</p>
      <p style="margin: 5px 0;">© ${new Date().getFullYear()} Zexgram. All rights reserved.</p>
      <p style="font-size: 12px; color: #9ca3af; margin: 5px 0;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `;

  const emailText = `
Reset Your Password - Zexgram

Hello,

We received a request to reset the password for your Zexgram account.

Click the link below to reset your password:
${resetLink}

This link will expire in 1 hour and can only be used once.

If you didn't request this password reset, you can safely ignore this email.

© ${new Date().getFullYear()} Zexgram. All rights reserved.
This is an automated email. Please do not reply.
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Zexgram <onboarding@resend.dev>',
        to: [toEmail],
        subject: 'Reset Your Password - Zexgram',
        html: emailHtml,
        text: emailText
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `Resend API error: ${response.status}`);
    }

    logger.info({ email: toEmail, messageId: data.id }, '✅ Password reset email sent via Resend');
    return { success: true, messageId: data.id };
    
  } catch (error) {
    logger.error({ error: error.message, email: toEmail }, '❌ Resend email sending failed');
    throw new Error('Failed to send reset email via Resend: ' + error.message);
  }
}

/**
 * Send password reset email using Gmail API (fallback)
 * @param {string} toEmail - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
async function sendResetEmailViaGmail(toEmail, resetToken) {
  const { google } = require('googleapis');
  const MailComposer = require('nodemailer/lib/mail-composer');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

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
    throw new Error('Failed to send reset email via Gmail: ' + error.message);
  }
}

/**
 * Main function to send password reset email
 * Automatically chooses provider based on EMAIL_PROVIDER env variable
 */
async function sendResetEmail(toEmail, resetToken) {
  if (EMAIL_PROVIDER === 'resend') {
    return await sendResetEmailViaResend(toEmail, resetToken);
  } else if (EMAIL_PROVIDER === 'gmail') {
    return await sendResetEmailViaGmail(toEmail, resetToken);
  } else {
    throw new Error(`Unknown email provider: ${EMAIL_PROVIDER}`);
  }
}

module.exports = { sendResetEmail };
