import { collectActionItems } from '../actionitems.js';

export function registerActionItemRoutes(router, { store, clock }) {
  router.get('/api/action-items', async ({ query }) => {
    const items = collectActionItems(store.list('incidents'), {
      owner: query.get('owner') || undefined,
      overdueOnly: query.get('overdue') === 'true',
      now: clock(),
    });
    return { body: { items, total: items.length } };
  });
}
