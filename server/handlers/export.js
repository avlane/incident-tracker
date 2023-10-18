import { badRequest } from '../errors.js';
import { INCIDENT_COLUMNS, toCsv } from '../csv.js';
import { filterIncidents, parseFilters } from '../search.js';

export function registerExportRoutes(router, { store }) {
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
}
