import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ccxt from 'ccxt';
import axios from 'axios';
import sqlite3 from 'sqlite3';
import cron from 'node-cron';
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.SERVER_PORT || 3001;
const isVercel = process.env.VERCEL === '1';
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const pgSql = databaseUrl ? neon(databaseUrl) : null;
const dashboardPassword = process.env.DASHBOARD_PASSWORD || '';
const authEnabled = Boolean(dashboardPassword);
const authSecret = process.env.AUTH_SECRET || dashboardPassword || 'dev-fallback-secret';

app.use(cors());
app.use(express.json());

const parseBearerToken = (authHeader = '') => {
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
};

const b64url = {
  encode: (value) => Buffer.from(value).toString('base64url'),
  decode: (value) => Buffer.from(value, 'base64url').toString('utf8')
};

function signAuthPayload(payload) {
  return crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
}

function createAuthToken() {
  const payload = JSON.stringify({ exp: Date.now() + (1000 * 60 * 60 * 24) }); // 24h
  const payloadB64 = b64url.encode(payload);
  const signature = signAuthPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token) return false;
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return false;

  const expected = signAuthPayload(payloadB64);
  if (signature !== expected) return false;

  try {
    const payload = JSON.parse(b64url.decode(payloadB64));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function requireDashboardAuth(req, res, next) {
  if (!authEnabled) return next();
  const reqPath = req.path || '';
  const originalUrl = req.originalUrl || '';
  if (reqPath.startsWith('/auth/') || reqPath.startsWith('/api/auth/') || originalUrl.includes('/auth/')) return next();
  if (reqPath === '/snapshot' || reqPath === '/api/snapshot' || originalUrl.includes('/snapshot')) return next();

  const token = parseBearerToken(req.headers.authorization || '');
  if (!verifyAuthToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

app.use('/api', requireDashboardAuth);

// ─── DB Setup (SQLite local, Postgres on Vercel) ───────────────
let db = null;
if (!isVercel) {
  const dbPath = join(__dirname, 'portfolio.db');
  db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_usd REAL
    )`);
  });
}

let pgInitPromise = null;
async function ensureSnapshotsTable() {
  if (!isVercel) return true;
  if (!pgSql) return false;
  if (!pgInitPromise) {
    pgInitPromise = pgSql`
      CREATE TABLE IF NOT EXISTS snapshots (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        total_usd DOUBLE PRECISION
      )
    `;
  }
  await pgInitPromise;
  return true;
}

async function insertSnapshot(totalUsd) {
  if (isVercel) {
    const ready = await ensureSnapshotsTable();
    if (!ready) return false;
    await pgSql`INSERT INTO snapshots (total_usd) VALUES (${totalUsd})`;
    return true;
  }

  await new Promise((resolve, reject) => {
    db.run('INSERT INTO snapshots (total_usd) VALUES (?)', [totalUsd], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  return true;
}

async function getSnapshots() {
  if (isVercel) {
    const ready = await ensureSnapshotsTable();
    if (!ready) return [];
    const rows = await pgSql`SELECT id, timestamp, total_usd FROM snapshots ORDER BY timestamp ASC`;
    return rows;
  }

  return await new Promise((resolve, reject) => {
    db.all('SELECT * FROM snapshots ORDER BY timestamp ASC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function getSnapshotCount() {
  if (isVercel) {
    const ready = await ensureSnapshotsTable();
    if (!ready) return 0;
    const rows = await pgSql`SELECT COUNT(*)::int AS count FROM snapshots`;
    return rows[0]?.count || 0;
  }

  return await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM snapshots', (err, row) => {
      if (err) reject(err);
      else resolve(row?.count || 0);
    });
  });
}

const priceDataCache = {
  data: {}, // Each entry: { price: float, change24h: float }
  highs1y: {}, // 1-year high cache
  lastFetch: 0,
  TTL: 120_000,
};

const COINGECKO_IDS = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'USDT': 'tether',
  'USDC': 'usd-coin', 'SOL': 'solana', 'XRP': 'ripple',
  'ADA': 'cardano', 'DOGE': 'dogecoin', 'AVAX': 'avalanche-2',
  'DOT': 'polkadot', 'LINK': 'chainlink', 'MATIC': 'polygon',
  'POL': 'polygon', 'SHIB': 'shiba-inu', 'DAI': 'dai',
  'LTC': 'litecoin', 'BCH': 'bitcoin-cash', 'UNI': 'uniswap',
  'NEAR': 'near', 'LEO': 'bitfinex-leo', 'XLM': 'stellar',
  'ICP': 'internet-computer', 'ETC': 'ethereum-classic',
  'ATOM': 'cosmos', 'FIL': 'filecoin', 'HBAR': 'hedera-hashgraph',
  'KAS': 'kaspa', 'APT': 'aptos', 'OP': 'optimism', 'ARB': 'arbitrum',
  'HYPE': 'hyperliquid', 'RAY': 'raydium',
  'ASTR': 'astar', 'ASTER': 'aster-2',
  'VSN': 'vision-network',
};

const STABLECOINS = { 'USDT': { price: 1.0, change24h: 0 }, 'USDC': { price: 1.0, change24h: 0 }, 'DAI': { price: 1.0, change24h: 0 } };
const IGNORED_TOKENS = ['VSN', 'USDC', 'USDT'];

// ─── EUR/USD rate cache ────────────────────────────────────────
const eurCache = { rate: null, lastFetch: 0, TTL: 300_000 };

async function getEurRate() {
  const now = Date.now();
  if (eurCache.rate && now - eurCache.lastFetch < eurCache.TTL) return eurCache.rate;
  try {
    const resp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=eur', { timeout: 5000 });
    eurCache.rate = resp.data?.tether?.eur || 0.92;
    eurCache.lastFetch = now;
  } catch {
    eurCache.rate = eurCache.rate || 0.92;
  }
  return eurCache.rate;
}

async function sync1YearHighs() {
  console.log('[CoinGecko] Starting exact 1-Year High sync for selected tokens...');

  const targetTokens = ['ASTER', 'RAY', 'HYPE'];
  const to = Math.floor(Date.now() / 1000);
  const from = to - (365 * 24 * 60 * 60);

  for (const sym of targetTokens) {
    const id = COINGECKO_IDS[sym];
    if (!id) continue;

    try {
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`, { timeout: 10000 });
      if (response.data && response.data.prices) {
        const prices = response.data.prices.map(p => p[1]);
        priceDataCache.highs1y[sym] = Math.max(...prices);
      }
    } catch (e) {
      console.log(`[CoinGecko] Could not fetch 1Y high for ${sym}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 4500)); // 4.5-sec delay to avoid rate limits
  }
  console.log('[CoinGecko] 1-Year High sync complete.');
}
if (!isVercel) {
  sync1YearHighs();
  setInterval(sync1YearHighs, 24 * 60 * 60 * 1000); // refresh daily
}

// ─── CoinGecko fetcher with 24h change and Icons ─────────────────────────
async function getCoinGeckoPrices(symbols) {
  const now = Date.now();
  const prices = { ...STABLECOINS };

  // Adjust Cache to return icons if present
  if (now - priceDataCache.lastFetch < priceDataCache.TTL && Object.keys(priceDataCache.data).length > 0) {
    symbols.forEach(s => {
      const key = s.toUpperCase();
      if (priceDataCache.data[key]) prices[key] = priceDataCache.data[key];
    });
    return prices;
  }

  const toFetch = symbols.filter(s => !STABLECOINS[s.toUpperCase()]);
  const ids = toFetch.map(s => COINGECKO_IDS[s.toUpperCase()]).filter(Boolean);
  const uniqueIds = [...new Set(ids)].join(',');

  if (!uniqueIds) return prices;

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${uniqueIds}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`,
      { timeout: 10000 }
    );

    const dataArr = response.data || [];
    dataArr.forEach(coin => {
      // Find which symbol(s) map to this ID
      const matchingSymbols = Object.keys(COINGECKO_IDS).filter(sym => COINGECKO_IDS[sym] === coin.id);
      matchingSymbols.forEach(sym => {
        const pObj = {
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h || 0,
          icon: coin.image,
          ath: priceDataCache.highs1y[sym] || coin.ath || 0
        };
        prices[sym] = pObj;
        priceDataCache.data[sym] = pObj;
      });
    });

    priceDataCache.lastFetch = now;
  } catch (e) {
    console.error('[CoinGecko] Error fetching markets:', e.message);
    if (Object.keys(priceDataCache.data).length > 0) {
      symbols.forEach(s => {
        const key = s.toUpperCase();
        if (priceDataCache.data[key]) prices[key] = priceDataCache.data[key];
      });
    }
  }

  return prices;
}

