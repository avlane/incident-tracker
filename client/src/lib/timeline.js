import { formatDuration } from './format.js';
import { STATUSES } from './labels.js';

// Annotates each update with how long after the incident opened it landed and
// whether it changed the status or severity compared with the update before.
export function buildTimeline(incident) {
  const start = Date.parse(incident.createdAt);
  return incident.updates.map((update, i) => {
    const prev = incident.updates[i - 1];
    return {
      ...update,
      offset: i === 0 ? 'start' : `+${formatDuration(Date.parse(update.at) - start)}`,
      statusChanged: prev ? prev.status !== update.status : false,
      severityChanged: prev ? prev.severity !== update.severity : false,
    };
  });
}

// Mirrors the server: a resolved incident can only be reopened.
export function allowedStatuses(current) {
  return current === 'resolved' ? ['resolved', 'investigating'] : STATUSES;
}

export function emptyUpdateForm(incident) {
  return { message: '', status: incident.status, severity: incident.severity, author: '' };
}

export function toUpdatePayload(values, incident) {
  const payload = { message: values.message.trim() };
  if (values.status !== incident.status) payload.status = values.status;
  if (values.severity !== incident.severity) payload.severity = values.severity;
  if (values.author.trim()) payload.author = values.author.trim();
  return payload;
}
