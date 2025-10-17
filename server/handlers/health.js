const startedAt = Date.now();

// For load balancers and uptime checks: 200 only if the store answers.
export function registerHealthRoutes(router, { store }) {
  router.get('/healthz', async () => {
    try {
      store.get('meta', 'health-probe');
    } catch {
      return { status: 503, body: { ok: false, store: store.kind } };
    }
    return { body: { ok: true, store: store.kind, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) } };
  });
}
