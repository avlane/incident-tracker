import { createHash } from 'node:crypto';

// Append-only audit trail. Entries are never edited or deleted by the API.
// ids are zero-padded sequence numbers, so sorting by id is sorting by time.
//
// Each entry also carries `prev` (the hash of the entry before it) and `hash`
// (SHA-256 over prev plus the entry's own fields). Editing or removing an
// entry in the database breaks the chain from that point on, and verify()
// reports where. This detects tampering after the fact; it does not stop
// someone with write access to the database from rewriting the whole chain.

const GENESIS = '0'.repeat(64);

// JSON with object keys sorted, so the same entry always hashes the same way
// no matter how the store orders keys.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function entryHash(entry) {
  const { hash, ...rest } = entry; // eslint-disable-line no-unused-vars
  return createHash('sha256').update(canonical(rest)).digest('hex');
}

function actorOf(user) {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

export function createAuditLog({ store, clock }) {
  function record({ actor = null, action, target = null, ip = null, meta = {} }) {
    return store.transaction(() => {
      const seq = store.nextSeq('audit');
      const head = store.get('meta', 'audit-head');
      const entry = {
        id: String(seq).padStart(8, '0'),
        at: clock(),
        actor: actorOf(actor),
        action,
        target,
        ip,
        meta,
        prev: head?.hash ?? GENESIS,
      };
      entry.hash = entryHash(entry);
      store.put('audit', entry);
      store.put('meta', { id: 'audit-head', hash: entry.hash, entryId: entry.id });
      return entry;
    });
  }

  // Walks the whole chain. Entries written before chaining existed have no
  // hash and are skipped; the chain starts at the first one that has one.
  function verify() {
    const entries = store.list('audit').sort((a, b) => (a.id < b.id ? -1 : 1));
    let prev = null;
    let checked = 0;
    for (const entry of entries) {
      if (!entry.hash) continue;
      if (prev !== null && entry.prev !== prev) return { ok: false, checked, firstBadId: entry.id, reason: 'chain broken: an earlier entry was removed or changed' };
      if (entryHash(entry) !== entry.hash) return { ok: false, checked, firstBadId: entry.id, reason: 'entry contents do not match their hash' };
      prev = entry.hash;
      checked++;
    }
    const head = store.get('meta', 'audit-head');
    if (head && head.hash !== prev) return { ok: false, checked, firstBadId: head.entryId, reason: 'the newest entries are missing' };
    return { ok: true, checked };
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

  return { record, list, verify };
}
