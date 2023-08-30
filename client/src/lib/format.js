export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && parts.length < 2) parts.push(`${minutes}m`);
  return parts.slice(0, 2).join(' ') || '0m';
}

export function relativeTime(iso, nowMs = Date.now()) {
  const diff = nowMs - Date.parse(iso);
  if (diff < 0) return 'in the future';
  if (diff < 45_000) return 'just now';
  return `${formatDuration(diff)} ago`;
}

export function incidentDuration(incident, nowMs = Date.now()) {
  const end = incident.resolvedAt ? Date.parse(incident.resolvedAt) : nowMs;
  return formatDuration(end - Date.parse(incident.createdAt));
}
