import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('GET /api/metrics defaults to the last 30 days', async (t) => {
  const srv = await startTestServer({ clock: () => '2025-02-20T12:00:00.000Z' });
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'a', severity: 'sev1' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'on it' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'done', status: 'resolved' });

  const res = await srv.api('GET', '/api/metrics');
  assert.equal(res.status, 200);
  const m = res.json.metrics;
  assert.equal(m.period.to, '2025-02-20T12:00:00.000Z');
  assert.equal(m.period.from, '2025-01-21T12:00:00.000Z');
  assert.equal(m.total, 1);
  assert.equal(m.resolved, 1);
  assert.equal(m.bySeverity.sev1, 1);
});

test('explicit ranges are honoured and validated', async (t) => {
  const srv = await startTestServer({ clock: () => '2025-02-20T12:00:00.000Z' });
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'a', severity: 'sev2' });

  const none = await srv.api('GET', '/api/metrics?from=2024-01-01&to=2024-02-01');
  assert.equal(none.json.metrics.total, 0);

  assert.equal((await srv.api('GET', '/api/metrics?from=nope')).status, 400);
  assert.equal((await srv.api('GET', '/api/metrics?from=2025-03-01&to=2025-02-01')).status, 400);
  assert.equal((await srv.api('GET', '/api/metrics?from=2020-01-01&to=2025-01-01')).status, 400);
});

test('viewers can read metrics, anonymous callers cannot', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const viewer = await srv.as('viewer');
  assert.equal((await viewer('GET', '/api/metrics')).status, 200);
  assert.equal((await srv.anon('GET', '/api/metrics')).status, 401);
});
