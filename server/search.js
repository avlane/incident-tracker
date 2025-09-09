import { SEVERITIES, STATUSES, isOpen } from './incidents.js';

// Filtering, searching and ordering of incident lists.
//
// parseFilters turns query parameters into a filter object (or errors), and
// filterIncidents applies one to a list. Both are pure.

const SORTS = ['created', 'updated', 'severity'];
const MAX_LIMIT = 200;

function listParam(params, name, allowed, errors) {
  const raw = params.get(name);
  if (raw === null || raw === '') return undefined;
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
  const bad = values.filter((v) => !allowed.includes(v));
  if (bad.length > 0) errors.push({ field: name, message: `unknown ${name}: ${bad.join(', ')}` });
  return values;
}

function dateParam(params, name, errors) {
  const raw = params.get(name);
  if (raw === null || raw === '') return undefined;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) {
    errors.push({ field: name, message: `${name} must be a date` });
    return undefined;
  }
  return t;
}

function intParam(params, name, fallback, { min, max }, errors) {
  const raw = params.get(name);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push({ field: name, message: `${name} must be an integer from ${min} to ${max}` });
    return fallback;
  }
  return n;
}

export function parseFilters(params) {
  const errors = [];
  const filters = {
    q: (params.get('q') ?? '').trim(),
    severity: listParam(params, 'severity', SEVERITIES, errors),
    status: listParam(params, 'status', STATUSES, errors),
    service: params.get('service') || undefined,
    // every label listed must be present
    label: (params.get('label') ?? '').split(',').map((l) => l.trim().toLowerCase()).filter(Boolean),
    from: dateParam(params, 'from', errors),
    to: dateParam(params, 'to', errors),
    limit: intParam(params, 'limit', 50, { min: 1, max: MAX_LIMIT }, errors),
    offset: intParam(params, 'offset', 0, { min: 0, max: 1_000_000 }, errors),
  };
  const open = params.get('open');
  if (open === 'true') filters.open = true;
  else if (open === 'false') filters.open = false;
  else if (open !== null && open !== '') errors.push({ field: 'open', message: 'open must be true or false' });

  const sort = params.get('sort') ?? '-created';
  const key = sort.replace(/^-/, '');
  if (!SORTS.includes(key)) errors.push({ field: 'sort', message: `sort must be one of ${SORTS.join(', ')}` });
  filters.sort = key;
  filters.descending = sort.startsWith('-');
  return { filters, errors };
}

function haystack(incident) {
  const parts = [incident.id, incident.title, incident.summary, incident.commander ?? '', ...(incident.labels ?? [])];
  for (const update of incident.updates) parts.push(update.message);
  return parts.join('\n').toLowerCase();
}

function compare(key) {
  switch (key) {
    case 'severity':
      return (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (a.createdAt < b.createdAt ? -1 : 1);
    case 'updated':
      return (a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0);
    default:
      return (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
  }
}

export function matchesFilters(incident, filters) {
  if (filters.severity && !filters.severity.includes(incident.severity)) return false;
  if (filters.status && !filters.status.includes(incident.status)) return false;
  if (filters.open !== undefined && isOpen(incident) !== filters.open) return false;
  if (filters.label?.length > 0 && !filters.label.every((l) => (incident.labels ?? []).includes(l))) return false;
  if (filters.service && !incident.affected.some((a) => a.serviceId === filters.service)) return false;
  const created = Date.parse(incident.createdAt);
  if (filters.from !== undefined && created < filters.from) return false;
  if (filters.to !== undefined && created > filters.to) return false;
  if (filters.q) {
    const text = haystack(incident);
    for (const term of filters.q.toLowerCase().split(/\s+/)) {
      if (!text.includes(term)) return false;
    }
  }
  return true;
}

export function filterIncidents(incidents, filters) {
  const matched = incidents.filter((i) => matchesFilters(i, filters));
  const order = compare(filters.sort ?? 'created');
  matched.sort(filters.descending === false ? order : (a, b) => order(b, a));
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  return { items: matched.slice(offset, offset + limit), total: matched.length };
}
