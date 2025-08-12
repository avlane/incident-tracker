import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

const newUser = { email: 'Dana@Example.com', name: 'Dana', role: 'responder', password: 'dana has a long passphrase' };

test('admins can list and create users; hashes never leak', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const created = await srv.api('POST', '/api/users', newUser);
  assert.equal(created.status, 201);
  assert.equal(created.json.user.email, 'dana@example.com');
  const list = await srv.api('GET', '/api/users');
  assert.equal(list.json.users.length, 2);
  assert.ok(!list.text.includes('scrypt'));
  assert.equal((await srv.api('POST', '/api/users', newUser)).status, 409);
  assert.equal((await srv.api('POST', '/api/users', { ...newUser, email: 'e@example.com', password: 'short' })).status, 422);
  assert.equal((await srv.api('POST', '/api/users', { email: 'nope' })).status, 422);
});

test('the new user can sign in', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  await srv.app.auth.createUser({ ...newUser, role: 'admin' });
  const login = await srv.api('POST', '/api/auth/login', { email: 'dana@example.com', password: newUser.password });
  assert.equal(login.status, 200);
});

test('only admins manage users', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const responder = await srv.as('responder');
  assert.equal((await responder('GET', '/api/users')).status, 403);
  assert.equal((await responder('POST', '/api/users', newUser)).status, 403);
});

test('disabling a user ends their sessions and blocks login', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const created = (await srv.api('POST', '/api/users', newUser)).json.user;
  const login = await srv.anon('POST', '/api/auth/login', { email: newUser.email, password: newUser.password });
  assert.equal(login.status, 200);
  const token = decodeURIComponent(login.headers.get('set-cookie').split(';')[0].slice(8));

  const patched = await srv.api('PATCH', `/api/users/${created.id}`, { disabled: true });
  assert.equal(patched.json.user.disabled, true);
  assert.equal((await srv.anon('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` })).status, 401);
  assert.equal((await srv.anon('POST', '/api/auth/login', { email: newUser.email, password: newUser.password })).status, 401);

  await srv.api('PATCH', `/api/users/${created.id}`, { disabled: false, role: 'viewer' });
  assert.equal((await srv.anon('POST', '/api/auth/login', { email: newUser.email, password: newUser.password })).json.user.role, 'viewer');
});

test('admins cannot lock themselves out and the last admin is protected', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const me = srv.app.auth.listUsers()[0];
  assert.equal((await srv.api('PATCH', `/api/users/${me.id}`, { disabled: true })).status, 409);
  assert.equal((await srv.api('PATCH', `/api/users/${me.id}`, { role: 'viewer' })).status, 409);
  assert.equal((await srv.api('PATCH', `/api/users/${me.id}`, { name: 'Renamed' })).status, 200);

  const other = (await srv.api('POST', '/api/users', { ...newUser, role: 'admin' })).json.user;
  assert.equal((await srv.api('PATCH', `/api/users/${other.id}`, { role: 'viewer' })).status, 200);
  assert.throws(() => srv.app.auth.updateUser(me.id, { role: 'viewer' }), { status: 409 });
});

test('unknown users and bad fields', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  assert.equal((await srv.api('PATCH', '/api/users/usr_nope', { name: 'x' })).status, 404);
  assert.equal((await srv.api('PATCH', '/api/users/usr_nope', { role: 'boss' })).status, 422);
  assert.equal(srv.app.auditLog.list({ action: 'user' }).entries.length, 0);
});
