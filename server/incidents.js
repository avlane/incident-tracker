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

// A resolved incident can only be reopened (back to investigating); it can't
// jump straight to identified or monitoring. Staying in the same status is
// always fine, so a plain update doesn't need to repeat the status.
export function canTransition(from, to) {
  if (from === to) return true;
  if (from === 'resolved') return to === 'investigating';
  return STATUSES.includes(to);
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
    // Incidents are shown on the public status page unless marked otherwise.
    public: input.public ?? true,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    updates: [
      {
        id: 1,
        at: now,
        kind: 'opened',
        author: input.commander ?? null,
        status: 'investigating',
        severity: input.severity,
        visibility: 'public',
        message: input.summary || 'Incident opened.',
      },
    ],
  };
}

// The reducer takes an incident and an action and returns a new incident.
// It never mutates its input and never reads the clock: timestamps arrive on
// the action, which keeps it trivial to test and to replay.
//
//   { type: 'post_update', at, author, message, status?, severity?, visibility? }
//   { type: 'assign', at, commander }
export function incidentReducer(incident, action) {
  switch (action.type) {
    case 'post_update': {
      const status = action.status ?? incident.status;
      const severity = action.severity ?? incident.severity;
      const update = {
        id: incident.updates.length + 1,
        at: action.at,
        kind: 'update',
        author: action.author ?? null,
        status,
        severity,
        visibility: action.visibility ?? 'public',
        message: action.message,
      };
      return {
        ...incident,
        status,
        severity,
        updatedAt: action.at,
        resolvedAt: status === 'resolved' ? (incident.resolvedAt ?? action.at) : null,
        updates: [...incident.updates, update],
      };
    }
    case 'assign':
      return { ...incident, commander: action.commander, updatedAt: action.at };
    default:
      throw new Error(`unknown incident action: ${action.type}`);
  }
}