// ─── Exchange ticker fallback with 24h change ───────────────
async function getExchangePrices(symbols, bingxClient) {
  const prices = {};
  if (!bingxClient) return prices;

  for (const symbol of symbols) {
    const key = symbol.toUpperCase();
    if (STABLECOINS[key]) { prices[key] = STABLECOINS[key]; continue; }
    try {
      const ticker = await bingxClient.fetchTicker(`${key}/USDT`);
      if (ticker?.last) {
        prices[key] = {
          price: ticker.last,
          change24h: ticker.percentage || 0
        };
      }
    } catch (e) { }
  }
  return prices;
}

// ─── Internal Portfolio Fetcher for Snapshots ─────────────────
async function getInternalBalance() {
  const balances = { total_usd: 0 };
  let bingxClient = null;

  try {
    const bingxAssets = [];
    if (process.env.BINGX_API_KEY && process.env.BINGX_SECRET_KEY) {
      bingxClient = new ccxt.bingx({ apiKey: process.env.BINGX_API_KEY, secret: process.env.BINGX_SECRET_KEY });
      const b = await bingxClient.fetchBalance();
      for (const [coin, amount] of Object.entries(b.total)) {
        if (amount > 0 && !IGNORED_TOKENS.includes(coin.toUpperCase())) bingxAssets.push({ coin, amount });
      }
    }

    const bitpandaAssets = [];
    if (process.env.BITPANDA_API_KEY) {
      const r = await axios.get('https://api.bitpanda.com/v1/asset-wallets', { headers: { 'X-API-KEY': process.env.BITPANDA_API_KEY } });
      const sections = ['cryptocoin', 'commodity', 'index'];
      sections.forEach(s => {
        const wallets = r.data.data.attributes[s]?.attributes?.wallets || [];
        wallets.forEach(w => {
          const amount = parseFloat(w.attributes.balance);
          const symbol = w.attributes.cryptocoin_symbol || w.attributes.symbol || w.attributes.name;
          if (amount > 0 && !IGNORED_TOKENS.includes(symbol.toUpperCase())) bitpandaAssets.push({ coin: symbol, amount });
        });
      });
    }

    const allSymbols = [...new Set([...bingxAssets.map(a => a.coin), ...bitpandaAssets.map(a => a.coin)])];
    const cgPrices = await getCoinGeckoPrices(allSymbols);
    const exPrices = await getExchangePrices(allSymbols.filter(s => !cgPrices[s.toUpperCase()]), bingxClient);

    const prices = {};
    allSymbols.forEach(s => { const k = s.toUpperCase(); prices[k] = cgPrices[k] || exPrices[k] || { price: 0, change24h: 0 }; });

    [...bingxAssets, ...bitpandaAssets].forEach(a => {
      balances.total_usd += a.amount * (prices[a.coin.toUpperCase()]?.price || 0);
    });

    return balances.total_usd;
  } catch (e) {
    console.error('[Snapshot] Error calculating balance:', e.message);
    return null;
  }
}

