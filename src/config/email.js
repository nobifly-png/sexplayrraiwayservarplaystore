const { Resend } = require('resend');
const logger = require('./logger');

// Initialize Resend client
let resendClient = null;

const initializeResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    logger.warn('RESEND_API_KEY not configured. Email functionality will be disabled.');
    return null;
  }

  try {
    resendClient = new Resend(apiKey);
    logger.info('Resend email client initialized successfully');
    return resendClient;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Resend client');
    return null;
  }
};

// Get Resend client instance
const getResendClient = () => {
  if (!resendClient) {
    resendClient = initializeResendClient();
  }
  return resendClient;
};

// Send email function using Resend
const sendEmail = async ({ to, subject, html, text }) => {
  const client = getResendClient();
  
  if (!client) {
    throw new Error('Email service is not configured');
  }

  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const fromName = process.env.EMAIL_FROM_NAME || 'ClipNova';

  try {
    const data = await client.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
    });

    logger.info({ to, subject, messageId: data.id }, 'Email sent successfully via Resend');
    return data;
  } catch (error) {
    logger.error({ err: error, to, subject }, 'Failed to send email via Resend');
    throw error;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background-color: #f9f9f9;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #4F46E5;
          margin-bottom: 10px;
        }
        .content {
          background-color: white;
          padding: 25px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        h1 {
          color: #1f2937;
          font-size: 24px;
          margin-bottom: 20px;
        }
        p {
          margin-bottom: 15px;
          color: #4b5563;
        }
        .button {
          display: inline-block;
          padding: 14px 30px;
          background-color: #4F46E5;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-weight: bold;
          text-align: center;
          margin: 20px 0;
        }
        .button:hover {
          background-color: #4338CA;
        }
        .link-box {
          background-color: #f3f4f6;
          padding: 15px;
          border-radius: 6px;
          word-break: break-all;
          font-size: 12px;
          color: #6b7280;
          margin-top: 20px;
        }
        .warning {
          background-color: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin-top: 20px;
          border-radius: 4px;
        }
        .footer {
          text-align: center;
          color: #9ca3af;
          font-size: 12px;
          margin-top: 30px;
        }
        .security-note {
          font-size: 13px;
          color: #6b7280;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🎬 ClipNova</div>
          <p style="color: #6b7280; margin: 0;">Video Monetization Platform</p>
        </div>
        
        <div class="content">
          <h1>Reset Your Password</h1>
          <p>Hello,</p>
          <p>We received a request to reset the password for your ClipNova account associated with this email address.</p>
          <p>Click the button below to reset your password:</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <div class="warning">
            <strong>⏰ Important:</strong> This link will expire in <strong>1 hour</strong> and can only be used once.
          </div>
          
          <div class="link-box">
            <p style="margin: 0 0 10px 0; color: #374151; font-weight: bold;">Or copy and paste this link:</p>
            ${resetUrl}
          </div>
          
          <div class="security-note">
            <strong>🔒 Security Note:</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>If you didn't request this password reset, you can safely ignore this email.</li>
              <li>Your password won't change until you access the link and set a new one.</li>
              <li>Never share this link with anyone.</li>
              <li>This link will automatically expire after 1 hour for your security.</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} ClipNova. All rights reserved.</p>
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Reset Your Password

Hello,

We received a request to reset the password for your ClipNova account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour and can only be used once.

If you didn't request this password reset, you can safely ignore this email.

© ${new Date().getFullYear()} ClipNova. All rights reserved.
  `;

  await sendEmail({
    to: email,
    subject: 'Reset Your Password - ClipNova',
    html,
    text
  });
};

// Verify email configuration
const verifyEmailConfig = async () => {
  const client = getResendClient();
  
  if (!client) {
    return { configured: false, message: 'Resend API key not configured' };
  }

  try {
    // Resend doesn't have a verify method, so we just check if client exists
    return { configured: true, message: 'Resend email service is ready' };
  } catch (error) {
    logger.error({ err: error }, 'Resend configuration verification failed');
    return { configured: false, message: error.message };
  }
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  verifyEmailConfig,
  initializeResendClient
};
