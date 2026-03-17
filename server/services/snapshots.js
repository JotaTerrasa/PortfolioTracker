import cron from 'node-cron';
import { isVercel, usageSnapshotCooldownMinutes, usageSnapshotCooldownMs } from '../config/env.js';
import { getLatestSnapshotTimestamp, getSnapshotCount, insertSnapshot } from '../lib/db.js';
import { getInternalBalance } from './portfolio.js';

export const saveSnapshot = async () => {
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

export const maybeSaveUsageSnapshot = async (totalUsd) => {
  if (!isVercel) return false;
  if (!Number.isFinite(totalUsd) || totalUsd <= 0) return false;

  try {
    const lastSnapshotTs = await getLatestSnapshotTimestamp();
    if (lastSnapshotTs && Date.now() - lastSnapshotTs < usageSnapshotCooldownMs) {
      return false;
    }

    const inserted = await insertSnapshot(totalUsd);
    if (inserted) {
      console.log(`[Snapshot] Usage snapshot saved (${usageSnapshotCooldownMinutes}m cooldown).`);
    }
    return inserted;
  } catch (err) {
    console.error('[Snapshot] Usage snapshot skipped:', err.message);
    return false;
  }
};

export function startSnapshotCron() {
  if (isVercel) return;

  cron.schedule('*/10 * * * *', saveSnapshot);
  getSnapshotCount()
    .then((count) => {
      if (count === 0) saveSnapshot();
    })
    .catch((err) => console.error('[Snapshot] Error checking initial count:', err));
}
