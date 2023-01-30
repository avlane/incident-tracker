// Incident domain model. Everything here is a plain function over plain
// objects so it can be tested without a server or a store.

export const SEVERITIES = ['sev1', 'sev2', 'sev3', 'sev4'];
export const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
export const IMPACTS = ['degraded', 'partial_outage', 'major_outage'];

export function formatIncidentId(n) {
  return 'INC-' + String(n).padStart(4, '0');
}

export function isOpen(incident) {
  return incident.status !== 'resolved';
}

export function createIncident(input, { id, now }) {
  return {
    id,
    title: input.title,
    summary: input.summary ?? '',
    severity: input.severity,
    status: 'investigating',
    commander: input.commander ?? null,
    affected: input.affected ?? [],
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
}
