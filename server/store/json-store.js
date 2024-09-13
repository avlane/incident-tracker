import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// A document store kept in memory and mirrored to one JSON file.
//
// The interface is deliberately tiny (list / get / put / remove / nextSeq) and
// synchronous, so another backend can be dropped in behind it later. Writes go
// to a temporary file first and are renamed into place, so a crash in the
// middle of a write leaves the previous file intact.
//
// Everything handed in or out is cloned; callers can't change stored state by
// mutating what they were given.

export function createJsonStore({ path = null } = {}) {
  let data = { seq: {}, collections: {} };
  if (path && existsSync(path)) {
    data = JSON.parse(readFileSync(path, 'utf8'));
  }

  // While a transaction is open, writes stay in memory and the file is written
  // once when the outermost one commits.
  const snapshots = [];

  function flush() {
    if (!path || snapshots.length > 0) return;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path);
  }

  function collection(name) {
    data.collections[name] ??= {};
    return data.collections[name];
  }

  return {
    kind: 'json',

    list(name) {
      return Object.values(collection(name)).map((doc) => structuredClone(doc));
    },

    get(name, id) {
      const doc = collection(name)[id];
      return doc === undefined ? null : structuredClone(doc);
    },

    put(name, doc) {
      if (typeof doc.id !== 'string' || doc.id === '') {
        throw new TypeError('documents need a string id');
      }
      collection(name)[doc.id] = structuredClone(doc);
      flush();
      return doc;
    },

    remove(name, id) {
      const existed = id in collection(name);
      delete collection(name)[id];
      if (existed) flush();
      return existed;
    },

    nextSeq(name) {
      data.seq[name] = (data.seq[name] ?? 0) + 1;
      flush();
      return data.seq[name];
    },

    // Runs fn (synchronously) and undoes every write it made if it throws.
    // Transactions nest: an inner failure that the outer code catches rolls
    // back only the inner work.
    transaction(fn) {
      snapshots.push(structuredClone(data));
      let result;
      try {
        result = fn();
        if (result && typeof result.then === 'function') {
          throw new TypeError('transaction callbacks must be synchronous');
        }
      } catch (err) {
        data = snapshots.pop();
        throw err;
      }
      snapshots.pop();
      flush();
      return result;
    },

    // Whole-database copy, used by `cli.js migrate-store`.
    exportAll: () => structuredClone(data),

    importAll(dump) {
      for (const [name, docs] of Object.entries(dump.collections)) {
        for (const doc of Object.values(docs)) collection(name)[doc.id] = structuredClone(doc);
      }
      for (const [name, value] of Object.entries(dump.seq)) data.seq[name] = value;
      flush();
    },

    close() {},
  };
}
