import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // Older Node, or 22.5 to 22.12 without --experimental-sqlite: tests below skip.
}
const skip = DatabaseSync ? false : 'node:sqlite is not available';
const { createSqliteStore } = await import('../server/store/sqlite-store.js');

test('a file database survives reopening', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'it-sqlite-'));
  try {
    const path = join(dir, 'nested', 'db.sqlite');
    const first = createSqliteStore({ DatabaseSync, path });
    first.put('things', { id: 'a', n: 1 });
    first.nextSeq('incident');
    first.close();
    const second = createSqliteStore({ DatabaseSync, path });
    assert.deepEqual(second.get('things', 'a'), { id: 'a', n: 1 });
    assert.equal(second.nextSeq('incident'), 2);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a second connection waits for the busy timeout, then reports the lock', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'it-sqlite-lock-'));
  try {
    const path = join(dir, 'db.sqlite');
    const holder = new DatabaseSync(path);
    holder.exec('PRAGMA journal_mode = WAL');
    const other = createSqliteStore({ DatabaseSync, path, busyTimeoutMs: 60 });
    holder.exec('CREATE TABLE IF NOT EXISTS t (x)');
    holder.exec('BEGIN IMMEDIATE');
    const started = Date.now();
    assert.throws(() => other.put('things', { id: 'a' }), /locked|busy/i);
    assert.ok(Date.now() - started >= 50, 'it waited instead of failing at once');
    holder.exec('COMMIT');
    other.put('things', { id: 'a' });
    assert.equal(other.get('things', 'a').id, 'a');
    other.close();
    holder.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('closing a file database folds the WAL back into the main file', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'it-sqlite-wal-'));
  try {
    const path = join(dir, 'db.sqlite');
    const store = createSqliteStore({ DatabaseSync, path });
    store.put('things', { id: 'a', payload: 'x'.repeat(2000) });
    store.close();
    const copy = join(dir, 'copy.sqlite');
    writeFileSync(copy, readFileSync(path));
    const reopened = createSqliteStore({ DatabaseSync, path: copy });
    assert.equal(reopened.get('things', 'a').payload.length, 2000);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