// ─── Cron Job for History ──────────────────────────────────────
const saveSnapshot = async () => {
  console.log('[Snapshot] Taking a snapshot of the portfolio...');
  const total = await getInternalBalance();
  if (total !== null) {
    try {
      const inserted = await insertSnapshot(total);
      if (!inserted) {
        console.warn('[Snapshot] Skipped: no DATABASE_URL/POSTGRES_URL configured.');
        return false;
      }
      console.log('[Snapshot] Saved: $', total.toFixed(2));
      return true;
    } catch (err) {
      console.error('[Snapshot] Error saving to DB:', err);
      return false;
    }
  }
  return false;
};

if (!isVercel) {
  // In development, save every 10 minutes for quick testing. Real usage: maybe every hour.
  cron.schedule('*/10 * * * *', saveSnapshot);

  // Take an initial snapshot if DB is empty
  getSnapshotCount()
    .then((count) => {
      if (count === 0) saveSnapshot();
    })
    .catch((err) => console.error('[Snapshot] Error checking initial count:', err));
}

// ─── API Endpoints ─────────────────────────────────────────────
const handleAuthStatus = (req, res) => {
  if (!authEnabled) return res.json({ enabled: false, authenticated: true });
  const token = parseBearerToken(req.headers.authorization || '');
  return res.json({ enabled: true, authenticated: verifyAuthToken(token) });
};

