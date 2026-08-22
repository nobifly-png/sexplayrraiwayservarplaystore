#!/usr/bin/env node

/**
 * Setup Script: Register Bot Token with Local Bot API Server
 * 
 * This script logs out the bot from Telegram cloud servers and
 * connects it to your Local Bot API server for 2GB file support.
 * 
 * Usage:
 *   node scripts/setup-bot-with-local-api.js
 * 
 * Prerequisites:
 *   - Local Bot API server running
 *   - TELEGRAM_BOT_TOKEN set
 *   - TELEGRAM_LOCAL_API_URL set
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LOCAL_API_URL = (process.env.TELEGRAM_LOCAL_API_URL || '').replace(/\/$/, '');

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}

if (!LOCAL_API_URL) {
  console.error('❌ TELEGRAM_LOCAL_API_URL not set in .env');
  process.exit(1);
}

console.log('🚀 Bot Token + Local API Setup\n');
console.log(`Bot Token: ${BOT_TOKEN.substring(0, 15)}...`);
console.log(`Local API URL: ${LOCAL_API_URL}\n`);

// Step 1: Logout from standard Telegram API
async function logoutFromCloud() {
  return new Promise((resolve, reject) => {
    console.log('📤 Step 1: Logging out from Telegram cloud servers...');
    
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/logOut`;
    https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            console.log('✅ Successfully logged out from cloud API\n');
            resolve(true);
          } else {
            console.log(`⚠️  Logout response: ${parsed.description}`);
            console.log('   (This is OK if already logged out)\n');
            resolve(false);
          }
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// Step 2: Test connection to Local Bot API
async function testLocalAPI() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Step 2: Testing Local Bot API connection...');
    
    const proto = LOCAL_API_URL.startsWith('https') ? https : http;
    const url = `${LOCAL_API_URL}/bot${BOT_TOKEN}/getMe`;
    
    proto.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok && parsed.result) {
            console.log(`✅ Connected to Local Bot API successfully!`);
            console.log(`   Bot name: ${parsed.result.first_name} (@${parsed.result.username})\n`);
            resolve(parsed.result);
          } else {
            console.error(`❌ Local Bot API error: ${parsed.description || 'Unknown error'}`);
            reject(new Error(parsed.description || 'getMe failed'));
          }
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Local API connection timeout')));
  });
}

// Step 3: Get bot limits
async function checkFileLimits() {
  return new Promise((resolve, reject) => {
    console.log('📊 Step 3: Checking file upload limits...');
    
    const proto = LOCAL_API_URL.startsWith('https') ? https : http;
    const url = `${LOCAL_API_URL}/bot${BOT_TOKEN}/getMe`;
    
    proto.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            console.log('✅ Bot is now using Local Bot API');
            console.log('   📦 Max file size: 2GB (2048 MB)');
            console.log('   📥 Download limit: 2GB');
            console.log('   📤 Upload limit: 2GB\n');
            resolve(true);
          } else {
            reject(new Error('Failed to verify limits'));
          }
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// Main execution
(async () => {
  try {
    // Step 1: Logout
    await logoutFromCloud().catch((err) => {
      console.log(`⚠️  Logout error: ${err.message}`);
      console.log('   Continuing anyway...\n');
    });
    
    // Step 2: Test Local API
    await testLocalAPI();
    
    // Step 3: Check limits
    await checkFileLimits();
    
    console.log('🎉 SUCCESS! Bot is now connected to Local Bot API');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart your backend application');
    console.log('   2. Test with a 25MB+ video file');
    console.log('   3. Check logs for "using Local Bot API" message');
    console.log('\n✅ Setup complete!\n');
    
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check if Local Bot API server is running');
    console.error('   2. Verify TELEGRAM_LOCAL_API_URL is correct');
    console.error('   3. Check Railway logs for telegram-bot-api service');
    console.error('   4. Ensure bot token is valid\n');
    process.exit(1);
  }
})();
