import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonStore } from '../server/store/json-store.js';
import { createSqliteStore } from '../server/store/sqlite-store.js';
import { startTestServer } from './helpers.js';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // reported as skipped below
}

const backends = [
  { name: 'json', make: () => createJsonStore() },
  { name: 'sqlite', make: () => createSqliteStore({ DatabaseSync }), skip: DatabaseSync ? false : 'node:sqlite is not available' },
];

// Every backend must behave identically for everything the app relies on.
for (const { name, make, skip } of backends) {
  test(`${name}: documents round-trip, including awkward content`, { skip }, () => {
    const store = make();
    const doc = {
      id: 'a',
      text: 'café ☃ "quotes" \\ backslash\nnewline',
      n: 0,
      flag: false,
      nothing: null,
      list: [1, 'two', { three: 3 }],
    };
    store.put('things', doc);
    assert.deepEqual(store.get('things', 'a'), doc);
    store.close();
  });

  test(`${name}: put replaces, list keeps first-insert order`, { skip }, () => {
    const store = make();
    store.put('things', { id: 'x', v: 1 });
    store.put('things', { id: 'y', v: 1 });
    store.put('things', { id: 'x', v: 2 });
    assert.deepEqual(store.list('things').map((d) => `${d.id}:${d.v}`), ['x:2', 'y:1']);
    store.close();
  });

  test(`${name}: collections and sequences are independent`, { skip }, () => {
    const store = make();
    store.put('a', { id: '1' });
    store.put('b', { id: '1', other: true });
    assert.equal(store.get('a', '1').other, undefined);
    assert.equal(store.list('c').length, 0);
    assert.equal(store.nextSeq('incident'), 1);
    assert.equal(store.nextSeq('audit'), 1);
    assert.equal(store.nextSeq('incident'), 2);
    store.close();
  });

  test(`${name}: results are copies`, { skip }, () => {
    const store = make();
    store.put('things', { id: 'a', tags: ['x'] });
    store.get('things', 'a').tags.push('y');
    store.list('things')[0].tags.push('z');
    assert.deepEqual(store.get('things', 'a').tags, ['x']);
    store.close();
  });

  test(`${name}: bad documents and missing ids`, { skip }, () => {
    const store = make();
    assert.throws(() => store.put('things', { n: 1 }), TypeError);
    assert.throws(() => store.put('things', { id: '' }), TypeError);
    assert.equal(store.get('things', 'nope'), null);
    assert.equal(store.remove('things', 'nope'), false);
    store.close();
  });

  test(`${name}: the API works end to end on this store`, { skip }, async (t) => {
    const store = make();
    const srv = await startTestServer({ store });
    t.after(async () => {
      await srv.close();
      store.close();
    });
    await srv.api('POST', '/api/services', { name: 'Checkout', components: ['API'] });
    const created = await srv.api('POST', '/api/incidents', {
      title: 'Slow',
      severity: 'sev2',
      affected: [{ serviceId: 'checkout', componentId: 'api', impact: 'degraded' }],
    });
    assert.equal(created.json.incident.id, 'INC-0001');
    await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'ok', status: 'resolved' });
    const list = await srv.api('GET', '/api/incidents?open=false');
    assert.equal(list.json.total, 1);
    const status = await srv.api('GET', '/api/status');
    assert.equal(status.json.overall.status, 'operational');
    assert.equal(srv.app.auditLog.list().entries.length >= 3, true);
  });
}
