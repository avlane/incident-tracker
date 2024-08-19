import test from 'node:test';
import assert from 'node:assert/strict';
import { LATEST_VERSION, MIGRATIONS, currentVersion, migrate } from '../server/store/migrations.js';
import { createSqliteStore } from '../server/store/sqlite-store.js';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // skipped below
}
const skip = DatabaseSync ? false : 'node:sqlite is not available';

const tables = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);

test('versions are consecutive from 1', () => {
  assert.deepEqual(MIGRATIONS.map((m) => m.version), MIGRATIONS.map((_, i) => i + 1));
});

test('a fresh database is brought to the latest version', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  assert.equal(currentVersion(db), 0);
  assert.deepEqual(migrate(db), { from: 0, to: LATEST_VERSION });
  assert.equal(currentVersion(db), LATEST_VERSION);
  assert.deepEqual(tables(db), ['docs', 'docs_collection_n', 'seq']);
});

test('migrating twice does nothing the second time', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  assert.deepEqual(migrate(db), { from: LATEST_VERSION, to: LATEST_VERSION });
});

test('a database from before versioning upgrades and keeps its data', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATIONS[0].sql); // what the unversioned store created
  db.exec("INSERT INTO docs (collection, id, doc) VALUES ('things', 'a', '{\"id\":\"a\"}')");
  assert.equal(currentVersion(db), 0);
  migrate(db);
  assert.equal(currentVersion(db), LATEST_VERSION);
  assert.equal(db.prepare('SELECT count(*) AS c FROM docs').get().c, 1);
});

test('a database from a newer build is refused', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
  assert.throws(() => migrate(db), /only understands up to/);
});

test('a failing migration rolls back and leaves the version alone', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  const broken = [
    { version: 1, sql: 'CREATE TABLE ok (x);' },
    { version: 2, sql: 'CREATE TABLE half (x); THIS IS NOT SQL;' },
  ];
  assert.throws(() => migrate(db, broken));
  assert.equal(currentVersion(db), 1);
  assert.deepEqual(tables(db), ['ok']);
});

test('opening the store migrates it', { skip }, () => {
  const store = createSqliteStore({ DatabaseSync });
  store.put('things', { id: 'a' });
  assert.equal(store.get('things', 'a').id, 'a');
  store.close();
});
