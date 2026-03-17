import express from 'express';
import { authConfig, isVercel } from '../config/env.js';
import { checkDbHealth, getSnapshots } from '../lib/db.js';
import {
  clearLoginAttempts,
  createAuthToken,
  getActiveLoginBlock,
  getClientIp,
  parseBearerToken,
  registerFailedLoginAttempt,
  requireDashboardAuth,
  verifyAuthToken,
} from '../services/auth.js';
import { getPortfolioSnapshot } from '../services/portfolio.js';
import { maybeSaveUsageSnapshot, saveSnapshot } from '../services/snapshots.js';

const router = express.Router();
router.use(requireDashboardAuth);

router.get('/auth/status', (req, res) => {
  if (!authConfig.enabled) return res.json({ enabled: false, authenticated: true, warning: null });
  const token = parseBearerToken(req.headers.authorization || '');
  return res.json({
    enabled: true,
    authenticated: verifyAuthToken(token),
    canLogin: authConfig.canIssueTokens,
    warning: authConfig.warning,
  });
});

router.post('/auth/login', (req, res) => {
  if (!authConfig.enabled) return res.json({ enabled: false, token: null, warning: null });
  if (!authConfig.canIssueTokens) {
    return res.status(503).json({
      error: authConfig.warning || 'Dashboard login is temporarily unavailable due to server auth configuration.',
    });
  }

  const ip = getClientIp(req);
  const activeBlock = getActiveLoginBlock(ip);
  if (activeBlock) {
    const waitSeconds = Math.ceil((activeBlock.blockedUntil - Date.now()) / 1000);
    return res.status(429).json({ error: `Demasiados intentos. Reintenta en ${waitSeconds}s.` });
  }

  const { password } = req.body || {};
  if (!password || password !== authConfig.password) {
    registerFailedLoginAttempt(ip);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  clearLoginAttempts(ip);
  const token = createAuthToken();
  return res.json({ enabled: true, token, warning: authConfig.warning });
});

router.get('/history', async (_req, res) => {
  try {
    const rows = await getSnapshots();
    res.json(rows);
  } catch (err) {
    console.error('[History] Error fetching snapshots:', err.message);
    return res.json([]);
  }
});

async function runSnapshot(req, res) {
  if (isVercel && process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized snapshot trigger' });
    }
  }

  const ok = await saveSnapshot();
  if (!ok) return res.status(500).json({ error: 'Snapshot failed' });
  return res.json({ ok: true });
}

router.post('/snapshot', runSnapshot);
router.get('/snapshot', runSnapshot);

router.get('/balance', async (_req, res) => {
  try {
    const balances = await getPortfolioSnapshot();
    await maybeSaveUsageSnapshot(balances.total_usd);
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/health', async (_req, res) => {
  try {
    const db = await checkDbHealth();
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      auth: {
        enabled: authConfig.enabled,
        canLogin: authConfig.canIssueTokens,
        warning: authConfig.warning,
      },
      db,
    });
  } catch (err) {
    res.status(500).json({ ok: false, timestamp: new Date().toISOString(), error: err.message });
  }
});

export default router;
