/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Wallet = require('../src/modules/wallet/wallet.model');
const baseUrl = process.env.RUNTIME_BASE_URL || 'http://localhost:5000/api';
const now = Date.now();

const state = {
  creator: {
    name: `Creator ${now}`,
    email: `creator.${now}@example.com`,
    password: 'Creator@12345',
    accessToken: null,
    refreshToken: null,
    id: null
  },
  admin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@clipnova.local',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345',
    accessToken: null
  },
  videoId: null,
  linkId: null,
  shortCode: null,
  validSessionId: null,
  rejectedSessionId: null,
  withdrawalId: null
};

const matrix = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const authHeader = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

const sanitizeBody = (body) => {
  if (!body) return body;
  if (body.password) return { ...body, password: '***' };
  return body;
};

const request = async ({ name, method, path, token, body, expectedStatus, note }) => {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...authHeader(token) };
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = { parseError: err.message };
    }

    const pass = response.status === expectedStatus;
    matrix.push({
      endpoint: `${method} ${path}`,
      request: {
        headers: token ? { Authorization: 'Bearer <token>' } : {},
        body: sanitizeBody(body)
      },
      expected: expectedStatus,
      actual: response.status,
      pass,
      note,
      responseMessage: data?.message || null,
      elapsedMs: Date.now() - startedAt
    });

    return { response, data, pass };
  } catch (error) {
    matrix.push({
      endpoint: `${method} ${path}`,
      request: {
        headers: token ? { Authorization: 'Bearer <token>' } : {},
        body: sanitizeBody(body)
      },
      expected: expectedStatus,
      actual: 'REQUEST_ERROR',
      pass: false,
      note,
      responseMessage: error.message,
      elapsedMs: Date.now() - startedAt
    });
    return { response: null, data: null, pass: false, error };
  }
};

