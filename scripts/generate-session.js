/**
 * ONE-TIME SCRIPT — Generate a GramJS bot StringSession.
 *
 * Run once locally:
 *   TELEGRAM_API_ID=xxx TELEGRAM_API_HASH=yyy TELEGRAM_BOT_TOKEN=zzz node scripts/generate-session.js
 *
 * Or on Windows PowerShell:
 *   $env:TELEGRAM_API_ID="xxx"; $env:TELEGRAM_API_HASH="yyy"; $env:TELEGRAM_BOT_TOKEN="zzz"; node scripts/generate-session.js
 *
 * Copy the printed StringSession and set it as GRAMJS_SESSION in Railway.
 * DO NOT commit this script's output anywhere.
 * DO NOT save the session to a file — print only.
 */

require('dotenv').config();

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!API_ID || !API_HASH || !BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_BOT_TOKEN must all be set.');
  process.exit(1);
}

(async () => {
  const session = new StringSession('');
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
    useWSS: false,
  });

  try {
    await client.start({
      botAuthToken: BOT_TOKEN,
    });

    const sessionString = client.session.save();

    console.log('\n========================================');
    console.log('GRAMJS_SESSION (copy this exact value):');
    console.log('========================================');
    console.log(sessionString);
    console.log('========================================\n');
    console.log('Add GRAMJS_SESSION=<above value> to your Railway environment variables.');
    console.log('Do NOT share or commit this value.');
  } catch (err) {
    console.error('Failed to generate session:', err.message);
    process.exit(1);
  } finally {
    await client.disconnect();
    process.exit(0);
  }
})();
