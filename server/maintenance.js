// Scheduled maintenance windows. A window is "scheduled" before it starts,
// "active" while it runs and "completed" afterwards; cancelling one is a flag,
// not a delete, so the history of what was announced is kept.

export const MAX_WINDOW_MS = 7 * 86_400_000;

export function maintenanceState(window, nowIso) {
  if (window.canceled) return 'canceled';
  const now = Date.parse(nowIso);
  if (now < Date.parse(window.startsAt)) return 'scheduled';
  if (now < Date.parse(window.endsAt)) return 'active';
  return 'completed';
}

export function createMaintenance(input, { id, now }) {
  return {
    id,
    title: input.title,
    message: input.message ?? '',
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    affected: input.affected ?? [],
    canceled: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateMaintenance(window, input, { now }) {
  return { ...window, ...input, updatedAt: now };
}
