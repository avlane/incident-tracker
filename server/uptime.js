// Uptime per service over the last N days, from public incidents.
//
// How it is counted, so the number can be argued with:
//   - an incident counts from when it opened until it was resolved (or until now)
//   - major outage counts as fully down, partial outage as half down, and
//     degraded performance as up
//   - where incidents overlap, the worst one counts, so time is never counted twice
//   - private incidents and maintenance windows do not count against uptime
// Each day is also given the worst status that touched it, for the little
// day-by-day bars on a status page.

const DAY = 86_400_000;
const WEIGHT = { degraded: 0, partial_outage: 0.5, major_outage: 1 };
const RANK = ['operational', 'degraded', 'partial_outage', 'major_outage'];

const dayStart = (ms) => ms - (ms % DAY);
const worst = (a, b) => (RANK.indexOf(a) >= RANK.indexOf(b) ? a : b);

function intervalsFor(service, incidents, nowMs) {
  const out = [];
  for (const incident of incidents) {
    if (incident.public === false) continue;
    let impact = null;
    for (const a of incident.affected) if (a.serviceId === service.id) impact = impact ? worst(impact, a.impact) : a.impact;
    if (!impact) continue;
    out.push({
      start: Date.parse(incident.createdAt),
      end: incident.resolvedAt ? Date.parse(incident.resolvedAt) : nowMs,
      impact,
    });
  }
  return out;
}

// Total weighted downtime inside [from, to], counting overlapping intervals once.
function downtime(intervals, from, to) {
  const clipped = intervals
    .map((i) => ({ ...i, start: Math.max(i.start, from), end: Math.min(i.end, to) }))
    .filter((i) => i.end > i.start);
  const points = [...new Set(clipped.flatMap((i) => [i.start, i.end]))].sort((a, b) => a - b);
  let total = 0;
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    let weight = 0;
    for (const i of clipped) if (i.start <= a && i.end >= b) weight = Math.max(weight, WEIGHT[i.impact]);
    total += (b - a) * weight;
  }
  return total;
}

export function buildUptime({ services, incidents, now, days = 90 }) {
  const nowMs = Date.parse(now);
  const first = dayStart(nowMs) - (days - 1) * DAY;
  const rows = services
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((service) => {
      const intervals = intervalsFor(service, incidents, nowMs);
      const dayRows = [];
      for (let d = 0; d < days; d++) {
        const from = first + d * DAY;
        const to = Math.min(from + DAY, nowMs);
        let status = 'operational';
        for (const i of intervals) if (i.start < to && i.end > from) status = worst(status, i.impact);
        dayRows.push({ date: new Date(from).toISOString().slice(0, 10), status });
      }
      const windowMs = nowMs - first;
      const down = downtime(intervals, first, nowMs);
      return {
        id: service.id,
        name: service.name,
        uptimePercent: Math.round((1 - down / windowMs) * 100_000) / 1000,
        days: dayRows,
      };
    });
  return { days, services: rows };
}
