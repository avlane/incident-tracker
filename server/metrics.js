import { SEVERITIES } from './incidents.js';

// Response metrics over a set of incidents. Pure: pass incidents in, get
// numbers out.
//
//   time to respond (MTTA): from opening to the first posted update
//   time to resolve (MTTR): from opening to resolution, resolved incidents only
//
// Incidents that were reopened count their *latest* resolution only, since
// resolvedAt is cleared on reopen and set again when they close.

const DAY = 86_400_000;

export const mean = (values) => (values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length));

// Nearest-rank percentile of an unsorted list; p is 0 to 100.
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

// Monday 00:00 UTC of the week containing the timestamp, as YYYY-MM-DD.
export function weekStart(ms) {
  const d = new Date(ms);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday)).toISOString().slice(0, 10);
}

function timeToRespond(incident) {
  const first = incident.updates.find((u) => u.kind === 'update');
  return first ? Date.parse(first.at) - Date.parse(incident.createdAt) : null;
}

function timeToResolve(incident) {
  return incident.resolvedAt ? Date.parse(incident.resolvedAt) - Date.parse(incident.createdAt) : null;
}

export function computeMetrics(incidents, { from, to }) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const inRange = incidents.filter((i) => {
    const t = Date.parse(i.createdAt);
    return t >= fromMs && t <= toMs;
  });

  const responds = inRange.map(timeToRespond).filter((v) => v !== null);
  const resolves = inRange.map(timeToResolve).filter((v) => v !== null);

  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const i of inRange) bySeverity[i.severity]++;

  const services = new Map();
  for (const i of inRange) {
    const duration = timeToResolve(i);
    for (const serviceId of new Set(i.affected.map((a) => a.serviceId))) {
      const row = services.get(serviceId) ?? { serviceId, incidents: 0, resolvedMs: 0 };
      row.incidents++;
      row.resolvedMs += duration ?? 0;
      services.set(serviceId, row);
    }
  }

  // One bucket per week from the first to the last week of the range, so empty
  // weeks show up as zeros rather than gaps.
  const weeks = new Map();
  for (let t = Date.parse(weekStart(fromMs)); t <= toMs; t += 7 * DAY) {
    weeks.set(weekStart(t), { weekStart: weekStart(t), opened: 0, resolved: 0 });
  }
  for (const i of inRange) weeks.get(weekStart(Date.parse(i.createdAt))).opened++;
  for (const i of incidents) {
    if (!i.resolvedAt) continue;
    const t = Date.parse(i.resolvedAt);
    if (t >= fromMs && t <= toMs) weeks.get(weekStart(t)).resolved++;
  }

  return {
    period: { from, to },
    total: inRange.length,
    open: inRange.filter((i) => !i.resolvedAt).length,
    resolved: resolves.length,
    bySeverity,
    timeToRespond: { meanMs: mean(responds), medianMs: percentile(responds, 50), p90Ms: percentile(responds, 90), samples: responds.length },
    timeToResolve: { meanMs: mean(resolves), medianMs: percentile(resolves, 50), p90Ms: percentile(resolves, 90), samples: resolves.length },
    byService: [...services.values()].sort((a, b) => b.incidents - a.incidents || a.serviceId.localeCompare(b.serviceId)),
    weekly: [...weeks.values()],
  };
}
