import sqlite3 from 'sqlite3';
import { neon } from '@neondatabase/serverless';
import { join } from 'path';
import { databaseUrl, isVercel } from '../config/env.js';

const pgSql = databaseUrl ? neon(databaseUrl) : null;
let db = null;

export function initDb(baseDir) {
  if (isVercel || db) return db;
  const dbPath = join(baseDir, 'portfolio.db');
  db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_usd REAL
    )`);
  });
  return db;
}

let pgInitPromise = null;

export async function ensureSnapshotsTable() {
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

export async function insertSnapshot(totalUsd) {
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

export async function getSnapshots() {
  if (isVercel) {
    const ready = await ensureSnapshotsTable();
    if (!ready) return [];
    return pgSql`SELECT id, timestamp, total_usd FROM snapshots ORDER BY timestamp ASC`;
  }

  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM snapshots ORDER BY timestamp ASC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export async function getSnapshotCount() {
  if (isVercel) {
    const ready = await ensureSnapshotsTable();
    if (!ready) return 0;
    const rows = await pgSql`SELECT COUNT(*)::int AS count FROM snapshots`;
    return rows[0]?.count || 0;
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM snapshots', (err, row) => {
      if (err) reject(err);
      else resolve(row?.count || 0);
    });
  });
}

export async function getLatestSnapshotTimestamp() {
  if (isVercel) {
    const ready = await ensureSnapshotsTable();
    if (!ready) return null;
    const rows = await pgSql`SELECT MAX(timestamp) AS last_ts FROM snapshots`;
    const raw = rows[0]?.last_ts;
    const ts = raw ? new Date(raw).getTime() : null;
    return Number.isFinite(ts) ? ts : null;
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT MAX(timestamp) as last_ts FROM snapshots', (err, row) => {
      if (err) reject(err);
      else {
        const raw = row?.last_ts;
        const ts = raw ? new Date(raw).getTime() : null;
        resolve(Number.isFinite(ts) ? ts : null);
      }
    });
  });
}

export async function checkDbHealth() {
  const dbStatus = { connected: false, engine: isVercel ? 'postgres' : 'sqlite' };
  if (isVercel) {
    if (pgSql) {
      await pgSql`SELECT 1`;
      dbStatus.connected = true;
    }
  } else {
    dbStatus.connected = Boolean(db);
  }
  return dbStatus;
}
