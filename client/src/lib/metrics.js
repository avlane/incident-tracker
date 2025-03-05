import { formatDuration } from './format.js';

export const RANGES = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '365d', label: 'Last year', days: 365 },
];

export function rangeParams(key, nowMs = Date.now()) {
  const range = RANGES.find((r) => r.key === key) ?? RANGES[1];
  return { from: new Date(nowMs - range.days * 86_400_000).toISOString(), to: new Date(nowMs).toISOString() };
}

const orDash = (ms) => (ms === null || ms === undefined ? '-' : formatDuration(ms));

// The four headline numbers on the dashboard.
export function summaryCards(metrics) {
  return [
    { label: 'Incidents', value: String(metrics.total), detail: `${metrics.open} still open` },
    { label: 'Median time to respond', value: orDash(metrics.timeToRespond.medianMs), detail: `mean ${orDash(metrics.timeToRespond.meanMs)}` },
    { label: 'Median time to resolve', value: orDash(metrics.timeToResolve.medianMs), detail: `p90 ${orDash(metrics.timeToResolve.p90Ms)}` },
    { label: 'Resolved', value: String(metrics.resolved), detail: `${metrics.total - metrics.resolved} not resolved` },
  ];
}

// Bar widths as whole percentages of the busiest week; a non-zero count always
// gets at least 2% so it stays visible next to a much busier week.
export function weeklyBars(weekly) {
  const peak = Math.max(1, ...weekly.map((w) => Math.max(w.opened, w.resolved)));
  const pct = (n) => (n === 0 ? 0 : Math.max(2, Math.round((n / peak) * 100)));
  return weekly.map((w) => ({ ...w, openedPct: pct(w.opened), resolvedPct: pct(w.resolved) }));
}
