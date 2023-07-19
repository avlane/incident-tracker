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
