import { randomBytes } from 'node:crypto';
import { notFound, unprocessable } from '../errors.js';
import { validateWebhookInput } from '../validators.js';
import { generateSecret } from '../webhooks.js';

// The secret is shown once, when it is created or rotated, and never again.
function present(webhook, { withSecret = false } = {}) {
  const { secret, ...rest } = webhook;
  return withSecret ? { ...rest, secret } : { ...rest, secretHint: `...${secret.slice(-4)}` };
}

export function registerWebhookRoutes(router, { store, clock, webhookPolicy, dispatcher }) {
  function load(id) {
    const webhook = store.get('webhooks', id);
    if (!webhook) throw notFound(`webhook ${id} not found`);
    return webhook;
  }

  router.get('/api/webhooks', async () => ({
    body: { webhooks: store.list('webhooks').map((w) => present(w)) },
  }));

  router.post('/api/webhooks', async (ctx) => {
    const { value, errors } = validateWebhookInput(await ctx.readBody(), webhookPolicy);
    if (errors.length > 0) throw unprocessable(errors);
    const webhook = {
      id: `wh_${randomBytes(6).toString('hex')}`,
      url: value.url,
      description: value.description ?? '',
      events: value.events ?? [],
      active: value.active ?? true,
      secret: generateSecret(),
      createdAt: clock(),
    };
    store.put('webhooks', webhook);
    ctx.audit('webhook.create', webhook.id, { url: webhook.url });
    return { status: 201, body: { webhook: present(webhook, { withSecret: true }) } };
  });

  router.patch('/api/webhooks/:id', async (ctx) => {
    const webhook = load(ctx.params.id);
    const { value, errors } = validateWebhookInput(await ctx.readBody(), { ...webhookPolicy, partial: true });
    if (errors.length > 0) throw unprocessable(errors);
    const next = { ...webhook, ...value };
    store.put('webhooks', next);
    ctx.audit('webhook.update', next.id, { fields: Object.keys(value) });
    return { body: { webhook: present(next) } };
  });

  router.post('/api/webhooks/:id/rotate-secret', async (ctx) => {
    const next = { ...load(ctx.params.id), secret: generateSecret() };
    store.put('webhooks', next);
    ctx.audit('webhook.rotate_secret', next.id);
    return { body: { webhook: present(next, { withSecret: true }) } };
  });

  // Most recent first. Request and response bodies are never stored, only
  // status codes and error text, so a receiver's data can't end up here.
  router.get('/api/webhooks/:id/deliveries', async ({ params }) => {
    load(params.id);
    const deliveries = store
      .list('deliveries')
      .filter((d) => d.webhookId === params.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 50);
    return { body: { deliveries } };
  });

  router.post('/api/webhooks/:id/test', async (ctx) => {
    const delivery = await dispatcher.sendTest(load(ctx.params.id));
    ctx.audit('webhook.test', ctx.params.id, { state: delivery.state });
    return { body: { delivery } };
  });

  router.delete('/api/webhooks/:id', async (ctx) => {
    load(ctx.params.id);
    store.remove('webhooks', ctx.params.id);
    ctx.audit('webhook.delete', ctx.params.id);
    return { status: 204 };
  });
}
