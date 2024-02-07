import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

const user = { email: 'sam@example.com', name: 'Sam', role: 'responder', password: 'a decent passphrase' };

test('login sets a cookie that identifies the user until logout', async (t) => {
  const srv = await startTestServer();
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
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.app.auth.createUser(user);
  const login = await srv.api('POST', '/api/auth/login', { email: user.email, password: user.password });
  const token = decodeURIComponent(login.headers.get('set-cookie').split(';')[0].slice('session='.length));
  const me = await srv.api('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(me.status, 200);
});

test('bad credentials are a 401 and missing fields a 422', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.app.auth.createUser(user);
  const bad = await srv.api('POST', '/api/auth/login', { email: user.email, password: 'wrong wrong wrong' });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error.message, 'invalid email or password');
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.equal((await srv.api('POST', '/api/auth/login', { email: user.email })).status, 422);
});
