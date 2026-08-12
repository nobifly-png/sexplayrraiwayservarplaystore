const axios = require('axios');
const logger = require('../config/logger');

/**
 * Google OAuth Service
 * Handles Google OAuth 2.0 authentication flow
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

class GoogleOAuthService {
  /**
   * Generate Google OAuth authorization URL
   * @returns {string} Authorization URL to redirect user
   */
  getAuthorizationUrl() {
    const backendUrl = process.env.BACKEND_URL || process.env.APP_URL;
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      redirect_uri: `${backendUrl}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'profile email',
      access_type: 'online',
      prompt: 'select_account'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from Google
   * @returns {Promise<{access_token: string, id_token: string}>}
   */
  async exchangeCodeForToken(code) {
    try {
      const backendUrl = process.env.BACKEND_URL || process.env.APP_URL;
      const response = await axios.post(GOOGLE_TOKEN_URL, {
        code,
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        redirect_uri: `${backendUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      }, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      logger.info('Successfully exchanged authorization code for access token');
      return response.data;
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Failed to exchange code for token');
      throw new Error('Failed to authenticate with Google');
    }
  }

  /**
   * Get user information from Google
   * @param {string} accessToken - Google access token
   * @returns {Promise<{id: string, email: string, name: string, picture: string}>}
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const userInfo = {
        id: response.data.id,
        email: response.data.email,
        name: response.data.name,
        picture: response.data.picture,
        verified_email: response.data.verified_email
      };

      logger.info({ email: userInfo.email }, 'Successfully fetched Google user info');
      return userInfo;
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Failed to fetch user info from Google');
      throw new Error('Failed to fetch user information from Google');
    }
  }

  /**
   * Complete OAuth flow - exchange code and get user info
   * @param {string} code - Authorization code from Google
   * @returns {Promise<{id: string, email: string, name: string, picture: string}>}
   */
  async authenticateUser(code) {
    const tokenData = await this.exchangeCodeForToken(code);
    const userInfo = await this.getUserInfo(tokenData.access_token);
    
    return userInfo;
  }
}

module.exports = new GoogleOAuthService();
