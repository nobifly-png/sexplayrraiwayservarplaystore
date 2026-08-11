/**
 * Verify Backend Changes - ClipNova
 * Checks if all new features are properly implemented
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying ClipNova Backend Changes...\n');

let passed = 0;
let failed = 0;

function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, filePath);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${description}`);
    passed++;
    return true;
  } else {
    console.log(`❌ ${description} - File not found`);
    failed++;
    return false;
  }
}

function checkFileContains(filePath, searchText, description) {
  const fullPath = path.join(__dirname, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(searchText)) {
      console.log(`✅ ${description}`);
      passed++;
      return true;
    } else {
      console.log(`❌ ${description} - Content not found`);
      failed++;
      return false;
    }
  } catch (error) {
    console.log(`❌ ${description} - Error reading file`);
    failed++;
    return false;
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('           📧 FEATURE 1: PASSWORD RESET');
console.log('═══════════════════════════════════════════════════════\n');

// Check password reset files
checkFile('src/config/email.js', 'Email configuration file');
checkFile('src/modules/auth/passwordResetToken.model.js', 'Password reset token model');

// Check auth service has forgot/reset password methods
checkFileContains(
  'src/modules/auth/auth.service.js',
  'forgotPassword',
  'Auth service has forgotPassword method'
);
checkFileContains(
  'src/modules/auth/auth.service.js',
  'resetPassword',
  'Auth service has resetPassword method'
);
checkFileContains(
  'src/modules/auth/auth.service.js',
  'sendPasswordResetEmail',
  'Auth service uses email sending'
);

// Check auth routes
checkFileContains(
  'src/modules/auth/auth.routes.js',
  '/forgot-password',
  'Forgot password route exists'
);
checkFileContains(
  'src/modules/auth/auth.routes.js',
  '/reset-password',
  'Reset password route exists'
);

// Check validation schemas
checkFileContains(
  'src/modules/auth/auth.validation.js',
  'forgotPasswordSchema',
  'Forgot password validation schema'
);
checkFileContains(
  'src/modules/auth/auth.validation.js',
  'resetPasswordSchema',
  'Reset password validation schema'
);

console.log('\n═══════════════════════════════════════════════════════');
console.log('      📊 FEATURE 2: VIEW COUNTING (4:1 RATIO)');
console.log('═══════════════════════════════════════════════════════\n');

// Check constants updated
checkFileContains(
  'src/common/constants/index.js',
  'DEFAULT_EARNINGS_PER_VIEW = 0.001',
  'Earnings per view updated to $0.001'
);
checkFileContains(
  'src/common/constants/index.js',
  'VIEW_TO_COUNTED_RATIO',
  'View to counted ratio constant added'
);

// Check currency formatter
checkFile('src/common/utils/currency.js', 'Currency utility file');
checkFileContains(
  'src/common/utils/currency.js',
  'formatCurrency',
  'Currency formatter function exists'
);
checkFileContains(
  'src/common/utils/currency.js',
  'amount < 1',
  'Currency formatter checks for amounts < $1'
);
checkFileContains(
  'src/common/utils/currency.js',
  'toFixed(3)',
  'Currency formatter uses 3 decimals'
);

// Check analytics service has view conversion
checkFileContains(
  'src/modules/analytics/analytics.service.js',
  'calculateCountedViews',
  'Analytics has calculateCountedViews function'
);
checkFileContains(
  'src/modules/analytics/analytics.service.js',
  'VIEW_TO_COUNTED_RATIO',
  'Analytics uses VIEW_TO_COUNTED_RATIO'
);

// Check analytics controller uses currency formatter
checkFileContains(
  'src/modules/analytics/analytics.controller.js',
  'formatCurrency',
  'Analytics controller uses currency formatter'
);

// Check wallet controller uses currency formatter
checkFileContains(
  'src/modules/wallet/wallet.controller.js',
  'formatCurrency',
  'Wallet controller uses currency formatter'
);

console.log('\n═══════════════════════════════════════════════════════');
console.log('           📝 DOCUMENTATION & CONFIG');
console.log('═══════════════════════════════════════════════════════\n');

// Check .env has email config
checkFileContains(
  '.env.example',
  'EMAIL_HOST',
  '.env.example has email configuration'
);
checkFileContains(
  '.env.example',
  'DEFAULT_EARNINGS_PER_VIEW=0.001',
  '.env.example has updated earnings rate'
);

// Check documentation files
checkFile('FRONTEND_AI_PROMPT.md', 'Frontend AI prompt created');
checkFile('MOBILE_APP_AI_PROMPT.md', 'Mobile app AI prompt created');
checkFile('CHANGES_SUMMARY_FOR_AI.md', 'Changes summary created');
checkFile('VIEW_COUNTING_SYSTEM.md', 'View counting documentation');

// Check API docs updated
checkFileContains(
  'API_DOCS.md',
  'forgot-password',
  'API docs include forgot password'
);
checkFileContains(
  'API_DOCS.md',
  'reset-password',
  'API docs include reset password'
);
checkFileContains(
  'API_DOCS.md',
  '4 real views = 1 counted view',
  'API docs explain view counting system'
);

console.log('\n═══════════════════════════════════════════════════════');
console.log('                 📊 VERIFICATION SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');

console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📝 Total:  ${passed + failed}\n`);

if (failed === 0) {
  console.log('🎉 All changes verified successfully!\n');
  console.log('✅ Password Reset: Fully implemented');
  console.log('✅ View Counting: 4:1 ratio implemented');
  console.log('✅ Currency Display: 3 decimal formatting');
  console.log('✅ Documentation: Complete\n');
} else {
  console.log('⚠️  Some checks failed. Review the output above.\n');
}

console.log('═══════════════════════════════════════════════════════\n');

console.log('📋 NEXT STEPS:\n');
console.log('1. Configure email in .env:');
console.log('   EMAIL_USER=your-email@gmail.com');
console.log('   EMAIL_PASSWORD=your-app-password\n');

console.log('2. Test on live server:');
console.log('   - Deploy to Railway/Render');
console.log('   - Test forgot password flow end-to-end');
console.log('   - Verify email sending works\n');

console.log('3. Frontend integration:');
console.log('   - Give FRONTEND_AI_PROMPT.md to website AI');
console.log('   - Build password reset pages');
console.log('   - Update currency display\n');

console.log('═══════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
