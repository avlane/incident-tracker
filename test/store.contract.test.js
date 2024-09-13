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

for (const { name, make, skip } of backends) {
  test(`${name}: exportAll and importAll copy documents and sequences`, { skip }, () => {
    const source = make();
    source.put('incidents', { id: 'INC-0001', title: 'a' });
    source.put('incidents', { id: 'INC-0002', title: 'b' });
    source.put('users', { id: 'usr_1' });
    source.nextSeq('incident');
    source.nextSeq('incident');

    for (const other of backends.filter((b) => !b.skip)) {
      const target = other.make();
      target.importAll(source.exportAll());
      assert.deepEqual(target.list('incidents').map((d) => d.id), ['INC-0001', 'INC-0002']);
      assert.equal(target.get('users', 'usr_1').id, 'usr_1');
      assert.equal(target.nextSeq('incident'), 3, `${name} -> ${other.name}`);
      target.close();
    }
    source.close();
  });
}

for (const { name, make, skip } of backends) {
  test(`${name}: a transaction commits when it returns and rolls back when it throws`, { skip }, () => {
    const store = make();
    store.put('things', { id: 'keep' });
    const value = store.transaction(() => {
      store.put('things', { id: 'a' });
      store.nextSeq('n');
      return 42;
    });
    assert.equal(value, 42);
    assert.equal(store.list('things').length, 2);

    assert.throws(
      () =>
        store.transaction(() => {
          store.put('things', { id: 'b' });
          store.put('things', { id: 'keep', changed: true });
          store.remove('things', 'a');
          store.nextSeq('n');
          throw new Error('boom');
        }),
      /boom/,
    );
    assert.deepEqual(store.list('things').map((d) => d.id), ['keep', 'a']);
    assert.equal(store.get('things', 'keep').changed, undefined);
    assert.equal(store.nextSeq('n'), 2, 'the sequence was rolled back too');
    store.close();
  });

  test(`${name}: nested transactions roll back independently`, { skip }, () => {
    const store = make();
    store.transaction(() => {
      store.put('things', { id: 'outer' });
      assert.throws(() =>
        store.transaction(() => {
          store.put('things', { id: 'inner' });
          throw new Error('inner failed');
        }),
      );
      store.put('things', { id: 'after' });
    });
    assert.deepEqual(store.list('things').map((d) => d.id), ['outer', 'after']);

    assert.throws(() =>
      store.transaction(() => {
        store.put('things', { id: 'doomed' });
        store.transaction(() => store.put('things', { id: 'doomed-inner' }));
        throw new Error('outer failed');
      }),
    );
    assert.equal(store.get('things', 'doomed'), null);
    assert.equal(store.get('things', 'doomed-inner'), null);
    store.close();
  });

  test(`${name}: async transaction callbacks are refused`, { skip }, () => {
    const store = make();
    assert.throws(() => store.transaction(async () => {}), TypeError);
    store.put('things', { id: 'still-works' });
    assert.equal(store.list('things').length, 1);
    store.close();
  });

  test(`${name}: a failed audit write leaves no incident and does not burn an id`, { skip }, async (t) => {
    const store = make();
    const realPut = store.put.bind(store);
    let failAudit = true;
    store.put = (collection, doc) => {
      if (collection === 'audit' && failAudit) throw new Error('disk full');
      return realPut(collection, doc);
    };
    const srv = await startTestServer({ store });
    t.after(async () => {
      await srv.close();
      store.close();
    });
    const failed = await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
    assert.equal(failed.status, 500);
    assert.equal(store.list('incidents').length, 0);
    failAudit = false;
    const ok = await srv.api('POST', '/api/incidents', { title: 'y', severity: 'sev3' });
    assert.equal(ok.json.incident.id, 'INC-0001');
  });
}
