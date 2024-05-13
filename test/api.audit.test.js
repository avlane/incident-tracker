import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('changes are recorded with who did them', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout' });
  await srv.api('POST', '/api/incidents', { title: 'Slow', severity: 'sev2' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'fixed', status: 'resolved', visibility: 'internal' });
  await srv.api('PATCH', '/api/services/checkout', { description: 'x' });
  await srv.api('DELETE', '/api/services/checkout');

  const log = srv.app.auditLog.list().entries.reverse();
  assert.deepEqual(
    log.map((e) => e.action),
    ['service.create', 'incident.create', 'incident.update', 'service.update', 'service.delete'],
  );
  assert.equal(log[1].target, 'INC-0001');
  assert.equal(log[1].actor.name, 'Test admin');
  assert.equal(log[2].meta.status, 'resolved');
  assert.equal(log[2].meta.visibility, 'internal');
  assert.equal(log[0].ip, '127.0.0.1');
});

test('failed requests leave no audit entry; logins and failed logins do', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  await srv.app.auth.createUser({ email: 'a@example.com', name: 'A', role: 'viewer', password: 'a fine passphrase' });
  await srv.api('POST', '/api/auth/login', { email: 'a@example.com', password: 'wrong wrong wrong' });
  const ok = await srv.api('POST', '/api/auth/login', { email: 'a@example.com', password: 'a fine passphrase' });
  const token = decodeURIComponent(ok.headers.get('set-cookie').split(';')[0].slice(8));
  await srv.api('POST', '/api/auth/logout', undefined, { authorization: `Bearer ${token}` });

  const actions = srv.app.auditLog.list().entries.map((e) => e.action).reverse();
  assert.deepEqual(actions, ['auth.login_failed', 'auth.login', 'auth.logout']);
  const failed = srv.app.auditLog.list().entries.at(-1);
  assert.equal(failed.meta.email, 'a@example.com');
  assert.equal(failed.actor, null);
  assert.ok(!JSON.stringify(srv.store.list('audit')).includes('wrong wrong'));
});

test('a rejected write is not audited', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: '', severity: 'nope' });
  assert.equal(srv.app.auditLog.list().entries.length, 0);
});

test('GET /api/audit is admin-only and supports filters and paging', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  for (let i = 0; i < 3; i++) await srv.api('POST', '/api/incidents', { title: `i${i}`, severity: 'sev4' });
  await srv.api('POST', '/api/services', { name: 'Checkout' });

  const viewer = await srv.as('viewer');
  assert.equal((await viewer('GET', '/api/audit')).status, 403);
  assert.equal((await srv.anon('GET', '/api/audit')).status, 401);

  const all = await srv.api('GET', '/api/audit');
  assert.equal(all.json.entries.length, 4);
  assert.equal(all.json.entries[0].action, 'service.create');

  const incidents = await srv.api('GET', '/api/audit?action=incident&limit=2');
  assert.equal(incidents.json.entries.length, 2);
  assert.equal(incidents.json.hasMore, true);
  const rest = await srv.api('GET', `/api/audit?action=incident&limit=2&before=${incidents.json.entries[1].id}`);
  assert.equal(rest.json.entries.length, 1);
  assert.equal(rest.json.hasMore, false);

  assert.equal((await srv.api('GET', '/api/audit?limit=0')).status, 400);
  assert.equal((await srv.api('GET', '/api/audit?from=never')).status, 400);
});
