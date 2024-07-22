import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// The same small interface as the JSON store, on top of node:sqlite.
//
// node:sqlite is built into Node 22.5 and newer (behind --experimental-sqlite
// until 22.13). To keep this file loadable on older Nodes, the DatabaseSync
// class is passed in by the caller, which imports it lazily.
//
// Documents are stored as JSON text in one table. That keeps the two stores
// interchangeable; it gives up SQL-level querying in exchange.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS docs (
    n INTEGER PRIMARY KEY,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    doc TEXT NOT NULL,
    UNIQUE (collection, id)
  );
  CREATE TABLE IF NOT EXISTS seq (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
`;

export function createSqliteStore({ DatabaseSync, path = ':memory:' }) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec(SCHEMA);

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

  return {
    kind: 'sqlite',

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

    close() {
      db.close();
    },
  };
}
