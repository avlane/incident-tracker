import test from 'node:test';
import assert from 'node:assert/strict';
import { createTtlCache } from '../server/cache.js';
import { startTestServer } from './helpers.js';

test('values are reused until they expire', () => {
  let t = 1000;
  const cache = createTtlCache({ ttlMs: 500, now: () => t });
  let computed = 0;
  const get = () => cache.getOrCompute('k', () => ++computed);
  assert.equal(get(), 1);
  t += 499;
  assert.equal(get(), 1);
  t += 1;
  assert.equal(get(), 2);
  assert.equal(computed, 2);
});

test('clear forces a recompute and keys are independent', () => {
  const cache = createTtlCache({ ttlMs: 10_000 });
  assert.equal(cache.getOrCompute('a', () => 'one'), 'one');
  assert.equal(cache.getOrCompute('b', () => 'two'), 'two');
  assert.equal(cache.getOrCompute('a', () => 'changed'), 'one');
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.getOrCompute('a', () => 'changed'), 'changed');
});

test('a ttl of zero never caches', () => {
  const cache = createTtlCache({ ttlMs: 0 });
  let n = 0;
  cache.getOrCompute('k', () => ++n);
  cache.getOrCompute('k', () => ++n);
  assert.equal(n, 2);
});

test('the status endpoint is computed once per window, but writes show up immediately', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  let reads = 0;
  const realList = srv.store.list.bind(srv.store);
  srv.store.list = (name) => {
    if (name === 'incidents') reads++;
    return realList(name);
  };

  await srv.anon('GET', '/api/status');
  const afterFirst = reads;
  await srv.anon('GET', '/api/status');
  await srv.anon('GET', '/api/status.atom');
  assert.equal(reads, afterFirst, 'cached reads do not touch the store');

  await srv.api('POST', '/api/incidents', { title: 'new', severity: 'sev3' });
  const fresh = await srv.anon('GET', '/api/status');
  assert.equal(fresh.json.active.length, 1, 'the write cleared the cache');
});

test('failed writes also clear the cache harmlessly, and statusCacheMs: 0 disables it', async (t) => {
  const srv = await startTestServer({ app: { statusCacheMs: 0 } });
  t.after(() => srv.close());
  let reads = 0;
  const realList = srv.store.list.bind(srv.store);
  srv.store.list = (name) => {
    if (name === 'incidents') reads++;
    return realList(name);
  };
  await srv.anon('GET', '/api/status');
  const first = reads;
  await srv.anon('GET', '/api/status');
  assert.ok(reads > first);
});
