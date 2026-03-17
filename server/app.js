import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import apiRouter from './routes/api.js';
import { authConfig, corsAllowlist, isVercel } from './config/env.js';
import { initDb } from './lib/db.js';
import { sync1YearHighs } from './services/pricing.js';
import { startSnapshotCron } from './services/snapshots.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

function createCorsOptions() {
  if (corsAllowlist.length === 0) {
    return {
      origin: (origin, callback) => callback(null, true),
    };
  }

  return {
    origin: (origin, callback) => {
      if (!origin || corsAllowlist.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
  };
}

app.use(cors(createCorsOptions()));
app.use(express.json());

initDb(__dirname + '/..');

if (authConfig.warning) {
  console.warn(`[Auth] ${authConfig.warning}`);
}

if (!isVercel) {
  sync1YearHighs();
  setInterval(sync1YearHighs, 24 * 60 * 60 * 1000);
}

startSnapshotCron();
app.use('/api', apiRouter);

app.get('/auth/status', (_req, res) => res.redirect(307, '/api/auth/status'));
app.post('/auth/login', (_req, res) => res.redirect(307, '/api/auth/login'));
app.get('/history', (_req, res) => res.redirect(307, '/api/history'));
app.get('/snapshot', (_req, res) => res.redirect(307, '/api/snapshot'));
app.post('/snapshot', (_req, res) => res.redirect(307, '/api/snapshot'));
app.get('/balance', (_req, res) => res.redirect(307, '/api/balance'));
app.get('/health', (_req, res) => res.redirect(307, '/api/health'));

export default app;
