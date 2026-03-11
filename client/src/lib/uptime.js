import { COMPONENT_LABEL, statusClass } from './status.js';

// 99.5 -> "99.5%", 100 -> "100%", 99.9996 -> "99.999%" (never rounded up to a
// figure better than the truth: a service with any downtime does not show 100%).
export function formatUptime(percent) {
  if (!Number.isFinite(percent)) return 'n/a';
  if (percent >= 100) return '100%';
  const floored = Math.floor(percent * 1000) / 1000;
  return `${floored}%`;
}

// One bar per day. `title` is what a hover or screen reader announces.
export function dayBars(days) {
  return days.map((day) => ({
    date: day.date,
    className: statusClass(day.status),
    title: `${day.date}: ${COMPONENT_LABEL[day.status] ?? day.status}`,
  }));
}

// Joins uptime rows onto the service rows of the status page by id.
export function uptimeById(uptime) {
  return Object.fromEntries((uptime?.services ?? []).map((s) => [s.id, s]));
}
