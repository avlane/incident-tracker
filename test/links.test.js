import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncident } from '../server/incidents.js';
import { inverseKind, linkIncidents, LINK_KINDS, unlinkIncidents } from '../server/links.js';
import { startTestServer } from './helpers.js';

const make = (n) => createIncident({ title: `i${n}`, severity: 'sev3' }, { id: `INC-000${n}`, now: '2025-11-25T09:00:00.000Z' });
const AT = '2025-11-25T10:00:00.000Z';

test('every kind has an inverse and inverses invert back', () => {
  for (const kind of LINK_KINDS) assert.equal(inverseKind(inverseKind(kind)), kind);
  assert.equal(inverseKind('related'), 'related');
});

test('linking writes both sides with the right wording', () => {
  const [a, b] = linkIncidents(make(1), make(2), 'caused_by', AT);
  assert.deepEqual(a.links, [{ id: 'INC-0002', kind: 'caused_by' }]);
  assert.deepEqual(b.links, [{ id: 'INC-0001', kind: 'caused' }]);
  assert.equal(a.updatedAt, AT);
});

test('relinking a pair replaces the old link', () => {
  const [a1, b1] = linkIncidents(make(1), make(2), 'related', AT);
  const [a2, b2] = linkIncidents(a1, b1, 'duplicate_of', AT);
  assert.deepEqual(a2.links, [{ id: 'INC-0002', kind: 'duplicate_of' }]);
  assert.deepEqual(b2.links, [{ id: 'INC-0001', kind: 'duplicates' }]);
});

test('self links and unknown kinds throw; unlink removes both sides', () => {
  assert.throws(() => linkIncidents(make(1), make(1), 'related', AT), /itself/);
  assert.throws(() => linkIncidents(make(1), make(2), 'friends', AT), /unknown link kind/);
  const [a, b] = linkIncidents(make(1), make(2), 'related', AT);
  const [a2, b2] = unlinkIncidents(a, b, AT);
  assert.deepEqual([a2.links, b2.links], [[], []]);
});

test('POST and DELETE links over HTTP, audited', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  for (const title of ['db failover', 'checkout errors']) await srv.api('POST', '/api/incidents', { title, severity: 'sev2' });

  const linked = await srv.api('POST', '/api/incidents/INC-0002/links', { target: 'INC-0001', kind: 'caused_by' });
  assert.equal(linked.status, 201);
  assert.deepEqual(linked.json.incident.links, [{ id: 'INC-0001', kind: 'caused_by' }]);
  const other = (await srv.api('GET', '/api/incidents/INC-0001')).json.incident;
  assert.deepEqual(other.links, [{ id: 'INC-0002', kind: 'caused' }]);

  const gone = await srv.api('DELETE', '/api/incidents/INC-0002/links/INC-0001');
  assert.equal(gone.status, 200);
  assert.deepEqual((await srv.api('GET', '/api/incidents/INC-0001')).json.incident.links, []);
  assert.deepEqual(srv.app.auditLog.list({ action: 'incident' }).entries.map((e) => e.action).slice(0, 2), ['incident.unlink', 'incident.link']);
});

test('link validation, missing targets and roles', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'a', severity: 'sev3' });
  assert.equal((await srv.api('POST', '/api/incidents/INC-0001/links', { target: 'INC-0001', kind: 'related' })).status, 422);
  assert.equal((await srv.api('POST', '/api/incidents/INC-0001/links', { target: 'INC-0001', kind: 'bogus' })).status, 422);
  assert.equal((await srv.api('POST', '/api/incidents/INC-0001/links', { target: 'INC-0099', kind: 'related' })).status, 404);
  const viewer = await srv.as('viewer');
  assert.equal((await viewer('POST', '/api/incidents/INC-0001/links', { target: 'INC-0002', kind: 'related' })).status, 403);
});
