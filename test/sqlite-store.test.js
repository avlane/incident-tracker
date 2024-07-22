import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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

test('basic operations', { skip }, () => {
  const store = createSqliteStore({ DatabaseSync });
  store.put('things', { id: 'a', n: 1, nested: { ok: true } });
  assert.deepEqual(store.get('things', 'a'), { id: 'a', n: 1, nested: { ok: true } });
  assert.equal(store.get('things', 'missing'), null);
  assert.equal(store.nextSeq('x'), 1);
  assert.equal(store.nextSeq('x'), 2);
  assert.equal(store.remove('things', 'a'), true);
  assert.equal(store.remove('things', 'a'), false);
  store.close();
});

test('updates keep insertion order', { skip }, () => {
  const store = createSqliteStore({ DatabaseSync });
  store.put('things', { id: 'b', n: 1 });
  store.put('things', { id: 'a', n: 1 });
  store.put('things', { id: 'b', n: 2 });
  assert.deepEqual(store.list('things').map((d) => `${d.id}${d.n}`), ['b2', 'a1']);
  store.close();
});

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
