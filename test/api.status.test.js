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

test('the status endpoint includes active and upcoming maintenance', async (t) => {
  const srv = await startTestServer({ clock: () => '2025-05-20T03:00:00.000Z' });
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout', components: ['DB'] });
  const affected = [{ serviceId: 'checkout', componentId: 'db' }];
  await srv.api('POST', '/api/maintenance', { title: 'Now', startsAt: '2025-05-20T02:00:00Z', endsAt: '2025-05-20T04:00:00Z', affected });
  await srv.api('POST', '/api/maintenance', { title: 'Later', startsAt: '2025-05-25T02:00:00Z', endsAt: '2025-05-25T04:00:00Z' });
  const res = await srv.anon('GET', '/api/status');
  assert.equal(res.json.overall.status, 'maintenance');
  assert.deepEqual(res.json.maintenance.active.map((w) => w.title), ['Now']);
  assert.deepEqual(res.json.maintenance.upcoming.map((w) => w.title), ['Later']);
});

test('GET /api/status.atom is a public Atom feed of public updates only', async (t) => {
  const srv = await startTestServer({ auth: false, app: { publicUrl: 'https://status.example.com' } });
  t.after(() => srv.close());
  const withAuth = await startTestServer({ app: { publicUrl: 'https://status.example.com' } });
  t.after(() => withAuth.close());
  await withAuth.api('POST', '/api/incidents', { title: 'Search slow', severity: 'sev3', commander: 'priya', summary: 'We see slow searches.' });
  await withAuth.api('POST', '/api/incidents/INC-0001/updates', { message: 'internal chatter', visibility: 'internal' });

  const res = await withAuth.anon('GET', '/api/status.atom');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/atom\+xml/);
  assert.match(res.text, /<title>\[Investigating\] Search slow<\/title>/);
  assert.match(res.text, /https:\/\/status\.example\.com\/#\/status/);
  assert.ok(!res.text.includes('internal chatter'));
  assert.ok(!res.text.includes('priya'));
  assert.equal((await srv.api('GET', '/api/status.atom')).status, 200);
});
