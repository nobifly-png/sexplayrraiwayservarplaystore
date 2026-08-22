#!/usr/bin/env node

/**
 * Telegram Bot Configuration Diagnostic Tool
 * Checks Local Bot API server and identifies HTTP 404 issues
 */

require('dotenv').config(); // Load .env file

const https = require('https');
const http = require('http');

const LOCAL_API_URL = process.env.TELEGRAM_LOCAL_API_URL || 'https://telegram-bot-api-production-4b45.up.railway.app';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8998834969:AAEhXlNLlNXOAe1oYIhEmqI4yRO4StsicDA';
const USE_LOCAL = process.env.TELEGRAM_USE_LOCAL_API === 'true';

console.log('═══════════════════════════════════════════════════════');
console.log('🔍 Telegram Bot Diagnostic Tool');
console.log('═══════════════════════════════════════════════════════\n');

console.log('📋 Configuration:');
console.log(`   USE_LOCAL_API: ${USE_LOCAL}`);
console.log(`   LOCAL_API_URL: ${LOCAL_API_URL}`);
console.log(`   BOT_TOKEN: ${BOT_TOKEN.substring(0, 20)}...`);
console.log('');

const tests = [];

// Test 1: Check Local Bot API server is accessible
tests.push(async () => {
  console.log('Test 1: Checking Local Bot API server accessibility...');
  
  return new Promise((resolve) => {
    const url = `${LOCAL_API_URL}/bot${BOT_TOKEN}/getMe`;
    
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            console.log('   ✅ Local Bot API is accessible');
            console.log(`   ℹ️  Bot: @${parsed.result.username}`);
            resolve({ success: true });
          } else {
            console.log('   ❌ Local Bot API returned error:', parsed.description);
            resolve({ success: false, error: parsed.description });
          }
        } catch {
          console.log('   ❌ Failed to parse response');
          resolve({ success: false, error: 'Parse error' });
        }
      });
    }).on('error', (err) => {
      console.log('   ❌ Connection failed:', err.message);
      resolve({ success: false, error: err.message });
    }).on('timeout', () => {
      console.log('   ❌ Request timed out');
      resolve({ success: false, error: 'Timeout' });
    });
  });
});

// Test 2: Check standard Telegram API as fallback
tests.push(async () => {
  console.log('\nTest 2: Checking standard Telegram API (fallback)...');
  
  return new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
    
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            console.log('   ✅ Standard API is working (fallback available)');
            console.log('   ℹ️  Files > 20MB will fail if Local API is down');
            resolve({ success: true });
          } else {
            console.log('   ❌ Standard API error:', parsed.description);
            resolve({ success: false, error: parsed.description });
          }
        } catch {
          console.log('   ❌ Failed to parse response');
          resolve({ success: false, error: 'Parse error' });
        }
      });
    }).on('error', (err) => {
      console.log('   ❌ Connection failed:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
});

// Test 3: Check file download capability
tests.push(async () => {
  console.log('\nTest 3: Testing file download flow...');
  console.log('   ℹ️  This requires a test file_id (optional)');
  
  const testFileId = process.argv[2];
  
  if (!testFileId) {
    console.log('   ⏭️  Skipped - no file_id provided');
    console.log('   💡 Usage: node diagnose_telegram_bot.js <file_id>');
    return { success: true, skipped: true };
  }
  
  return new Promise((resolve) => {
    const apiBase = USE_LOCAL ? LOCAL_API_URL : 'https://api.telegram.org';
    const url = `${apiBase}/bot${BOT_TOKEN}/getFile?file_id=${testFileId}`;
    
    console.log(`   📡 Using: ${USE_LOCAL ? 'Local Bot API' : 'Standard API'}`);
    
    https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            console.log('   ❌ getFile failed:', parsed.description);
            return resolve({ success: false, error: parsed.description });
          }
          
          const downloadUrl = `${apiBase}/file/bot${BOT_TOKEN}/${parsed.result.file_path}`;
          console.log('   ✅ getFile successful');
          console.log(`   📥 Download URL: ${downloadUrl.substring(0, 80)}...`);
          
          // Test download URL
          const proto = downloadUrl.startsWith('https') ? https : http;
          proto.get(downloadUrl, { timeout: 10000 }, (downloadRes) => {
            if (downloadRes.statusCode === 200) {
              console.log('   ✅ File download URL is working!');
              downloadRes.resume(); // Consume stream
              resolve({ success: true });
            } else if (downloadRes.statusCode === 404) {
              console.log('   ❌ HTTP 404 - File not found!');
              console.log('   💡 Possible causes:');
              console.log('      - Local Bot API not running with --local flag');
              console.log('      - File expired from cache');
              console.log('      - File was never downloaded by Local Bot API');
              downloadRes.resume();
              resolve({ success: false, error: 'HTTP 404' });
            } else {
              console.log(`   ⚠️  HTTP ${downloadRes.statusCode}`);
              downloadRes.resume();
              resolve({ success: false, error: `HTTP ${downloadRes.statusCode}` });
            }
          }).on('error', (err) => {
            console.log('   ❌ Download failed:', err.message);
            resolve({ success: false, error: err.message });
          });
          
        } catch {
          console.log('   ❌ Failed to parse getFile response');
          resolve({ success: false, error: 'Parse error' });
        }
      });
    }).on('error', (err) => {
      console.log('   ❌ getFile request failed:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
});

// Run all tests
(async () => {
  const results = [];
  
  for (const test of tests) {
    const result = await test();
    results.push(result);
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 Summary');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => r.success === false).length;
  const skipped = results.filter(r => r.skipped).length;
  
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log('');
  
  if (failed > 0) {
    console.log('🔧 Recommended Actions:');
    console.log('');
    console.log('   1. Check Railway logs for Local Bot API server');
    console.log('   2. Verify server is running with --local flag');
    console.log('   3. Ensure TELEGRAM_API_ID and TELEGRAM_API_HASH are set');
    console.log('   4. Try redeploying Local Bot API service');
    console.log('   5. Consider disabling Local API (files will be limited to 20MB)');
    console.log('');
    console.log('📖 See RAILWAY_ENV_TELEGRAM_FIX.txt for detailed guide');
  } else if (passed === tests.length - skipped) {
    console.log('✅ All checks passed! Bot should be working correctly.');
    console.log('');
    console.log('💡 If you still see HTTP 404 errors:');
    console.log('   - Check application logs for detailed error messages');
    console.log('   - Test with a small video first (<20MB)');
    console.log('   - Then test with larger video (>20MB)');
  }
  
  console.log('');
})();
