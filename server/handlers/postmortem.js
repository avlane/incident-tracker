import { notFound } from '../errors.js';
import { generatePostmortem } from '../postmortem.js';

export function registerPostmortemRoutes(router, { store, clock }) {
  router.get('/api/incidents/:id/postmortem', async ({ params }) => {
    const incident = store.get('incidents', params.id);
    if (!incident) throw notFound(`incident ${params.id} not found`);
    const markdown = generatePostmortem(incident, { services: store.list('services'), now: clock() });
    return {
      text: markdown,
      contentType: 'text/markdown; charset=utf-8',
      headers: { 'content-disposition': `inline; filename="${incident.id}-postmortem.md"` },
    };
  });
}
