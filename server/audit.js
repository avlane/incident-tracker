// Append-only audit trail. Entries are never edited or deleted by the API.
// ids are zero-padded sequence numbers, so sorting by id is sorting by time.

function actorOf(user) {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

export function createAuditLog({ store, clock }) {
  function record({ actor = null, action, target = null, ip = null, meta = {} }) {
    const seq = store.nextSeq('audit');
    const entry = {
      id: String(seq).padStart(8, '0'),
      at: clock(),
      actor: actorOf(actor),
      action,
      target,
      ip,
      meta,
    };
    store.put('audit', entry);
    return entry;
  }

  // Newest first. `before` is an entry id, for paging back through history.
  function list({ action, actor, target, from, to, before, limit = 50 } = {}) {
    const rows = store
      .list('audit')
      .filter((e) => !action || e.action === action || e.action.startsWith(`${action}.`))
      .filter((e) => !actor || e.actor?.id === actor || e.actor?.email === actor)
      .filter((e) => !target || e.target === target)
      .filter((e) => !from || e.at >= from)
      .filter((e) => !to || e.at <= to)
      .filter((e) => !before || e.id < before)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    return { entries: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  return { record, list };
}
