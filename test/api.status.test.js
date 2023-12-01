import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('GET /api/status reflects open incidents and hides internals', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout', components: ['API', 'Database'] });

  const quiet = await srv.api('GET', '/api/status');
  assert.equal(quiet.status, 200);
  assert.equal(quiet.json.overall.status, 'operational');
  assert.match(quiet.headers.get('cache-control'), /max-age=30/);

  await srv.api('POST', '/api/incidents', {
    title: 'Payments failing',
    severity: 'sev1',
    commander: 'priya',
    affected: [{ serviceId: 'checkout', componentId: 'api', impact: 'major_outage' }],
  });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'Vendor call notes: do not share', visibility: 'internal' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'Rolling back', status: 'identified' });

  const during = await srv.api('GET', '/api/status');
  assert.equal(during.json.overall.status, 'major_outage');
  assert.equal(during.json.active[0].updates.length, 2);
  assert.ok(!during.text.includes('priya'));
  assert.ok(!during.text.includes('Vendor call notes'));

  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'All clear', status: 'resolved' });
  const after = await srv.api('GET', '/api/status');
  assert.equal(after.json.overall.status, 'operational');
  assert.equal(after.json.recent.length, 1);
});

test('private incidents are not on the status page', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'Internal tooling', severity: 'sev3', public: false });
  const res = await srv.api('GET', '/api/status');
  assert.equal(res.json.active.length, 0);
});
