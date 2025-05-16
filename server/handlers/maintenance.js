import { randomBytes } from 'node:crypto';
import { notFound, unprocessable } from '../errors.js';
import { createMaintenance, maintenanceState, updateMaintenance, MAX_WINDOW_MS } from '../maintenance.js';
import { validateMaintenanceInput } from '../validators.js';

export function registerMaintenanceRoutes(router, { store, clock }) {
  function load(id) {
    const window = store.get('maintenance', id);
    if (!window) throw notFound(`maintenance window ${id} not found`);
    return window;
  }

  const present = (window) => ({ ...window, state: maintenanceState(window, clock()) });

  function checkAffected(affected = []) {
    const errors = [];
    affected.forEach((entry, i) => {
      const service = store.get('services', entry.serviceId);
      if (!service) errors.push({ field: `affected[${i}]`, message: `unknown service ${entry.serviceId}` });
      else if (entry.componentId && !service.components.some((c) => c.id === entry.componentId)) {
        errors.push({ field: `affected[${i}]`, message: `${service.id} has no component ${entry.componentId}` });
      }
    });
    if (errors.length > 0) throw unprocessable(errors);
  }

  router.get('/api/maintenance', async ({ query }) => {
    const state = query.get('state');
    let windows = store.list('maintenance').map(present).sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));
    if (state) windows = windows.filter((w) => w.state === state);
    return { body: { maintenance: windows } };
  });

  router.get('/api/maintenance/:id', async ({ params }) => ({ body: { maintenance: present(load(params.id)) } }));

  router.post('/api/maintenance', async (ctx) => {
    const { value, errors } = validateMaintenanceInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    checkAffected(value.affected);
    const window = createMaintenance(value, { id: `mnt_${randomBytes(5).toString('hex')}`, now: clock() });
    store.transaction(() => {
      store.put('maintenance', window);
      ctx.audit('maintenance.create', window.id, { title: window.title, startsAt: window.startsAt });
    });
    return { status: 201, body: { maintenance: present(window) } };
  });

  // Reschedule, edit or cancel. A window that has already finished is history
  // and can't be changed.
  router.patch('/api/maintenance/:id', async (ctx) => {
    const window = load(ctx.params.id);
    if (maintenanceState(window, clock()) === 'completed') {
      throw unprocessable([{ field: '', message: 'a completed maintenance window cannot be changed' }]);
    }
    const { value, errors } = validateMaintenanceInput(await ctx.readBody(), { partial: true });
    if (errors.length > 0) throw unprocessable(errors);
    checkAffected(value.affected);
    const next = updateMaintenance(window, value, { now: clock() });
    if (Date.parse(next.endsAt) <= Date.parse(next.startsAt) || Date.parse(next.endsAt) - Date.parse(next.startsAt) > MAX_WINDOW_MS) {
      throw unprocessable([{ field: 'endsAt', message: 'the window must end after it starts and last at most 7 days' }]);
    }
    store.transaction(() => {
      store.put('maintenance', next);
      ctx.audit(value.canceled ? 'maintenance.cancel' : 'maintenance.update', next.id, { fields: Object.keys(value) });
    });
    return { body: { maintenance: present(next) } };
  });
}
