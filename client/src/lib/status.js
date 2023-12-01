export const COMPONENT_LABEL = {
  operational: 'Operational',
  degraded: 'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
};

// Colour class for a status; kept here so it is testable and shared.
export function statusClass(status) {
  return COMPONENT_LABEL[status] ? `st-${status}` : 'st-unknown';
}

export function describeAffected(entry) {
  return entry.component ? `${entry.service} / ${entry.component}` : entry.service;
}
