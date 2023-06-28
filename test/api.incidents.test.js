import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('incident create, get and list over real HTTP', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());

  const created = await srv.api('POST', '/api/incidents', {
    title: 'Checkout is slow',
    summary: 'p95 latency above 4s',
    severity: 'sev2',
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.incident.id, 'INC-0001');
  assert.equal(created.json.incident.status, 'investigating');

  const second = await srv.api('POST', '/api/incidents', { title: 'Emails delayed', severity: 'sev3' });
  assert.equal(second.json.incident.id, 'INC-0002');

  const got = await srv.api('GET', '/api/incidents/INC-0001');
  assert.equal(got.status, 200);
  assert.equal(got.json.incident.title, 'Checkout is slow');

  const list = await srv.api('GET', '/api/incidents');
  assert.equal(list.json.total, 2);
  assert.deepEqual(list.json.incidents.map((i) => i.id), ['INC-0002', 'INC-0001']);
});

test('invalid input is a 422 with field errors and does not consume an id', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());

  const bad = await srv.api('POST', '/api/incidents', { title: '', severity: 'nope' });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.json.error.details.map((d) => d.field).sort(), ['severity', 'title']);

  const ok = await srv.api('POST', '/api/incidents', { title: 'Real one', severity: 'sev4' });
  assert.equal(ok.json.incident.id, 'INC-0001');
});

test('unknown incident, unknown path and wrong method', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());

  assert.equal((await srv.api('GET', '/api/incidents/INC-9999')).status, 404);
  assert.equal((await srv.api('GET', '/api/nothing')).status, 404);
  const wrong = await srv.api('DELETE', '/api/incidents');
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'GET, POST');
});

test('malformed JSON is a 400', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const res = await fetch(srv.base + '/api/incidents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"title": ',
  });
  assert.equal(res.status, 400);
});

test('posting updates moves the incident through its timeline', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'Search is down', summary: 'No results', severity: 'sev2' });

  const identified = await srv.api('POST', '/api/incidents/INC-0001/updates', {
    message: 'Index node out of disk',
    status: 'identified',
    author: 'sam',
  });
  assert.equal(identified.status, 201);
  assert.equal(identified.json.incident.status, 'identified');

  const resolved = await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'Disk expanded', status: 'resolved' });
  assert.equal(resolved.json.incident.resolvedAt, resolved.json.incident.updatedAt);
  assert.equal(resolved.json.incident.updates.length, 3);

  const fetched = await srv.api('GET', '/api/incidents/INC-0001');
  assert.deepEqual(fetched.json.incident.updates.map((u) => u.kind), ['opened', 'update', 'update']);
});

test('updates need a message and an existing incident', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  assert.equal((await srv.api('POST', '/api/incidents/INC-0001/updates', { status: 'resolved' })).status, 422);
  assert.equal((await srv.api('POST', '/api/incidents/INC-0042/updates', { message: 'hi' })).status, 404);
});

test('a resolved incident can only be reopened to investigating', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'done', status: 'resolved' });

  const bad = await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'hmm', status: 'monitoring' });
  assert.equal(bad.status, 409);

  const reopened = await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'came back', status: 'investigating' });
  assert.equal(reopened.status, 201);
  assert.equal(reopened.json.incident.resolvedAt, null);
});

test('affected services and components must exist', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout', components: ['API', 'Database'] });

  const ghost = await srv.api('POST', '/api/incidents', {
    title: 'x',
    severity: 'sev3',
    affected: [{ serviceId: 'nope', impact: 'degraded' }],
  });
  assert.equal(ghost.status, 422);

  const badComponent = await srv.api('POST', '/api/incidents', {
    title: 'x',
    severity: 'sev3',
    affected: [{ serviceId: 'checkout', componentId: 'queue', impact: 'degraded' }],
  });
  assert.equal(badComponent.status, 422);

  const ok = await srv.api('POST', '/api/incidents', {
    title: 'Card payments failing',
    severity: 'sev1',
    affected: [{ serviceId: 'checkout', componentId: 'api', impact: 'major_outage' }],
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.incident.affected[0].componentId, 'api');
});

test('a service with an open incident cannot be deleted', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout' });
  await srv.api('POST', '/api/incidents', {
    title: 'x',
    severity: 'sev2',
    affected: [{ serviceId: 'checkout', impact: 'degraded' }],
  });
  assert.equal((await srv.api('DELETE', '/api/services/checkout')).status, 409);
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'ok now', status: 'resolved' });
  assert.equal((await srv.api('DELETE', '/api/services/checkout')).status, 204);
});

test('GET /api/incidents applies filters and rejects bad ones', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'Checkout latency', severity: 'sev2' });
  await srv.api('POST', '/api/incidents', { title: 'Email delays', severity: 'sev4' });
  await srv.api('POST', '/api/incidents/INC-0002/updates', { message: 'drained', status: 'resolved' });

  const open = await srv.api('GET', '/api/incidents?open=true');
  assert.deepEqual(open.json.incidents.map((i) => i.id), ['INC-0001']);
  assert.equal(open.json.total, 1);

  const search = await srv.api('GET', '/api/incidents?q=email&severity=sev4');
  assert.deepEqual(search.json.incidents.map((i) => i.id), ['INC-0002']);

  const bad = await srv.api('GET', '/api/incidents?severity=bogus');
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.details[0].field, 'severity');
});
