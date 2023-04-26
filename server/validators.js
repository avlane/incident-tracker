import { IMPACTS, SEVERITIES, STATUSES } from './incidents.js';

// Validators return { value, errors }. `value` is the cleaned input and is
// only meaningful when `errors` is empty.

function text(input, field, { required = false, max = 200 } = {}, errors) {
  const raw = input[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (typeof raw !== 'string') {
    errors.push({ field, message: `${field} must be a string` });
    return undefined;
  }
  const value = raw.trim();
  if (required && value === '') {
    errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (value.length > max) {
    errors.push({ field, message: `${field} must be at most ${max} characters` });
    return undefined;
  }
  return value;
}

function affectedList(input, errors) {
  if (input.affected === undefined) return undefined;
  if (!Array.isArray(input.affected) || input.affected.length > 20) {
    errors.push({ field: 'affected', message: 'affected must be a list of at most 20 entries' });
    return undefined;
  }
  const out = [];
  input.affected.forEach((entry, i) => {
    const ok =
      entry &&
      typeof entry.serviceId === 'string' &&
      entry.serviceId !== '' &&
      IMPACTS.includes(entry.impact);
    if (!ok) {
      errors.push({
        field: `affected[${i}]`,
        message: `needs a serviceId and an impact of ${IMPACTS.join(', ')}`,
      });
      return;
    }
    out.push({ serviceId: entry.serviceId, impact: entry.impact });
  });
  return out;
}

export function validateIncidentInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.title = text(input, 'title', { required: true, max: 140 }, errors);
  value.summary = text(input, 'summary', { max: 2000 }, errors);
  value.commander = text(input, 'commander', { max: 80 }, errors);
  if (!SEVERITIES.includes(input.severity)) {
    errors.push({ field: 'severity', message: `severity must be one of ${SEVERITIES.join(', ')}` });
  } else {
    value.severity = input.severity;
  }
  value.affected = affectedList(input, errors);
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}

export function validateUpdateInput(input) {
  const errors = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ field: '', message: 'body must be an object' }] };
  }
  const value = {};
  value.message = text(input, 'message', { required: true, max: 2000 }, errors);
  value.author = text(input, 'author', { max: 80 }, errors);
  if (input.status !== undefined) {
    if (STATUSES.includes(input.status)) value.status = input.status;
    else errors.push({ field: 'status', message: `status must be one of ${STATUSES.join(', ')}` });
  }
  if (input.severity !== undefined) {
    if (SEVERITIES.includes(input.severity)) value.severity = input.severity;
    else errors.push({ field: 'severity', message: `severity must be one of ${SEVERITIES.join(', ')}` });
  }
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return { value, errors };
}
