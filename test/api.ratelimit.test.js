import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

function manualClock() {
  let t = 1_000_000;
  const now = () => t;
  now.advance = (ms) => {
    t += ms;
  };
  return now;
}

test('the global limit returns 429 with Retry-After and then recovers', async (t) => {
  const now = manualClock();
  const srv = await startTestServer({ app: { rateLimit: { now, global: { limit: 3, windowMs: 60_000 } } } });
  t.after(() => srv.close());

  const first = await srv.anon('GET', '/api/status');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('ratelimit-limit'), '3');
  assert.equal(first.headers.get('ratelimit-remaining'), '2');
  await srv.anon('GET', '/api/status');
  await srv.anon('GET', '/api/status');

  const blocked = await srv.anon('GET', '/api/status');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');

  now.advance(60_000);
  assert.equal((await srv.anon('GET', '/api/status')).status, 200);
});

test('login attempts have their own, tighter limit and a success clears it', async (t) => {
  const now = manualClock();
  const srv = await startTestServer({
    auth: false,
    app: { rateLimit: { now, login: { limit: 3, windowMs: 900_000 } } },
  });
  t.after(() => srv.close());
  await srv.app.auth.createUser({ email: 'a@example.com', name: 'A', role: 'viewer', password: 'a fine passphrase' });
  const bad = { email: 'a@example.com', password: 'nope nope nope' };
  const good = { email: 'a@example.com', password: 'a fine passphrase' };

  assert.equal((await srv.api('POST', '/api/auth/login', bad)).status, 401);
  assert.equal((await srv.api('POST', '/api/auth/login', bad)).status, 401);
  assert.equal((await srv.api('POST', '/api/auth/login', good)).status, 200);
  // the success cleared the count, so three more tries are allowed
  assert.equal((await srv.api('POST', '/api/auth/login', bad)).status, 401);
  assert.equal((await srv.api('POST', '/api/auth/login', bad)).status, 401);
  assert.equal((await srv.api('POST', '/api/auth/login', bad)).status, 401);
  const locked = await srv.api('POST', '/api/auth/login', good);
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('retry-after'), '900');
});

test('X-Forwarded-For is ignored unless the proxy is trusted', async (t) => {
  const now = manualClock();
  const plain = await startTestServer({ app: { rateLimit: { now, global: { limit: 1, windowMs: 60_000 } } } });
  t.after(() => plain.close());
  await plain.anon('GET', '/api/status', undefined, { 'x-forwarded-for': '1.1.1.1' });
  assert.equal((await plain.anon('GET', '/api/status', undefined, { 'x-forwarded-for': '2.2.2.2' })).status, 429);

  const proxied = await startTestServer({
    app: { trustProxy: true, rateLimit: { now, global: { limit: 1, windowMs: 60_000 } } },
  });
  t.after(() => proxied.close());
  await proxied.anon('GET', '/api/status', undefined, { 'x-forwarded-for': '1.1.1.1' });
  assert.equal((await proxied.anon('GET', '/api/status', undefined, { 'x-forwarded-for': '2.2.2.2' })).status, 200);
  assert.equal((await proxied.anon('GET', '/api/status', undefined, { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' })).status, 429);
});
