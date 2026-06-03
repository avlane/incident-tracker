import { randomBytes } from 'node:crypto';
import { notFound, unprocessable } from '../errors.js';
import { createTemplate, updateTemplate } from '../templates.js';
import { validateTemplateInput } from '../validators.js';

export function registerTemplateRoutes(router, { store, clock }) {
  function load(id) {
    const template = store.get('templates', id);
    if (!template) throw notFound(`template ${id} not found`);
    return template;
  }

  router.get('/api/templates', async () => ({
    body: { templates: store.list('templates').sort((a, b) => a.name.localeCompare(b.name)) },
  }));

  router.post('/api/templates', async (ctx) => {
    const { value, errors } = validateTemplateInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    const template = createTemplate(value, { id: `tpl_${randomBytes(5).toString('hex')}`, now: clock() });
    store.transaction(() => {
      store.put('templates', template);
      ctx.audit('template.create', template.id, { name: template.name });
    });
    return { status: 201, body: { template } };
  });

  router.patch('/api/templates/:id', async (ctx) => {
    const template = load(ctx.params.id);
    const { value, errors } = validateTemplateInput(await ctx.readBody(), { partial: true });
    if (errors.length > 0) throw unprocessable(errors);
    const next = updateTemplate(template, value, { now: clock() });
    store.transaction(() => {
      store.put('templates', next);
      ctx.audit('template.update', next.id, { fields: Object.keys(value) });
    });
    return { body: { template: next } };
  });

  router.delete('/api/templates/:id', async (ctx) => {
    load(ctx.params.id);
    store.transaction(() => {
      store.remove('templates', ctx.params.id);
      ctx.audit('template.delete', ctx.params.id);
    });
    return { status: 204 };
  });
}
