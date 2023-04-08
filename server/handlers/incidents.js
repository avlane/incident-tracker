import { notFound, unprocessable } from '../errors.js';
import { createIncident, formatIncidentId } from '../incidents.js';
import { validateIncidentInput } from '../validators.js';

export function registerIncidentRoutes(router, { store, clock }) {
  function load(id) {
    const incident = store.get('incidents', id);
    if (!incident) throw notFound(`incident ${id} not found`);
    return incident;
  }

  router.post('/api/incidents', async (ctx) => {
    const { value, errors } = validateIncidentInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    const id = formatIncidentId(store.nextSeq('incident'));
    const incident = createIncident(value, { id, now: clock() });
    store.put('incidents', incident);
    return { status: 201, body: { incident } };
  });

  router.get('/api/incidents', async () => {
    const incidents = store
      .list('incidents')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return { body: { incidents, total: incidents.length } };
  });

  router.get('/api/incidents/:id', async ({ params }) => {
    return { body: { incident: load(params.id) } };
  });
}
