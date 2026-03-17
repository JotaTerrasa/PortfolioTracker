export const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#d946ef', '#f43f5e', '#f59e0b', '#10b981'];

export const fmtUsd = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtEur = (v, rate) => `€${(v * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDurationCompact = (ms) => {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null;
  if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (ms < 24 * 60 * 60 * 1000) return `${Math.round(ms / (60 * 60 * 1000))}h`;
  return `${Math.round(ms / (24 * 60 * 60 * 1000))}d`;
};
export const fmtDateTime = (ts) => new Date(ts).toLocaleString([], {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const fmtSignedPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export const calculateTaxSpain = (profitUsd, rate) => {
  let profitEur = profitUsd * rate;
  if (profitEur <= 0) return 0;
  let taxEur = 0;
  let remaining = profitEur;

  if (remaining > 0) { const tranche = Math.min(remaining, 6000); taxEur += tranche * 0.19; remaining -= tranche; }
  if (remaining > 0) { const tranche = Math.min(remaining, 44000); taxEur += tranche * 0.21; remaining -= tranche; }
  if (remaining > 0) { const tranche = Math.min(remaining, 150000); taxEur += tranche * 0.23; remaining -= tranche; }
  if (remaining > 0) { const tranche = Math.min(remaining, 100000); taxEur += tranche * 0.27; remaining -= tranche; }
  if (remaining > 0) { taxEur += remaining * 0.28; }

  return taxEur / rate;
};
