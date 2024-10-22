import { badRequest } from '../errors.js';

export function registerAuditRoutes(router, { auditLog }) {
  router.get('/api/audit/verify', async () => ({ body: auditLog.verify() }));

  router.get('/api/audit', async ({ query }) => {
    const limit = query.get('limit') === null ? 50 : Number(query.get('limit'));
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw badRequest('limit must be an integer from 1 to 200');
    }
    for (const name of ['from', 'to']) {
      const value = query.get(name);
      if (value && Number.isNaN(Date.parse(value))) throw badRequest(`${name} must be a date`);
    }
    const iso = (name) => (query.get(name) ? new Date(query.get(name)).toISOString() : undefined);
    const result = auditLog.list({
      action: query.get('action') || undefined,
      actor: query.get('actor') || undefined,
      target: query.get('target') || undefined,
      from: iso('from'),
      to: iso('to'),
      before: query.get('before') || undefined,
      limit,
    });
    return { body: result };
  });
}
