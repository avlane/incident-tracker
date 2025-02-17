import { badRequest } from '../errors.js';
import { computeMetrics } from '../metrics.js';

const DAY = 86_400_000;

export function registerMetricsRoutes(router, { store, clock }) {
  // Defaults to the last 30 days. `to` is inclusive; ranges are capped at a year
  // so one request can't walk the whole history week by week.
  router.get('/api/metrics', async ({ query }) => {
    const now = Date.parse(clock());
    const parse = (name, fallback) => {
      const raw = query.get(name);
      if (raw === null || raw === '') return fallback;
      const t = Date.parse(raw);
      if (Number.isNaN(t)) throw badRequest(`${name} must be a date`);
      return t;
    };
    const to = parse('to', now);
    const from = parse('from', to - 30 * DAY);
    if (from > to) throw badRequest('from must not be after to');
    if (to - from > 366 * DAY) throw badRequest('the range may not be longer than 366 days');
    const metrics = computeMetrics(store.list('incidents'), {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    return { body: { metrics } };
  });
}
