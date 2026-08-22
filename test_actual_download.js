require('dotenv').config();
const https = require('https');

/**
 * Test actual file download from Local Bot API
 * This simulates what happens when bot tries to download a video
 */

const LOCAL_API_URL = 'https://telegram-bot-api-production-4b45.up.railway.app';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8998834969:AAEhXlNLlNXOAe1oYIhEmqI4yRO4StsicDA';

console.log('🔍 Testing File Download from Local Bot API\n');
console.log('This will test if Local Bot API can serve files properly\n');

// Test 1: Check if /file/ endpoint is accessible
console.log('Test 1: Checking /file/ endpoint accessibility...');

const testFilePath = 'videos/file_0.mp4'; // Dummy path
const downloadUrl = `${LOCAL_API_URL}/file/bot${BOT_TOKEN}/${testFilePath}`;

console.log('Testing URL:', downloadUrl.substring(0, 100) + '...\n');

https.get(downloadUrl, { timeout: 10000 }, (res) => {
  console.log(`Response Status: ${res.statusCode}`);
  console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
  
  if (res.statusCode === 404) {
    console.log('\n❌ HTTP 404 - File Not Found');
    console.log('\n🔍 Diagnosis:');
    console.log('   This is expected if file doesn\'t exist, BUT...');
    console.log('   The problem is: Local Bot API server needs to DOWNLOAD files from Telegram first');
    console.log('   Before YOUR backend can download from Local Bot API\n');
    
    console.log('💡 Root Cause Analysis:');
    console.log('   1. User sends video to bot');
    console.log('   2. Bot gets file_id from Telegram');
    console.log('   3. Bot calls getFile on Local Bot API');
    console.log('   4. Local Bot API returns file_path');
    console.log('   5. Bot tries to download from: /file/bot.../file_path');
    console.log('   6. ❌ BUT Local Bot API hasn\'t downloaded the file yet!\n');
    
    console.log('🔧 Possible Solutions:');
    console.log('   A. Local Bot API server might not have --local flag properly set');
    console.log('   B. Local Bot API storage might be full');
    console.log('   C. Local Bot API doesn\'t have permission to download from Telegram');
    console.log('   D. File cache expired before backend tried to download\n');
    
  } else if (res.statusCode === 200) {
    console.log('\n✅ SUCCESS - File endpoint is working!');
  } else {
    console.log(`\n⚠️  Unexpected status: ${res.statusCode}`);
  }
  
  res.resume(); // Consume response
  
  console.log('\n' + '═'.repeat(60));
  console.log('Next Steps:');
  console.log('═'.repeat(60));
  console.log('1. Check Local Bot API server logs on Railway');
  console.log('2. Look for errors like:');
  console.log('   - "Cannot download file"');
  console.log('   - "Storage full"');
  console.log('   - "Permission denied"');
  console.log('3. Verify --local flag in start command');
  console.log('4. Check if TELEGRAM_API_ID and TELEGRAM_API_HASH are correct\n');
  
}).on('error', (err) => {
  console.log('❌ Connection Error:', err.message);
}).on('timeout', () => {
  console.log('❌ Request Timeout');
});
