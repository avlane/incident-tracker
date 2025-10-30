// Housekeeping for data that only matters for a while. What is *not* pruned:
// incidents, postmortems and the audit log. The audit log is hash-chained, so
// deleting old entries would look the same as tampering; if it ever needs
// trimming that should be a deliberate, separate tool.

const DAY = 86_400_000;

export function pruneStore(store, { now, deliveryDays = 30 }) {
  const nowMs = Date.parse(now);
  const result = { deliveries: 0, sessions: 0, tokens: 0 };

  store.transaction(() => {
    for (const d of store.list('deliveries')) {
      if (nowMs - Date.parse(d.createdAt) > deliveryDays * DAY && store.remove('deliveries', d.id)) result.deliveries++;
    }
    for (const s of store.list('sessions')) {
      if (Date.parse(s.expiresAt) <= nowMs && store.remove('sessions', s.id)) result.sessions++;
    }
    for (const t of store.list('tokens')) {
      if (t.expiresAt && Date.parse(t.expiresAt) <= nowMs && store.remove('tokens', t.id)) result.tokens++;
    }
  });
  return result;
}
