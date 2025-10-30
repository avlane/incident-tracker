import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneStore } from '../server/prune.js';
import { runCommand } from '../server/commands.js';
import { createJsonStore } from '../server/store/json-store.js';

const NOW = '2025-10-30T12:00:00.000Z';

function seeded() {
  const store = createJsonStore();
  store.put('deliveries', { id: 'old', createdAt: '2025-09-01T00:00:00.000Z' });
  store.put('deliveries', { id: 'recent', createdAt: '2025-10-20T00:00:00.000Z' });
  store.put('sessions', { id: 's-expired', expiresAt: '2025-10-30T11:59:59.000Z' });
  store.put('sessions', { id: 's-live', expiresAt: '2025-10-31T00:00:00.000Z' });
  store.put('tokens', { id: 't-expired', expiresAt: '2025-10-01T00:00:00.000Z' });
  store.put('tokens', { id: 't-forever', expiresAt: null });
  store.put('audit', { id: '00000001', at: '2020-01-01T00:00:00.000Z' });
  store.put('incidents', { id: 'INC-0001', createdAt: '2020-01-01T00:00:00.000Z' });
  return store;
}

test('prune removes only stale deliveries, expired sessions and expired tokens', () => {
  const store = seeded();
  assert.deepEqual(pruneStore(store, { now: NOW }), { deliveries: 1, sessions: 1, tokens: 1 });
  assert.deepEqual(store.list('deliveries').map((d) => d.id), ['recent']);
  assert.deepEqual(store.list('sessions').map((d) => d.id), ['s-live']);
  assert.deepEqual(store.list('tokens').map((d) => d.id), ['t-forever']);
  assert.equal(store.list('audit').length, 1, 'the audit log is never pruned');
  assert.equal(store.list('incidents').length, 1);
});

test('the retention window is configurable and a second run finds nothing', () => {
  const store = seeded();
  assert.equal(pruneStore(store, { now: NOW, deliveryDays: 5 }).deliveries, 2);
  assert.deepEqual(pruneStore(store, { now: NOW }), { deliveries: 0, sessions: 0, tokens: 0 });
});

test('the prune command reports what it removed and validates its argument', async () => {
  const store = seeded();
  const lines = [];
  const deps = { store, now: () => NOW, out: (l) => lines.push(l) };
  assert.equal(await runCommand(['prune'], deps), 0);
  assert.equal(lines[0], 'removed 1 old deliveries, 1 expired sessions, 1 expired tokens');
  await assert.rejects(runCommand(['prune', '--delivery-days', '0'], deps), /--delivery-days must be/);
  await assert.rejects(runCommand(['prune', '--delivery-days', 'abc'], deps), /--delivery-days must be/);
});
