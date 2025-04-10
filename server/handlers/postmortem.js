import { notFound, unprocessable } from '../errors.js';
import { generatePostmortem } from '../postmortem.js';
import { validatePostmortemInput } from '../validators.js';

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

  // Replaces the whole written postmortem; the generated Markdown picks it up.
  router.put('/api/incidents/:id/postmortem', async (ctx) => {
    const incident = store.get('incidents', ctx.params.id);
    if (!incident) throw notFound(`incident ${ctx.params.id} not found`);
    const { value, errors } = validatePostmortemInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    const next = {
      ...incident,
      postmortem: { ...value, updatedAt: clock(), updatedBy: ctx.user?.name ?? null },
    };
    store.transaction(() => {
      store.put('incidents', next);
      ctx.audit('postmortem.update', next.id, { actionItems: value.actionItems.length });
    });
    return { body: { postmortem: next.postmortem } };
  });
}
