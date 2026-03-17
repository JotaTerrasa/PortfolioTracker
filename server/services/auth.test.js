import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLoginAttempts,
  createAuthToken,
  getClientIp,
  parseBearerToken,
  registerFailedLoginAttempt,
  requireDashboardAuth,
  resetAuthConfigForTests,
  setAuthConfigForTests,
  verifyAuthToken,
} from './auth.js';

test.afterEach(() => {
  resetAuthConfigForTests();
  clearLoginAttempts('1.2.3.4');
});

test('parseBearerToken extracts bearer token', () => {
  assert.equal(parseBearerToken('Bearer abc123'), 'abc123');
  assert.equal(parseBearerToken('Basic abc123'), null);
  assert.equal(parseBearerToken(''), null);
});

test('createAuthToken and verifyAuthToken work with strong secret', () => {
  setAuthConfigForTests({ enabled: true, secret: '12345678901234567890123456789012' });
  const token = createAuthToken();
  assert.equal(typeof token, 'string');
  assert.equal(verifyAuthToken(token), true);
  assert.equal(verifyAuthToken(`${token}tampered`), false);
});

test('requireDashboardAuth allows public auth and snapshot routes', () => {
  setAuthConfigForTests({ enabled: true, secret: '12345678901234567890123456789012' });
  let called = false;
  const next = () => { called = true; };
  const res = { status: () => ({ json: () => { throw new Error('should not block'); } }) };

  requireDashboardAuth({ path: '/auth/status', headers: {} }, res, next);
  assert.equal(called, true);

  called = false;
  requireDashboardAuth({ path: '/snapshot', headers: {} }, res, next);
  assert.equal(called, true);
});

test('requireDashboardAuth blocks protected route without valid token', () => {
  setAuthConfigForTests({ enabled: true, secret: '12345678901234567890123456789012' });
  let statusCode = null;
  let jsonPayload = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(payload) {
          jsonPayload = payload;
          return payload;
        },
      };
    },
  };

  requireDashboardAuth({ path: '/balance', headers: {} }, res, () => {
    throw new Error('should not call next');
  });

  assert.equal(statusCode, 401);
  assert.deepEqual(jsonPayload, { error: 'Unauthorized' });
});

test('getClientIp prefers x-forwarded-for', () => {
  const ip = getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, ip: '9.9.9.9', socket: {} });
  assert.equal(ip, '1.2.3.4');
});

test('registerFailedLoginAttempt blocks after threshold', () => {
  clearLoginAttempts('1.2.3.4');
  let attempt;
  for (let i = 0; i < 5; i += 1) {
    attempt = registerFailedLoginAttempt('1.2.3.4');
  }
  assert.equal(attempt.count, 5);
  assert.ok(attempt.blockedUntil > Date.now());
});
