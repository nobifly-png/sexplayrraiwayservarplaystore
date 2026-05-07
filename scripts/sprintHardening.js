/**
 * Backend sprint hardening checks (requires running API + MONGODB_URI in .env).
 * Run: npm run verify:sprint   (with: npm run dev in another terminal)
 *
 * Labels:
 * - [R2 LIVE]: needs real R2 credentials and successful upload to fully verify HeadObject path.
 */
require('dotenv').config();

const baseUrl = process.env.RUNTIME_BASE_URL || 'http://localhost:5000/api';

const results = [];
const log = (name, pass, detail) => {
  results.push({ name, pass, detail });
};

const req = async (method, path, { body, token, query } = {}) => {
  let url = `${baseUrl}${path}`;
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
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
  let r = await req('GET', '/health');
  log('health returns 200', r.status === 200, r.status);
  const r2Configured = r.data?.data?.integrations?.r2Configured === true;

  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@clipnova.local';
  const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345';

  r = await req('POST', '/auth/login', {
    body: { email: adminEmail, password: adminPass }
  });
  if (r.status !== 200) {
    log('admin login (skip rest)', false, r.status);
    console.error(JSON.stringify({ summary: 'FAIL', results }, null, 2));
    process.exit(1);
  }
  const adminToken = r.data.data.accessToken;

  const now = Date.now();
  const email = `sprint.${now}@example.com`;
  const password = 'SprintTest@12345';

  r = await req('POST', '/auth/register', {
    body: { name: `Sprint ${now}`, email, password }
  });
  if (r.status !== 201) {
    log('register', false, r.status);
    console.error(JSON.stringify({ summary: 'FAIL', results }, null, 2));
    process.exit(1);
  }
  const access = r.data.data.accessToken;

  r = await req('GET', '/videos', { token: access, query: { page: '0' } });
  log('videos list rejects page<1 (422)', r.status === 422, r.status);

  r = await req('GET', '/videos', { token: access, query: { limit: '999' } });
  log('videos list rejects limit above max (422)', r.status === 422, r.status);

  r = await req('GET', '/wallet/transactions', { token: access, query: { limit: '999' } });
  log('wallet transactions reject limit above max (422)', r.status === 422, r.status);

  await req('PATCH', '/settings', {
    token: adminToken,
    body: { settings: [{ key: 'minimumWithdrawalAmount', value: 1 }] }
  });

  r = await req('POST', '/withdrawals', {
    token: access,
    body: { amount: 10, paymentMethod: { type: 'UPI' } }
  });
  log('withdrawal rejects incomplete UPI paymentMethod (422)', r.status === 422, r.status);

  r = await req('POST', '/withdrawals', {
    token: access,
    body: { amount: 10, paymentMethod: { type: 'UPI', upiId: 'x@upi', extra: 'x' } }
  });
  log('withdrawal rejects unknown paymentMethod keys (422)', r.status === 422, r.status);

  r = await req('POST', '/videos', {
    token: access,
    body: {
      title: 'Direct',
      description: 'd',
      type: 'DIRECT_UPLOAD'
    }
  });
  const directVideoId = r.data?.data?._id;
  log('create DIRECT_UPLOAD video', r.status === 201, r.status);

  if (directVideoId) {
    r = await req('POST', '/uploads/initiate', {
      token: access,
      body: {
        videoId: directVideoId,
        fileName: 'clip.mp4',
        fileSize: 10 * 1024 * 1024,
        mimeType: 'video/mp4'
      }
    });
    if (!r2Configured) {
      log('uploads initiate fails gracefully without R2', r.status === 400, r.status);
    } else {
      log(
        'uploads initiate with R2 configured [R2 LIVE: confirm HeadObject in manual test]',
        r.status === 200 || r.status === 201,
        r.status
      );
    }
  }

  const failed = results.filter((x) => !x.pass);
  console.log(JSON.stringify({ summary: failed.length ? 'FAIL' : 'OK', results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
