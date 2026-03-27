import { parseRangeEnd, parseRangeStart } from '../dates.js';
import { badRequest } from '../errors.js';
import { AUDIT_COLUMNS, INCIDENT_COLUMNS, toCsv } from '../csv.js';
import { filterIncidents, parseFilters } from '../search.js';

export function registerExportRoutes(router, { store, auditLog }) {
  // Same filters as the list endpoint, but no paging: you get every match.
  router.get('/api/export/incidents.csv', async ({ query }) => {
    const { filters, errors } = parseFilters(query);
    if (errors.length > 0) throw badRequest('invalid query', errors);
    const { items } = filterIncidents(store.list('incidents'), { ...filters, limit: Number.MAX_SAFE_INTEGER, offset: 0 });
    return {
      text: toCsv(items, INCIDENT_COLUMNS),
      contentType: 'text/csv; charset=utf-8',
      headers: { 'content-disposition': 'attachment; filename="incidents.csv"' },
    };
  });

  // Oldest first, so the file reads like the log. Capped so one request can't
  // pull an unbounded history into memory; narrow with from/to for more.
  router.get('/api/export/audit.csv', async ({ query }) => {
    for (const name of ['from', 'to']) {
      if (query.get(name) && Number.isNaN(Date.parse(query.get(name)))) throw badRequest(`${name} must be a date`);
    }
    const iso = (name, parse) => (query.get(name) ? new Date(parse(query.get(name))).toISOString() : undefined);
    const { entries } = auditLog.list({
      action: query.get('action') || undefined,
      actor: query.get('actor') || undefined,
      target: query.get('target') || undefined,
      from: iso('from', parseRangeStart),
      to: iso('to', parseRangeEnd),
      limit: 10_000,
    });
    return {
      text: toCsv(entries.reverse(), AUDIT_COLUMNS),
      contentType: 'text/csv; charset=utf-8',
      headers: { 'content-disposition': 'attachment; filename="audit.csv"' },
    };
  });
}