const run = async () => {
  await sleep(300);

  // Auth flow: creator
  const register = await request({
    name: 'register creator',
    method: 'POST',
    path: '/auth/register',
    body: {
      name: state.creator.name,
      email: state.creator.email,
      password: state.creator.password
    },
    expectedStatus: 201,
    note: 'creator registration'
  });
  state.creator.accessToken = register.data?.data?.accessToken || null;
  state.creator.refreshToken = register.data?.data?.refreshToken || null;
  state.creator.id = register.data?.data?.user?.id || null;

  const login = await request({
    name: 'creator login',
    method: 'POST',
    path: '/auth/login',
    body: {
      email: state.creator.email,
      password: state.creator.password
    },
    expectedStatus: 200,
    note: 'creator login'
  });
  const loginAccess = login.data?.data?.accessToken;
  const loginRefresh = login.data?.data?.refreshToken;

  const refresh = await request({
    name: 'creator refresh',
    method: 'POST',
    path: '/auth/refresh',
    body: {
      refreshToken: loginRefresh
    },
    expectedStatus: 200,
    note: 'refresh token rotation'
  });
  const refreshedAccess = refresh.data?.data?.accessToken;
  const refreshedRefresh = refresh.data?.data?.refreshToken;

  await request({
    name: 'logout current session',
    method: 'POST',
    path: '/auth/logout',
    body: {
      refreshToken: refreshedRefresh
    },
    expectedStatus: 200,
    note: 'logout current refresh token'
  });

  await request({
    name: 'logout all sessions',
    method: 'POST',
    path: '/auth/logout-all',
    token: refreshedAccess,
    expectedStatus: 200,
    note: 'logout all refresh sessions'
  });

  await request({
    name: 'get current user',
    method: 'GET',
    path: '/auth/me',
    token: refreshedAccess,
    expectedStatus: 200,
    note: 'me endpoint after logout-all should still work with unexpired access token'
  });

  // Admin login for admin flow and settings updates
  const adminLogin = await request({
    name: 'admin login',
    method: 'POST',
    path: '/auth/login',
    body: {
      email: state.admin.email,
      password: state.admin.password
    },
    expectedStatus: 200,
    note: 'super admin login'
  });
  state.admin.accessToken = adminLogin.data?.data?.accessToken || null;

  // Video + link flow
  const createVideo = await request({
    method: 'POST',
    path: '/videos',
    token: refreshedAccess,
    body: {
      title: `External Video ${now}`,
      description: 'runtime verification external ref',
      type: 'EXTERNAL_REF',
      externalUrl: 'https://example.com/video'
    },
    expectedStatus: 201,
    note: 'create EXTERNAL_REF video'
  });
  state.videoId = createVideo.data?.data?._id || null;

  const createLink = await request({
    method: 'POST',
    path: '/links',
    token: refreshedAccess,
    body: { videoId: state.videoId },
    expectedStatus: 201,
    note: 'create short link for video'
  });
  state.linkId = createLink.data?.data?._id || null;
  state.shortCode = createLink.data?.data?.shortCode || null;

  await request({
    method: 'GET',
    path: '/videos',
    token: refreshedAccess,
    expectedStatus: 200,
    note: 'list creator videos'
  });

  await request({
    method: 'GET',
    path: `/videos/${state.videoId}`,
    token: refreshedAccess,
    expectedStatus: 200,
    note: 'fetch single video'
  });

  await request({
    method: 'PATCH',
    path: `/links/${state.linkId}/toggle`,
    token: refreshedAccess,
    expectedStatus: 200,
    note: 'deactivate link'
  });

  await request({
    method: 'PATCH',
    path: `/links/${state.linkId}/toggle`,
    token: refreshedAccess,
    expectedStatus: 200,
    note: 'reactivate link'
  });

  // Playback flow: valid
  const playbackSession = await request({
    method: 'POST',
    path: '/playback/session',
    body: {
      linkId: state.linkId,
      fingerprint: `fp-valid-${now}`
    },
    expectedStatus: 201,
    note: 'create playback session (valid path)'
  });
  state.validSessionId = playbackSession.data?.data?.sessionId || null;

  await request({
    method: 'POST',
    path: '/playback/event',
    body: {
      sessionId: state.validSessionId,
      eventType: 'PLAY',
      positionSeconds: 0
    },
    expectedStatus: 200,
    note: 'play event'
  });

  await sleep(8000);

  await request({
    method: 'POST',
    path: '/playback/event',
    body: {
      sessionId: state.validSessionId,
      eventType: 'PROGRESS',
      positionSeconds: 10
    },
    expectedStatus: 200,
    note: 'progress event above minimum watch'
  });

  await request({
    method: 'POST',
    path: '/playback/finalize',
    body: {
      sessionId: state.validSessionId
    },
    expectedStatus: 200,
    note: 'finalize valid view session'
  });

  // Playback flow: rejected
  const rejectedSession = await request({
    method: 'POST',
    path: '/playback/session',
    body: {
      linkId: state.linkId,
      fingerprint: `fp-rejected-${now}`
    },
    expectedStatus: 201,
    note: 'create playback session (rejected path)'
  });
  state.rejectedSessionId = rejectedSession.data?.data?.sessionId || null;

  await request({
    method: 'POST',
    path: '/playback/finalize',
    body: {
      sessionId: state.rejectedSessionId
    },
    expectedStatus: 200,
    note: 'finalize rejected session without manual play'
  });

  // Wallet / withdrawal flow
  await request({
    method: 'GET',
    path: '/wallet',
    token: refreshedAccess,
    expectedStatus: 200,
    note: 'wallet read after playback'
  });

  await request({
    method: 'POST',
    path: '/withdrawals',
    token: refreshedAccess,
    body: {
      amount: 1,
      paymentMethod: { type: 'upi', upiId: 'creator@upi' }
    },
    expectedStatus: 400,
    note: 'minimum withdrawal rule enforcement (default min expected)'
  });

  await request({
    method: 'PATCH',
    path: '/settings',
    token: state.admin.accessToken,
    body: {
      settings: [
        { key: 'minimumWithdrawalAmount', value: 0.01 }
      ]
    },
    expectedStatus: 200,
    note: 'lower min withdrawal for runtime test'
  });

  const createWithdrawal = await request({
    method: 'POST',
    path: '/withdrawals',
    token: refreshedAccess,
    body: {
      amount: 0.02,
      paymentMethod: { type: 'upi', upiId: 'creator@upi' }
    },
    expectedStatus: 400,
    note: 'without R2-backed monetizable view, balance remains insufficient'
  });
  state.withdrawalId = createWithdrawal.data?.data?._id || null;

  if (createWithdrawal.data?.message === 'Insufficient balance') {
    await mongoose.connect(process.env.MONGODB_URI);
    await Wallet.findOneAndUpdate(
      { creatorId: state.creator.id },
      {
        $setOnInsert: { creatorId: state.creator.id },
        $inc: { totalEarnings: 1, availableBalance: 1 }
      },
      { upsert: true, new: true }
    );
    await mongoose.connection.close();

    const retryWithdrawal = await request({
      method: 'POST',
      path: '/withdrawals',
      token: refreshedAccess,
      body: {
        amount: 0.02,
        paymentMethod: { type: 'upi', upiId: 'creator@upi' }
      },
      expectedStatus: 201,
      note: 'retry valid withdrawal after test-only wallet top-up'
    });
    state.withdrawalId = retryWithdrawal.data?.data?._id || null;
  }

  await request({
    method: 'POST',
    path: '/withdrawals',
    token: refreshedAccess,
    body: {
      amount: 0.02,
      paymentMethod: { type: 'upi', upiId: 'creator@upi' }
    },
    expectedStatus: 400,
    note: 'one pending withdrawal rule'
  });

  // Admin flow
  await request({
    method: 'GET',
    path: '/admin/users',
    token: state.admin.accessToken,
    expectedStatus: 200,
    note: 'admin list users'
  });

  await request({
    method: 'GET',
    path: '/withdrawals/admin/all',
    token: state.admin.accessToken,
    expectedStatus: 200,
    note: 'admin list withdrawals'
  });

  await request({
    method: 'GET',
    path: '/settings',
    token: state.admin.accessToken,
    expectedStatus: 200,
    note: 'admin inspect settings'
  });

  await request({
    method: 'GET',
    path: '/fraud/flags',
    token: state.admin.accessToken,
    expectedStatus: 200,
    note: 'admin inspect fraud flags'
  });

  await request({
    method: 'GET',
    path: '/analytics/admin/dashboard',
    token: state.admin.accessToken,
    expectedStatus: 200,
    note: 'admin analytics dashboard'
  });

  // Blocked user behavior
  await request({
    method: 'PATCH',
    path: `/admin/users/${state.creator.id}/block`,
    token: state.admin.accessToken,
    expectedStatus: 200,
    note: 'admin blocks creator'
  });

  await request({
    method: 'GET',
    path: '/auth/me',
    token: refreshedAccess,
    expectedStatus: 401,
    note: 'blocked user access should fail'
  });

  await request({
    method: 'PATCH',
    path: `/admin/users/${state.creator.id}/unblock`,
    token: state.admin.accessToken,
    expectedStatus: 200,
    note: 'admin unblocks creator'
  });

  const failed = matrix.filter((m) => !m.pass);
  const summary = {
    total: matrix.length,
    passed: matrix.length - failed.length,
    failed: failed.length
  };

  console.log(JSON.stringify({ summary, matrix, state }, null, 2));
  process.exit(failed.length > 0 ? 1 : 0);
};

run().catch((err) => {
  console.error(JSON.stringify({ fatal: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
