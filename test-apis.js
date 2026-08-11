/**
 * API Testing Script - ClipNova
 * Tests all new features: Password Reset + View Counting
 */

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

console.log('🚀 Testing ClipNova APIs...\n');
console.log('Base URL:', BASE_URL, '\n');

// Test results tracker
let passed = 0;
let failed = 0;

// Helper function to make API calls
async function testAPI(name, method, endpoint, body = null, headers = {}) {
  try {
    console.log(`\n📝 Testing: ${name}`);
    console.log(`   ${method} ${endpoint}`);
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
      console.log('   Body:', JSON.stringify(body, null, 2));
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log('   Response:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('   ✅ PASSED');
      passed++;
      return { success: true, data, status: response.status };
    } else {
      console.log('   ❌ FAILED');
      failed++;
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    console.log('   ❌ ERROR:', error.message);
    failed++;
    return { success: false, error: error.message };
  }
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main test function
async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('           🧪 PART 1: PASSWORD RESET APIs');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test 1: Forgot Password - Valid Email
  await testAPI(
    'Forgot Password - Valid Email',
    'POST',
    '/api/auth/forgot-password',
    { email: 'nitinchouhan@gmail.com' }
  );
  
  await sleep(1000);

  // Test 2: Forgot Password - Invalid Email
  await testAPI(
    'Forgot Password - Invalid Email Format',
    'POST',
    '/api/auth/forgot-password',
    { email: 'invalid-email' }
  );
  
  await sleep(1000);

  // Test 3: Forgot Password - Non-existent Email (should still return success for security)
  await testAPI(
    'Forgot Password - Non-existent Email',
    'POST',
    '/api/auth/forgot-password',
    { email: 'nonexistent@example.com' }
  );
  
  await sleep(1000);

  // Test 4: Reset Password - Invalid Token
  await testAPI(
    'Reset Password - Invalid Token',
    'POST',
    '/api/auth/reset-password',
    { 
      token: 'invalid-token-123',
      newPassword: 'NewPassword123!'
    }
  );
  
  await sleep(1000);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('      🧪 PART 2: ANALYTICS APIs (View Counting)');
  console.log('═══════════════════════════════════════════════════════\n');

  // First need to login to get auth token
  console.log('🔐 Logging in to get auth token...\n');
  
  const loginResult = await testAPI(
    'Login',
    'POST',
    '/api/auth/login',
    {
      email: 'nitinchouhan@gmail.com',
      password: '##Nitin01'
    }
  );

  if (!loginResult.success) {
    console.log('\n❌ Cannot proceed with analytics tests - Login failed');
    console.log('   Make sure super admin is seeded with: npm run seed:superadmin');
    return;
  }

  const accessToken = loginResult.data.accessToken;
  
  await sleep(1000);

  // Test 5: Get Analytics Overview (should show counted views)
  await testAPI(
    'Analytics Overview - View Counting',
    'GET',
    '/api/analytics/overview',
    null,
    { 'Authorization': `Bearer ${accessToken}` }
  );
  
  await sleep(1000);

  // Test 6: Get Wallet (should show earnings with 3 decimals)
  await testAPI(
    'Wallet - Currency Display',
    'GET',
    '/api/wallet',
    null,
    { 'Authorization': `Bearer ${accessToken}` }
  );
  
  await sleep(1000);

  // Test 7: Get System Settings (should show new earnings rate)
  await testAPI(
    'System Settings - Check Earnings Per View',
    'GET',
    '/api/settings',
    null,
    { 'Authorization': `Bearer ${accessToken}` }
  );

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                    📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📝 Total:  ${passed + failed}\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed! APIs are working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.\n');
  }

  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('📋 IMPORTANT NOTES:\n');
  console.log('1. Password Reset:');
  console.log('   - Email sending may fail if EMAIL_USER/PASSWORD not configured');
  console.log('   - In development mode, reset token is returned in response');
  console.log('   - Check backend logs for email sending errors\n');
  
  console.log('2. View Counting:');
  console.log('   - All view counts are now COUNTED VIEWS (real views / 4)');
  console.log('   - Earnings rate is $0.001 per real view');
  console.log('   - Currency shows 3 decimals for amounts < $1\n');
  
  console.log('3. Manual Testing:');
  console.log('   - Test password reset flow end-to-end with real email');
  console.log('   - Check analytics dashboard for counted views');
  console.log('   - Verify wallet shows proper decimal formatting\n');
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
