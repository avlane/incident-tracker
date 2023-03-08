import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonStore } from '../server/store/json-store.js';

test('put, get, list and remove', () => {
  const store = createJsonStore();
  store.put('things', { id: 'a', n: 1 });
  store.put('things', { id: 'b', n: 2 });
  assert.deepEqual(store.get('things', 'a'), { id: 'a', n: 1 });
  assert.equal(store.get('things', 'zzz'), null);
  assert.deepEqual(store.list('things').map((d) => d.id), ['a', 'b']);
  assert.equal(store.remove('things', 'a'), true);
  assert.equal(store.remove('things', 'a'), false);
  assert.equal(store.list('things').length, 1);
});

test('stored documents are isolated from callers', () => {
  const store = createJsonStore();
  const doc = { id: 'a', tags: ['x'] };
  store.put('things', doc);
  doc.tags.push('y');
  const read = store.get('things', 'a');
  read.tags.push('z');
  assert.deepEqual(store.get('things', 'a').tags, ['x']);
});

test('put rejects documents without an id', () => {
  assert.throws(() => createJsonStore().put('things', { n: 1 }), TypeError);
});

test('sequences count up per name', () => {
  const store = createJsonStore();
  assert.equal(store.nextSeq('incident'), 1);
  assert.equal(store.nextSeq('incident'), 2);
  assert.equal(store.nextSeq('user'), 1);
});

test('data survives reopening the file and no temp file is left behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'it-store-'));
  try {
    const path = join(dir, 'nested', 'db.json');
    const first = createJsonStore({ path });
    first.put('things', { id: 'a', n: 1 });
    first.nextSeq('incident');
    const second = createJsonStore({ path });
    assert.deepEqual(second.get('things', 'a'), { id: 'a', n: 1 });
    assert.equal(second.nextSeq('incident'), 2);
    assert.deepEqual(readdirSync(join(dir, 'nested')), ['db.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
