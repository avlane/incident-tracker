import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('GET /api/incidents/:id/postmortem returns Markdown', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout', components: ['API'] });
  await srv.api('POST', '/api/incidents', {
    title: 'Slow checkout',
    severity: 'sev2',
    affected: [{ serviceId: 'checkout', componentId: 'api', impact: 'degraded' }],
  });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'Cache warmed', status: 'resolved' });

  const res = await srv.api('GET', '/api/incidents/INC-0001/postmortem');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/markdown/);
  assert.match(res.text, /^# Postmortem: INC-0001 Slow checkout/);
  assert.match(res.text, /Checkout \/ API: degraded performance/);
  assert.match(res.headers.get('content-disposition'), /INC-0001-postmortem\.md/);
});

test('postmortem for an unknown incident is a 404', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  assert.equal((await srv.api('GET', '/api/incidents/INC-0009/postmortem')).status, 404);
});

test('PUT stores the written postmortem and the Markdown reflects it', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'Slow checkout', severity: 'sev2' });
  const put = await srv.api('PUT', '/api/incidents/INC-0001/postmortem', {
    rootCause: 'Cache stampede after deploy.',
    wentWell: ['Fast rollback'],
    actionItems: [{ action: 'Add request coalescing', owner: 'Sam', due: '2025-06-01' }],
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.postmortem.updatedBy, 'Test admin');
  assert.equal(put.json.postmortem.detection, '');

  const md = await srv.api('GET', '/api/incidents/INC-0001/postmortem');
  assert.match(md.text, /Cache stampede after deploy\./);
  assert.match(md.text, /\| Add request coalescing \| Sam \| 2025-06-01 \|/);
  assert.equal((await srv.api('GET', '/api/incidents/INC-0001')).json.incident.postmortem.wentWell[0], 'Fast rollback');
  assert.equal(srv.app.auditLog.list({ action: 'postmortem' }).entries.length, 1);
});

test('PUT validates action items and needs the responder role', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  const bad = await srv.api('PUT', '/api/incidents/INC-0001/postmortem', {
    actionItems: [{ owner: 'Sam' }, { action: 'ok', due: 'next week' }, 'nope'],
    wentWell: [''],
  });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.json.error.details.map((d) => d.field).sort(), ['actionItems[0]', 'actionItems[1]', 'actionItems[2]', 'wentWell']);
  const viewer = await srv.as('viewer');
  assert.equal((await viewer('PUT', '/api/incidents/INC-0001/postmortem', {})).status, 403);
  assert.equal((await srv.api('PUT', '/api/incidents/INC-0099/postmortem', {})).status, 404);
});
