import { conflict, notFound, unprocessable } from '../errors.js';
import { isOpen } from '../incidents.js';
import { createService, updateService } from '../services.js';
import { validateServiceInput } from '../validators.js';

export function registerServiceRoutes(router, { store, clock }) {
  function load(id) {
    const service = store.get('services', id);
    if (!service) throw notFound(`service ${id} not found`);
    return service;
  }

  router.get('/api/services', async () => {
    const services = store.list('services').sort((a, b) => a.name.localeCompare(b.name));
    return { body: { services } };
  });

  router.get('/api/services/:id', async ({ params }) => ({ body: { service: load(params.id) } }));

  router.post('/api/services', async (ctx) => {
    const { value, errors } = validateServiceInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    const takenIds = new Set(store.list('services').map((s) => s.id));
    const clash = store.list('services').find((s) => s.name.toLowerCase() === value.name.toLowerCase());
    if (clash) throw conflict(`a service named "${clash.name}" already exists`);
    const service = createService(value, { takenIds, now: clock() });
    store.put('services', service);
    ctx.audit('service.create', service.id, { name: service.name });
    return { status: 201, body: { service } };
  });

  router.patch('/api/services/:id', async (ctx) => {
    const service = load(ctx.params.id);
    const { value, errors } = validateServiceInput(await ctx.readBody(), { partial: true });
    if (errors.length > 0) throw unprocessable(errors);
    const next = updateService(service, value, { now: clock() });
    store.put('services', next);
    ctx.audit('service.update', next.id, { fields: Object.keys(value) });
    return { body: { service: next } };
  });

  router.delete('/api/services/:id', async (ctx) => {
    const service = load(ctx.params.id);
    const blocking = store
      .list('incidents')
      .filter((i) => isOpen(i) && i.affected.some((a) => a.serviceId === service.id));
    if (blocking.length > 0) {
      throw conflict(`service is affected by ${blocking.length} open incident(s)`);
    }
    store.remove('services', service.id);
    ctx.audit('service.delete', service.id, { name: service.name });
    return { status: 204, body: undefined };
  });
}
