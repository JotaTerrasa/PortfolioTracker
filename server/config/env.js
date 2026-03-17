import dotenv from 'dotenv';

dotenv.config();

export const port = Number(process.env.SERVER_PORT || 3001);
export const isVercel = process.env.VERCEL === '1';
export const isProduction = process.env.NODE_ENV === 'production' || isVercel;
export const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
export const dashboardPassword = process.env.DASHBOARD_PASSWORD || '';
export const authEnabled = Boolean(dashboardPassword);
export const loginMaxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
export const loginWindowMs = Number(process.env.LOGIN_WINDOW_MS || 10 * 60 * 1000);
export const loginBlockMs = Number(process.env.LOGIN_BLOCK_MS || 15 * 60 * 1000);
export const usageSnapshotCooldownMinutes = Math.max(5, Number(process.env.AUTO_SNAPSHOT_COOLDOWN_MINUTES || 60));
export const usageSnapshotCooldownMs = usageSnapshotCooldownMinutes * 60 * 1000;
export const corsAllowlist = (process.env.CORS_ALLOWLIST || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const rawAuthSecret = process.env.AUTH_SECRET || '';
const hasStrongAuthSecret = rawAuthSecret.length >= 32 && rawAuthSecret !== dashboardPassword;

export const authConfig = {
  enabled: authEnabled,
  password: dashboardPassword,
  secret: hasStrongAuthSecret ? rawAuthSecret : null,
  canIssueTokens: !authEnabled || !isProduction || hasStrongAuthSecret,
  warning:
    authEnabled && isProduction && !hasStrongAuthSecret
      ? 'Dashboard auth enabled in production without a strong AUTH_SECRET (min 32 chars). Login disabled until AUTH_SECRET is configured.'
      : null,
};
