require('dotenv').config();
const mongoose = require('mongoose');

console.log('\n=== ClipNova Backend Setup Verification ===\n');

const maskMongoUri = (uri) => {
  if (!uri) return '';
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
};

// Check environment variables
console.log('1. Checking Environment Variables...');
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'SUPER_ADMIN_PASSWORD'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.log('   ❌ Missing required environment variables:');
  missingVars.forEach(varName => console.log(`      - ${varName}`));
} else {
  console.log('   ✅ All required environment variables are set');
}

// Check MongoDB connection
console.log('\n2. Testing MongoDB Connection...');
console.log(`   Connecting to: ${maskMongoUri(process.env.MONGODB_URI)}`);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('   ✅ MongoDB connection successful');
    
    // Check collections
    return mongoose.connection.db.listCollections().toArray();
  })
  .then(collections => {
    console.log(`   ✅ Database accessible (${collections.length} collections found)`);
    
    // Check R2 configuration
    console.log('\n3. Checking Cloudflare R2 Configuration...');
    const r2Vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
    const missingR2 = r2Vars.filter(varName => {
      const value = process.env[varName];
      return !value || value.includes('placeholder') || value.includes('your-');
    });
    
    if (missingR2.length > 0) {
      console.log('   ⚠️  R2 not fully configured (upload endpoints will fail):');
      missingR2.forEach(varName => console.log(`      - ${varName}`));
      console.log('   Note: App will start, but upload endpoints will return a configuration error');
    } else {
      console.log('   ✅ R2 configuration looks complete');
    }

    console.log('\n4. Checking Telegram Configuration...');
    const telegramEnabled = process.env.TELEGRAM_BOT_ENABLED === 'true';
    const hasTelegramToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
    if (telegramEnabled && !hasTelegramToken) {
      console.log('   ⚠️  TELEGRAM_BOT_ENABLED=true but TELEGRAM_BOT_TOKEN is missing');
      console.log('   App remains stable, Telegram integration stays disabled');
    } else if (!telegramEnabled) {
      console.log('   ✅ Telegram integration disabled (non-blocking)');
    } else {
      console.log('   ✅ Telegram configuration looks complete');
    }
    
    console.log('\n5. Summary:');
    if (missingVars.length === 0) {
      console.log('   ✅ Backend is ready to start!');
      console.log('\n   Run: npm run dev');
      console.log('   Then seed: npm run seed:admin && npm run seed:settings');
    } else {
      console.log('   ❌ Please configure missing environment variables in .env file');
    }
    
    console.log('\n===========================================\n');
    process.exit(0);
  })
  .catch(error => {
    console.log('   ❌ MongoDB connection failed');
    console.log(`   Error: ${error.message}`);
    console.log('\n   Please ensure:');
    console.log('   - MongoDB is running (local or cloud)');
    console.log('   - MONGODB_URI in .env is correct');
    console.log('   - Network access is allowed (for cloud MongoDB)');
    console.log('\n===========================================\n');
    process.exit(1);
  });
