import { buildStatusPage } from '../statuspage.js';
import { buildAtomFeed } from '../statusfeed.js';

// Public, read-only. Deliberately has no dependency on anything else in the
// request, so it stays reachable if other parts of the API grow restrictions.
export function registerStatusRoutes(router, { store, clock, publicUrl }) {
  const page = () =>
    buildStatusPage({
      services: store.list('services'),
      incidents: store.list('incidents'),
      maintenance: store.list('maintenance'),
      now: clock(),
    });

  router.get('/api/status.atom', async () => ({
    text: buildAtomFeed(page(), { baseUrl: publicUrl }),
    contentType: 'application/atom+xml; charset=utf-8',
    headers: { 'cache-control': 'public, max-age=60' },
  }));

  router.get('/api/status', async () => {
    return { body: page(), headers: { 'cache-control': 'public, max-age=30' } };
  });
}
