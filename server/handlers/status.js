import { buildStatusPage } from '../statuspage.js';

// Public, read-only. Deliberately has no dependency on anything else in the
// request, so it stays reachable if other parts of the API grow restrictions.
export function registerStatusRoutes(router, { store, clock }) {
  router.get('/api/status', async () => {
    const page = buildStatusPage({
      services: store.list('services'),
      incidents: store.list('incidents'),
      now: clock(),
    });
    return { body: page, headers: { 'cache-control': 'public, max-age=30' } };
  });
}
