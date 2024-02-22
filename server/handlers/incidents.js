import { badRequest, conflict, notFound, unprocessable } from '../errors.js';
import { canTransition, createIncident, formatIncidentId, incidentReducer } from '../incidents.js';
import { whoIsOnCall } from '../oncall.js';
import { filterIncidents, parseFilters } from '../search.js';
import { validateIncidentInput, validateUpdateInput } from '../validators.js';

export function registerIncidentRoutes(router, { store, clock }) {
  function load(id) {
    const incident = store.get('incidents', id);
    if (!incident) throw notFound(`incident ${id} not found`);
    return incident;
  }

  // Every affected entry must point at a real service (and component, if given).
  function checkAffected(affected = []) {
    const errors = [];
    affected.forEach((entry, i) => {
      const service = store.get('services', entry.serviceId);
      if (!service) {
        errors.push({ field: `affected[${i}]`, message: `unknown service ${entry.serviceId}` });
      } else if (entry.componentId && !service.components.some((c) => c.id === entry.componentId)) {
        errors.push({ field: `affected[${i}]`, message: `${service.id} has no component ${entry.componentId}` });
      }
    });
    if (errors.length > 0) throw unprocessable(errors);
  }

  router.post('/api/incidents', async (ctx) => {
    const { value, errors } = validateIncidentInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    checkAffected(value.affected);
    const id = formatIncidentId(store.nextSeq('incident'));
    const now = clock();
    if (!value.commander) {
      const first = store.list('oncall').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
      const current = first ? whoIsOnCall(first, now) : null;
      if (current) value.commander = current.who;
    }
    const incident = createIncident(value, { id, now });
    store.put('incidents', incident);
    return { status: 201, body: { incident } };
  });

  router.get('/api/incidents', async ({ query }) => {
    const { filters, errors } = parseFilters(query);
    if (errors.length > 0) throw badRequest('invalid query', errors);
    const { items, total } = filterIncidents(store.list('incidents'), filters);
    return { body: { incidents: items, total, limit: filters.limit, offset: filters.offset } };
  });

  router.get('/api/incidents/:id', async ({ params }) => {
    return { body: { incident: load(params.id) } };
  });

  router.post('/api/incidents/:id/updates', async (ctx) => {
    const incident = load(ctx.params.id);
    const { value, errors } = validateUpdateInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    if (value.status && !canTransition(incident.status, value.status)) {
      throw conflict(`cannot move from ${incident.status} to ${value.status}; reopen it with investigating first`);
    }
    const next = incidentReducer(incident, {
      type: 'post_update',
      at: clock(),
      ...value,
      author: ctx.user?.name ?? value.author,
    });
    store.put('incidents', next);
    return { status: 201, body: { incident: next } };
  });
}
