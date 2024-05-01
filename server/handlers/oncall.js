import { notFound, unprocessable } from '../errors.js';
import { addOverride, createSchedule, upcomingShifts, whoIsOnCall } from '../oncall.js';
import { validateOverrideInput, validateScheduleInput } from '../validators.js';
import { slugify } from '../services.js';

export function registerOnCallRoutes(router, { store, clock }) {
  function load(id) {
    const schedule = store.get('oncall', id);
    if (!schedule) throw notFound(`schedule ${id} not found`);
    return schedule;
  }

  function present(schedule, now) {
    return { ...schedule, current: whoIsOnCall(schedule, now), upcoming: upcomingShifts(schedule, now, 4) };
  }

  router.get('/api/oncall', async () => {
    const now = clock();
    const schedules = store
      .list('oncall')
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((s) => present(s, now));
    return { body: { schedules } };
  });

  router.get('/api/oncall/:id', async ({ params }) => ({ body: { schedule: present(load(params.id), clock()) } }));

  router.post('/api/oncall', async (ctx) => {
    const { value, errors } = validateScheduleInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    let id = slugify(value.name) || 'schedule';
    while (store.get('oncall', id)) id += '-2';
    const now = clock();
    const schedule = createSchedule(value, { id, now });
    store.put('oncall', schedule);
    ctx.audit('oncall.create', schedule.id, { members: schedule.members });
    return { status: 201, body: { schedule: present(schedule, now) } };
  });

  router.post('/api/oncall/:id/overrides', async (ctx) => {
    const schedule = load(ctx.params.id);
    const { value, errors } = validateOverrideInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    const next = addOverride(schedule, value);
    store.put('oncall', next);
    ctx.audit('oncall.override', next.id, value);
    return { status: 201, body: { schedule: present(next, clock()) } };
  });

  router.delete('/api/oncall/:id', async (ctx) => {
    load(ctx.params.id);
    store.remove('oncall', ctx.params.id);
    ctx.audit('oncall.delete', ctx.params.id);
    return { status: 204 };
  });
}
