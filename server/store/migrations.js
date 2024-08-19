// Schema migrations for the SQLite store, tracked with PRAGMA user_version.
// Append new entries; never edit one that has shipped. The first migration
// uses IF NOT EXISTS so databases created before versioning existed (which
// report user_version 0 but already have the tables) upgrade cleanly.

export const MIGRATIONS = [
  {
    version: 1,
    sql: `
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
    `,
  },
  {
    version: 2,
    // list() reads one collection in insertion order.
    sql: 'CREATE INDEX IF NOT EXISTS docs_collection_n ON docs (collection, n);',
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function currentVersion(db) {
  return db.prepare('PRAGMA user_version').get().user_version;
}

export function migrate(db, migrations = MIGRATIONS) {
  const latest = migrations[migrations.length - 1].version;
  const from = currentVersion(db);
  if (from > latest) {
    throw new Error(`database schema is version ${from}, but this build only understands up to ${latest}`);
  }
  for (const migration of migrations) {
    if (migration.version <= from) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      // PRAGMA can't take bound parameters; the version is a number we control.
      db.exec(`PRAGMA user_version = ${Number(migration.version)}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return { from, to: latest };
}
