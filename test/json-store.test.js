import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonStore } from '../server/store/json-store.js';

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
