import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog } from '../server/audit.js';
import { createJsonStore } from '../server/store/json-store.js';
import { fakeClock } from './helpers.js';

const sam = { id: 'usr_1', name: 'Sam', email: 'sam@example.com', role: 'admin', passwordHash: 'must-not-leak' };

function setup() {
  const store = createJsonStore();
  return { store, audit: createAuditLog({ store, clock: fakeClock('2024-04-19T08:00:00.000Z', 60_000) }) };
}

test('entries get increasing ids and never store more of the actor than needed', () => {
  const { audit, store } = setup();
  const a = audit.record({ actor: sam, action: 'incident.create', target: 'INC-0001', ip: '10.0.0.1' });
  const b = audit.record({ actor: null, action: 'auth.login_failed', meta: { email: 'x@example.com' } });
  assert.equal(a.id, '00000001');
  assert.equal(b.id, '00000002');
  assert.deepEqual(a.actor, { id: 'usr_1', name: 'Sam', email: 'sam@example.com' });
  assert.equal(b.actor, null);
  assert.ok(!JSON.stringify(store.list('audit')).includes('must-not-leak'));
});

test('list is newest first and filters combine', () => {
  const { audit } = setup();
  audit.record({ actor: sam, action: 'incident.create', target: 'INC-0001' });
  audit.record({ actor: sam, action: 'incident.update', target: 'INC-0001' });
  audit.record({ actor: null, action: 'auth.login_failed' });
  audit.record({ actor: sam, action: 'service.create', target: 'checkout' });

  assert.deepEqual(audit.list().entries.map((e) => e.id), ['00000004', '00000003', '00000002', '00000001']);
  assert.deepEqual(audit.list({ action: 'incident' }).entries.map((e) => e.action), ['incident.update', 'incident.create']);
  assert.deepEqual(audit.list({ action: 'incident.create' }).entries.length, 1);
  assert.deepEqual(audit.list({ target: 'INC-0001', actor: 'usr_1' }).entries.length, 2);
  assert.equal(audit.list({ actor: 'sam@example.com' }).entries.length, 3);
});

test('paging uses before and limit', () => {
  const { audit } = setup();
  for (let i = 0; i < 5; i++) audit.record({ action: 'x.y' });
  const page1 = audit.list({ limit: 2 });
  assert.deepEqual(page1.entries.map((e) => e.id), ['00000005', '00000004']);
  assert.equal(page1.hasMore, true);
  const page2 = audit.list({ limit: 2, before: '00000004' });
  assert.deepEqual(page2.entries.map((e) => e.id), ['00000003', '00000002']);
  const last = audit.list({ limit: 2, before: '00000002' });
  assert.equal(last.hasMore, false);
});

test('time range filter', () => {
  const { audit } = setup();
  for (let i = 0; i < 4; i++) audit.record({ action: 'x.y' });
  const mid = audit.list({ from: '2024-04-19T08:01:00.000Z', to: '2024-04-19T08:02:00.000Z' });
  assert.equal(mid.entries.length, 2);
});
