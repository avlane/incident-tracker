import { buildStatusPage } from '../statuspage.js';
import { buildAtomFeed } from '../statusfeed.js';
import { buildUptime } from '../uptime.js';

// Public, read-only. Deliberately has no dependency on anything else in the
// request, so it stays reachable if other parts of the API grow restrictions.
export function registerStatusRoutes(router, { store, clock, publicUrl, statusCache }) {
  const build = () =>
    buildStatusPage({
      services: store.list('services'),
      incidents: store.list('incidents'),
      maintenance: store.list('maintenance'),
      now: clock(),
    });

  // The page and the uptime numbers are computed together and kept for a few
  // seconds. Any successful write clears the cache (see app.js), so changes
  // still show up straight away.
  const page = () =>
    statusCache.getOrCompute('status', () => {
      const uptime = buildUptime({
        services: store.list('services'),
        incidents: store.list('incidents'),
        now: clock(),
      });
      return { ...build(), uptime };
    });

  router.get('/api/status.atom', async () => ({
    text: buildAtomFeed(page(), { baseUrl: publicUrl }),
    contentType: 'application/atom+xml; charset=utf-8',
    headers: { 'cache-control': 'public, max-age=60' },
  }));

  router.get('/api/status', async () => ({ body: page(), headers: { 'cache-control': 'public, max-age=30' } }));
}
