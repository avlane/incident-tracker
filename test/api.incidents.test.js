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
