// "1h 20m", "45s", "2d 3h". Shows at most the two largest non-zero units.
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

// 2023-07-08T14:05:59.000Z -> "2023-07-08 14:05"
export function formatUtc(iso) {
  return iso.slice(0, 16).replace('T', ' ');
}
