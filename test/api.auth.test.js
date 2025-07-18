import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

const user = { email: 'sam@example.com', name: 'Sam', role: 'responder', password: 'a decent passphrase' };

test('login sets a cookie that identifies the user until logout', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  await srv.app.auth.createUser(user);

  assert.equal((await srv.api('GET', '/api/auth/me')).status, 401);

  const login = await srv.api('POST', '/api/auth/login', { email: 'SAM@example.com', password: user.password });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.name, 'Sam');
  assert.equal(login.json.user.passwordHash, undefined);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /^session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);

  const cookie = setCookie.split(';')[0];
  const me = await srv.api('GET', '/api/auth/me', undefined, { cookie });
  assert.equal(me.json.user.email, 'sam@example.com');

  assert.equal((await srv.api('POST', '/api/auth/logout', undefined, { cookie })).status, 204);
  assert.equal((await srv.api('GET', '/api/auth/me', undefined, { cookie })).status, 401);
});

test('a bearer token works like the cookie', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  await srv.app.auth.createUser(user);
  const login = await srv.api('POST', '/api/auth/login', { email: user.email, password: user.password });
  const token = decodeURIComponent(login.headers.get('set-cookie').split(';')[0].slice('session='.length));
  const me = await srv.api('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(me.status, 200);
});

test('bad credentials are a 401 and missing fields a 422', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  await srv.app.auth.createUser(user);
  const bad = await srv.api('POST', '/api/auth/login', { email: user.email, password: 'wrong wrong wrong' });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error.message, 'invalid email or password');
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.equal((await srv.api('POST', '/api/auth/login', { email: user.email })).status, 422);
});

test('everything except the status page and login needs a session', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  assert.equal((await srv.api('GET', '/api/status')).status, 200);
  assert.equal((await srv.api('GET', '/api/incidents')).status, 401);
  assert.equal((await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' })).status, 401);
  assert.equal((await srv.api('GET', '/api/incidents', undefined, { authorization: 'Bearer nonsense' })).status, 401);
});

test('roles gate writes', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const viewer = await srv.as('viewer');
  const responder = await srv.as('responder');

  assert.equal((await viewer('GET', '/api/incidents')).status, 200);
  assert.equal((await viewer('POST', '/api/incidents', { title: 'x', severity: 'sev3' })).status, 403);

  const opened = await responder('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  assert.equal(opened.status, 201);
  assert.equal((await responder('POST', '/api/services', { name: 'Checkout' })).status, 403);
  assert.equal((await srv.api('POST', '/api/services', { name: 'Checkout' })).status, 201);
});

test('updates are attributed to the signed-in user, not the request body', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const responder = await srv.as('responder');
  await responder('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  const res = await responder('POST', '/api/incidents/INC-0001/updates', { message: 'looking', author: 'Someone Else' });
  assert.equal(res.json.incident.updates[1].author, 'Test responder');
});

test('signed-out callers get 401 for unknown paths too, not a hint that the path is missing', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  assert.equal((await srv.api('GET', '/api/nothing-here')).status, 401);
  const signedIn = await startTestServer();
  t.after(() => signedIn.close());
  assert.equal((await signedIn.api('GET', '/api/nothing-here')).status, 404);
});

test('the session cookie is Secure only when the request was HTTPS', async (t) => {
  const plain = await startTestServer({ auth: false });
  t.after(() => plain.close());
  await plain.app.auth.createUser(user);
  const creds = { email: user.email, password: user.password };

  const http = await plain.api('POST', '/api/auth/login', creds, { 'x-forwarded-proto': 'https' });
  assert.ok(!/Secure/.test(http.headers.get('set-cookie')), 'forwarded headers are ignored without trustProxy');
  assert.equal(http.headers.get('cache-control'), 'no-store');

  const proxied = await startTestServer({ auth: false, app: { trustProxy: true } });
  t.after(() => proxied.close());
  await proxied.app.auth.createUser(user);
  const https = await proxied.api('POST', '/api/auth/login', creds, { 'x-forwarded-proto': 'https' });
  assert.match(https.headers.get('set-cookie'), /; Secure/);
  const direct = await proxied.api('POST', '/api/auth/login', creds);
  assert.ok(!/Secure/.test(direct.headers.get('set-cookie')));
});

test('DELETE /api/auth/sessions signs the user out everywhere', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  await srv.app.auth.createUser(user);
  const creds = { email: user.email, password: user.password };
  const tokenOf = (res) => decodeURIComponent(res.headers.get('set-cookie').split(';')[0].slice('session='.length));
  const laptop = tokenOf(await srv.api('POST', '/api/auth/login', creds));
  const phone = tokenOf(await srv.api('POST', '/api/auth/login', creds));
  const bearer = (token) => ({ authorization: `Bearer ${token}` });

  assert.equal((await srv.api('GET', '/api/auth/me', undefined, bearer(phone))).status, 200);
  const res = await srv.api('DELETE', '/api/auth/sessions', undefined, bearer(laptop));
  assert.equal(res.status, 200);
  assert.equal(res.json.removed, 2);
  assert.equal((await srv.api('GET', '/api/auth/me', undefined, bearer(phone))).status, 401);
  assert.equal((await srv.api('DELETE', '/api/auth/sessions')).status, 401);
  assert.equal(srv.app.auditLog.list({ action: 'auth.logout_all' }).entries.length, 1);
});
