import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

async function makeToken(srv, input = { name: 'ci', role: 'responder' }) {
  const res = await srv.api('POST', '/api/tokens', input);
  return { res, bearer: { authorization: `Bearer ${res.json?.token}` } };
}

test('a token authenticates a script with the role it was given', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const { res, bearer } = await makeToken(srv);
  assert.equal(res.status, 201);
  assert.match(res.json.token, /^itk_/);
  assert.match(res.json.record.id, /^tok_/);

  const opened = await srv.anon('POST', '/api/incidents', { title: 'from a script', severity: 'sev3' }, bearer);
  assert.equal(opened.status, 201);
  assert.equal((await srv.anon('POST', '/api/services', { name: 'x' }, bearer)).status, 403);
  const me = await srv.anon('GET', '/api/auth/me', undefined, bearer);
  assert.equal(me.json.user.kind, 'token');
  assert.equal(me.json.user.role, 'responder');
});

test('tokens are stored hashed and the secret is shown once', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const { res } = await makeToken(srv);
  assert.ok(!JSON.stringify(srv.store.list('tokens')).includes(res.json.token));
  const list = await srv.api('GET', '/api/tokens');
  assert.equal(list.json.tokens.length, 1);
  assert.ok(!list.text.includes(res.json.token));
  assert.equal(list.json.tokens[0].name, 'ci');
});

test('actions by a token are audited under the token', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const { bearer } = await makeToken(srv, { name: 'deploy bot', role: 'responder' });
  await srv.anon('POST', '/api/incidents', { title: 'x', severity: 'sev3' }, bearer);
  const entry = srv.app.auditLog.list({ action: 'incident.create' }).entries[0];
  assert.equal(entry.actor.name, 'token: deploy bot');
});

test('revoked and expired tokens stop working', async (t) => {
  let now = Date.parse('2025-08-26T10:00:00.000Z');
  const srv = await startTestServer({ clock: () => new Date(now).toISOString() });
  t.after(() => srv.close());
  const short = await makeToken(srv, { name: 'short', role: 'viewer', expiresInDays: 1 });
  const long = await makeToken(srv, { name: 'long', role: 'viewer' });

  assert.equal((await srv.anon('GET', '/api/incidents', undefined, short.bearer)).status, 200);
  now += 25 * 3_600_000;
  assert.equal((await srv.anon('GET', '/api/incidents', undefined, short.bearer)).status, 401);
  assert.equal((await srv.anon('GET', '/api/incidents', undefined, long.bearer)).status, 200);

  // the original admin session has expired too (12 hours), so sign in again
  const admin = await srv.as('admin');
  const id = long.res.json.record.id;
  assert.equal((await admin('DELETE', `/api/tokens/${id}`)).status, 204);
  assert.equal((await srv.anon('GET', '/api/incidents', undefined, long.bearer)).status, 401);
  assert.equal((await admin('DELETE', `/api/tokens/${id}`)).status, 404);
});

test('validation, admin-only management, and no admin tokens', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  assert.equal((await srv.api('POST', '/api/tokens', { name: 'x', role: 'admin' })).status, 422);
  assert.equal((await srv.api('POST', '/api/tokens', { role: 'viewer' })).status, 422);
  assert.equal((await srv.api('POST', '/api/tokens', { name: 'x', role: 'viewer', expiresInDays: 0 })).status, 422);
  const responder = await srv.as('responder');
  assert.equal((await responder('GET', '/api/tokens')).status, 403);
  assert.equal((await responder('POST', '/api/tokens', { name: 'x', role: 'viewer' })).status, 403);

  const { bearer } = await makeToken(srv, { name: 'x', role: 'responder' });
  assert.equal((await srv.anon('POST', '/api/auth/password', { current: 'a', next: 'b' }, bearer)).status, 403);
  assert.equal((await srv.anon('DELETE', '/api/auth/sessions', undefined, bearer)).status, 403);
  assert.equal((await srv.anon('GET', '/api/tokens', undefined, bearer)).status, 403);
});