const handleAuthLogin = (req, res) => {
  if (!authEnabled) return res.json({ enabled: false, token: null });
  const { password } = req.body || {};
  if (!password || password !== dashboardPassword) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = createAuthToken();
  return res.json({ enabled: true, token });
};

const handleHistory = async (req, res) => {
  try {
    const rows = await getSnapshots();
    res.json(rows);
  } catch (err) {
    console.error('[History] Error fetching snapshots:', err.message);
    return res.json([]);
  }
};

const handleSnapshot = async (req, res) => {
  if (isVercel && process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized snapshot trigger' });
    }
  }

  const ok = await saveSnapshot();
  if (!ok) return res.status(500).json({ error: 'Snapshot failed' });
  res.json({ ok: true });
};

const handleBalance = async (req, res) => {
  const balances = { bingx: [], bitpanda: [], total_usd: 0, total_invested: 0, total_pnl: 0, eur_rate: 0.92 };
  let bingxClient = null;

  try {
    if (process.env.BINGX_API_KEY && process.env.BINGX_SECRET_KEY) {
      bingxClient = new ccxt.bingx({ apiKey: process.env.BINGX_API_KEY, secret: process.env.BINGX_SECRET_KEY });
      const b = await bingxClient.fetchBalance();
      for (const [coin, amount] of Object.entries(b.total)) {
        if (amount > 0 && !IGNORED_TOKENS.includes(coin.toUpperCase())) balances.bingx.push({ coin, amount });
      }
    }

    if (process.env.BITPANDA_API_KEY) {
      const r = await axios.get('https://api.bitpanda.com/v1/asset-wallets', { headers: { 'X-API-KEY': process.env.BITPANDA_API_KEY } });
      ['cryptocoin', 'commodity', 'index'].forEach(s => {
        const wallets = r.data.data.attributes[s]?.attributes?.wallets || [];
        wallets.forEach(w => {
          const amount = parseFloat(w.attributes.balance);
          const symbol = w.attributes.cryptocoin_symbol || w.attributes.symbol || w.attributes.name;
          if (amount > 0 && !IGNORED_TOKENS.includes(symbol.toUpperCase())) balances.bitpanda.push({ coin: symbol, amount });
        });
      });
    }

    const allSymbols = [...new Set([...balances.bingx.map(b => b.coin), ...balances.bitpanda.map(b => b.coin)])];
    const cgPrices = await getCoinGeckoPrices(allSymbols);
    const exPrices = await getExchangePrices(allSymbols.filter(s => !cgPrices[s.toUpperCase()]), bingxClient);

    const prices = {};
    allSymbols.forEach(s => { const k = s.toUpperCase(); prices[k] = cgPrices[k] || exPrices[k] || { price: 0, change24h: 0 }; });

    const costBasis = {};
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

    if (bingxClient) {
      for (const asset of balances.bingx) {
        try {
          await new Promise(r => setTimeout(r, 2000));
          // Provide 'since' to fetch full history, not just recent trades
          const trades = await bingxClient.fetchMyTrades(`${asset.coin}/USDT`, oneYearAgo, 1000);
          let tb = 0, tc = 0;
          trades.forEach(t => { if (t.side === 'buy') { tb += t.amount; tc += t.cost; } });
          if (tb > 0) {
            const avg = tc / tb;
            costBasis[asset.coin] = { avgCost: avg, totalInvested: avg * asset.amount };
          }
        } catch (e) { }
      }
    }

    if (process.env.BITPANDA_API_KEY) {
      try {
        let allBpTrades = [];
        let nextUrl = 'https://api.bitpanda.com/v1/trades?page_size=500';

        while (nextUrl) {
          const r = await axios.get(nextUrl, { headers: { 'X-API-KEY': process.env.BITPANDA_API_KEY } });
          allBpTrades = allBpTrades.concat(r.data.data || []);
          nextUrl = r.data.links?.next || null;
          // Security break to avoid infinite loops
          if (allBpTrades.length > 5000) break;
        }

        const bpStats = {};
        allBpTrades.forEach(t => {
          const a = t.attributes;
          if (a.status === 'finished' && a.type === 'buy') {
            const sym = a.cryptocoin_symbol;
            if (IGNORED_TOKENS.includes(sym.toUpperCase())) return;
            if (!bpStats[sym]) bpStats[sym] = { tb: 0, tc: 0 };
            const am = parseFloat(a.amount_cryptocoin), co = parseFloat(a.amount_fiat) || (am * parseFloat(a.price));
            bpStats[sym].tb += am; bpStats[sym].tc += co;
          }
        });

        Object.keys(bpStats).forEach(sym => {
          const s = bpStats[sym];
          if (s.tb > 0) {
            const assetMatch = balances.bitpanda.find(b => b.coin === sym);
            const amount = assetMatch ? assetMatch.amount : 0;
            costBasis[`bp_${sym}`] = { avgCost: s.tc / s.tb, totalInvested: (s.tc / s.tb) * amount };
          }
        });
      } catch (e) { }
    }

    // Manual cost basis overrides (Total Cost or Average Price)
    for (const asset of balances.bitpanda) {
      const sym = asset.coin.toUpperCase();
      const manualTotal = parseFloat(process.env[`BITPANDA_COST_${sym}`]);
      const manualAvg = parseFloat(process.env[`BITPANDA_AVG_PRICE_${sym}`]);

      if (manualAvg > 0) {
        costBasis[`bp_${asset.coin}`] = { avgCost: manualAvg, totalInvested: manualAvg * asset.amount };
      } else if (manualTotal > 0) {
        costBasis[`bp_${asset.coin}`] = { avgCost: manualTotal / asset.amount, totalInvested: manualTotal };
      }
    }
    for (const asset of balances.bingx) {
      const sym = asset.coin.toUpperCase();
      const manualTotal = parseFloat(process.env[`BINGX_COST_${sym}`]);
      const manualAvg = parseFloat(process.env[`BINGX_AVG_PRICE_${sym}`]);

      if (manualAvg > 0) {
        costBasis[asset.coin] = { avgCost: manualAvg, totalInvested: manualAvg * asset.amount };
      } else if (manualTotal > 0) {
        costBasis[asset.coin] = { avgCost: manualTotal / asset.amount, totalInvested: manualTotal };
      }
    }

    balances.bingx = balances.bingx.map(b => {
      const pData = prices[b.coin.toUpperCase()] || { price: 0, change24h: 0, icon: null, ath: 0 };
      const val = b.amount * pData.price, cb = costBasis[b.coin], inv = cb?.totalInvested || 0, pnl = cb ? val - inv : null;
      balances.total_usd += val;
      if (cb) balances.total_invested += inv;
      if (pnl !== null) balances.total_pnl += pnl;
      return { ...b, price: pData.price, change24h: pData.change24h, icon: pData.icon, ath: pData.ath, value: val, avgCost: cb?.avgCost || null, invested: inv, pnl, pnlPct: cb && inv > 0 ? (pnl / inv) * 100 : null };
    });

    balances.bitpanda = balances.bitpanda.map(b => {
      const pData = prices[b.coin.toUpperCase()] || { price: 0, change24h: 0, icon: null, ath: 0 };
      const val = b.amount * pData.price, cb = costBasis[`bp_${b.coin}`], inv = cb?.totalInvested || 0, pnl = cb ? val - inv : null;
      balances.total_usd += val;
      if (cb) balances.total_invested += inv;
      if (pnl !== null) balances.total_pnl += pnl;
      return { ...b, price: pData.price, change24h: pData.change24h, icon: pData.icon, ath: pData.ath, value: val, avgCost: cb?.avgCost || null, invested: inv, pnl, pnlPct: cb && inv > 0 ? (pnl / inv) * 100 : null };
    });

    balances.eur_rate = await getEurRate();
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.get('/api/auth/status', handleAuthStatus);
app.get('/auth/status', handleAuthStatus);
app.post('/api/auth/login', handleAuthLogin);
app.post('/auth/login', handleAuthLogin);
app.get('/api/history', handleHistory);
app.get('/history', handleHistory);
app.get('/api/snapshot', handleSnapshot);
app.get('/snapshot', handleSnapshot);
app.get('/api/balance', handleBalance);
app.get('/balance', handleBalance);

if (!isVercel) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

export default app;
