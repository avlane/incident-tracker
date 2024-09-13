import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrations.js';

// The same small interface as the JSON store, on top of node:sqlite.
//
// node:sqlite is built into Node 22.5 and newer (behind --experimental-sqlite
// until 22.13). To keep this file loadable on older Nodes, the DatabaseSync
// class is passed in by the caller, which imports it lazily.
//
// Documents are stored as JSON text in one table. That keeps the two stores
// interchangeable; it gives up SQL-level querying in exchange.

export function createSqliteStore({ DatabaseSync, path = ':memory:' }) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  migrate(db);

  const statements = {
    list: db.prepare('SELECT doc FROM docs WHERE collection = ? ORDER BY n'),
    get: db.prepare('SELECT doc FROM docs WHERE collection = ? AND id = ?'),
    // Upsert keeps the original row position, so list order stays insertion order.
    put: db.prepare(
      'INSERT INTO docs (collection, id, doc) VALUES (?, ?, ?) ON CONFLICT (collection, id) DO UPDATE SET doc = excluded.doc',
    ),
    remove: db.prepare('DELETE FROM docs WHERE collection = ? AND id = ?'),
    seq: db.prepare(
      'INSERT INTO seq (name, value) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET value = value + 1 RETURNING value',
    ),
  };

  let depth = 0;

  return {
    kind: 'sqlite',

    // Runs fn (synchronously) and undoes every write it made if it throws.
    // The outermost level is a real transaction, inner levels are savepoints.
    transaction(fn) {
      const begin = depth === 0 ? 'BEGIN' : `SAVEPOINT sp${depth}`;
      const commit = depth === 0 ? 'COMMIT' : `RELEASE sp${depth}`;
      const rollback = depth === 0 ? 'ROLLBACK' : `ROLLBACK TO sp${depth}; RELEASE sp${depth}`;
      db.exec(begin);
      depth++;
      try {
        const result = fn();
        if (result && typeof result.then === 'function') {
          throw new TypeError('transaction callbacks must be synchronous');
        }
        depth--;
        db.exec(commit);
        return result;
      } catch (err) {
        depth--;
        db.exec(rollback);
        throw err;
      }
    },

    list: (name) => statements.list.all(name).map((row) => JSON.parse(row.doc)),

    get(name, id) {
      const row = statements.get.get(name, id);
      return row ? JSON.parse(row.doc) : null;
    },

    put(name, doc) {
      if (typeof doc.id !== 'string' || doc.id === '') {
        throw new TypeError('documents need a string id');
      }
      statements.put.run(name, doc.id, JSON.stringify(doc));
      return doc;
    },

    remove: (name, id) => statements.remove.run(name, id).changes > 0,

    nextSeq: (name) => statements.seq.get(name).value,

    exportAll() {
      const dump = { seq: {}, collections: {} };
      for (const row of db.prepare('SELECT collection, doc FROM docs ORDER BY n').all()) {
        const doc = JSON.parse(row.doc);
        (dump.collections[row.collection] ??= {})[doc.id] = doc;
      }
      for (const row of db.prepare('SELECT name, value FROM seq').all()) dump.seq[row.name] = row.value;
      return dump;
    },

    // All or nothing: a failure part-way leaves the database as it was.
    importAll(dump) {
      this.transaction(() => {
        for (const [name, docs] of Object.entries(dump.collections)) {
          for (const doc of Object.values(docs)) statements.put.run(name, doc.id, JSON.stringify(doc));
        }
        const setSeq = db.prepare('INSERT INTO seq (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value');
        for (const [name, value] of Object.entries(dump.seq)) setSeq.run(name, value);
      });
    },

    close() {
      db.close();
    },
  };
}
