import crypto from 'crypto';
import { authConfig, loginBlockMs, loginMaxAttempts, loginWindowMs } from '../config/env.js';

const loginAttempts = new Map();
let authConfigOverride = null;

function getAuthConfig() {
  return authConfigOverride || authConfig;
}

export const parseBearerToken = (authHeader = '') => {
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
};

const b64url = {
  encode: (value) => Buffer.from(value).toString('base64url'),
  decode: (value) => Buffer.from(value, 'base64url').toString('utf8'),
};

function signAuthPayload(payload) {
  const currentAuthConfig = getAuthConfig();
  if (!currentAuthConfig.secret) return null;
  return crypto.createHmac('sha256', currentAuthConfig.secret).update(payload).digest('base64url');
}

export function createAuthToken() {
  const currentAuthConfig = getAuthConfig();
  const signatureSecret = currentAuthConfig.secret;
  if (!signatureSecret) return null;
  const payload = JSON.stringify({ exp: Date.now() + (1000 * 60 * 60 * 24) });
  const payloadB64 = b64url.encode(payload);
  const signature = signAuthPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export const getClientIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

export const registerFailedLoginAttempt = (ip) => {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  let attempt = current;

  if (!attempt || now - attempt.windowStart > loginWindowMs) {
    attempt = { count: 0, windowStart: now, blockedUntil: 0 };
  }

  attempt.count += 1;
  if (attempt.count >= loginMaxAttempts) {
    attempt.blockedUntil = now + loginBlockMs;
  }

  loginAttempts.set(ip, attempt);
  return attempt;
};

export const getActiveLoginBlock = (ip) => {
  const attempt = loginAttempts.get(ip);
  if (!attempt) return null;

  const now = Date.now();
  if (attempt.blockedUntil && attempt.blockedUntil > now) return attempt;
  if (attempt.blockedUntil && attempt.blockedUntil <= now) {
    loginAttempts.delete(ip);
  }
  return null;
};

export function verifyAuthToken(token) {
  const currentAuthConfig = getAuthConfig();
  if (!token || !currentAuthConfig.secret) return false;
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return false;

  const expected = signAuthPayload(payloadB64);
  if (!expected || signature !== expected) return false;

  try {
    const payload = JSON.parse(b64url.decode(payloadB64));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function requireDashboardAuth(req, res, next) {
  const currentAuthConfig = getAuthConfig();
  if (!currentAuthConfig.enabled) return next();
  const reqPath = req.path || '';
  if (reqPath.startsWith('/auth/')) return next();
  if (reqPath === '/snapshot') return next();

  const token = parseBearerToken(req.headers.authorization || '');
  if (!verifyAuthToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

export function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

export function setAuthConfigForTests(config) {
  authConfigOverride = config;
}

export function resetAuthConfigForTests() {
  authConfigOverride = null;
}
