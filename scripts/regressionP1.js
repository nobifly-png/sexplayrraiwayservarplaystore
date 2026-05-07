/**
 * P1 regression checks (requires running API + valid MONGODB_URI in .env).
 * Run: npm run test:p1   (with server: npm run dev in another terminal)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Wallet = require('../src/modules/wallet/wallet.model');

const baseUrl = process.env.RUNTIME_BASE_URL || 'http://localhost:5000/api';

const results = [];
const log = (name, pass, detail) => {
  results.push({ name, pass, detail });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const req = async (method, path, { body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = {};
  }
  return { status: res.status, data };
};

(async () => {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@clipnova.local';
  const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345';

  let r = await req('POST', '/auth/login', {
    body: { email: adminEmail, password: adminPass }
  });
  if (r.status !== 200) {
    console.error('Admin login failed — seed admin and check SUPER_ADMIN_* in .env');
    process.exit(1);
  }
  const adminToken = r.data.data.accessToken;

  r = await req('PATCH', '/settings', {
    token: adminToken,
    body: { settings: [{ key: 'earningsPerValidView', value: -1 }] }
  });
  log('settings reject negative earnings', r.status === 400, r.status);

  const now = Date.now();
  const email = `p1.${now}@example.com`;
  const password = 'P1Test@12345';

  r = await req('POST', '/auth/register', {
    body: { name: `P1 ${now}`, email, password }
  });
  if (r.status !== 201) {
    log('register', false, r);
    console.error(JSON.stringify({ summary: 'FAIL', results }, null, 2));
    process.exit(1);
  }
  const access = r.data.data.accessToken;

  r = await req('GET', '/videos/notanid', { token: access });
  log('invalid ObjectId param returns 422', r.status === 422, r.status);

  r = await req('POST', '/videos', {
    token: access,
    body: {
      title: 'P1 ext',
      description: 'x',
      type: 'EXTERNAL_REF',
      externalUrl: 'https://example.com/v'
    }
  });
  const videoId = r.data.data._id;
  r = await req('POST', '/links', { token: access, body: { videoId } });
  const linkId = r.data.data._id;

  r = await req('POST', '/playback/session', { body: { linkId, fingerprint: `fp-${now}` } });
  const sessionId = r.data.data.sessionId;
  await req('POST', '/playback/event', {
    body: { sessionId, eventType: 'PLAY', positionSeconds: 0 }
  });
  await sleep(8500);
  await req('POST', '/playback/event', {
    body: { sessionId, eventType: 'PROGRESS', positionSeconds: 10 }
  });

  r = await req('POST', '/playback/finalize', { body: { sessionId } });
  log('finalize first', r.status === 200, r.status);

  r = await req('POST', '/playback/finalize', { body: { sessionId } });
  log('finalize idempotent second call', r.status === 200, r.status);

  const fin = await Promise.all([
    req('POST', '/playback/finalize', { body: { sessionId } }),
    req('POST', '/playback/finalize', { body: { sessionId } }),
    req('POST', '/playback/finalize', { body: { sessionId } })
  ]);
  log(
    'concurrent finalize all 200',
    fin.every((x) => x.status === 200),
    fin.map((x) => x.status)
  );

  const creatorLogin = await req('POST', '/auth/login', {
    body: { email, password }
  });
  const creatorToken = creatorLogin.data.data.accessToken;
  const creatorUserId = creatorLogin.data.data.user.id;

  await mongoose.connect(process.env.MONGODB_URI);
  await Wallet.findOneAndUpdate(
    { creatorId: creatorUserId },
    { $setOnInsert: { creatorId: creatorUserId }, $inc: { totalEarnings: 500, availableBalance: 500 } },
    { upsert: true, new: true }
  );
  await mongoose.connection.close();

  await req('PATCH', '/settings', {
    token: adminToken,
    body: { settings: [{ key: 'minimumWithdrawalAmount', value: 1 }] }
  });

  r = await req('POST', '/withdrawals', {
    token: creatorToken,
    body: { amount: 10, paymentMethod: { type: 'UPI', upiId: 'x@upi' } }
  });
  const wid = r.data.data._id;
  log('create withdrawal', r.status === 201, r.status);

  r = await req('POST', '/withdrawals', {
    token: creatorToken,
    body: { amount: 10, paymentMethod: { type: 'UPI', upiId: 'x@upi' } }
  });
  log('duplicate pending withdrawal rejected', r.status === 400, r.status);

  r = await req('PATCH', `/withdrawals/${wid}/approve`, {
    token: adminToken,
    body: { adminNote: 'ok' }
  });
  log('approve withdrawal', r.status === 200, r.status);

  r = await req('PATCH', `/withdrawals/${wid}/approve`, {
    token: adminToken,
    body: { adminNote: 'again' }
  });
  log('re-approve rejected', r.status === 400, r.status);

  r = await req('PATCH', `/withdrawals/${wid}/paid`, {
    token: adminToken
  });
  log('mark paid', r.status === 200, r.status);

  r = await req('PATCH', `/withdrawals/${wid}/paid`, {
    token: adminToken
  });
  log('re-paid rejected', r.status === 400, r.status);

  const failed = results.filter((x) => !x.pass);
  console.log(JSON.stringify({ summary: failed.length ? 'FAIL' : 'OK', results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
