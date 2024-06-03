import test from 'node:test';
import assert from 'node:assert/strict';
import { canRespond, hasRole, initialSession, sessionReducer } from '../src/lib/session.js';
import { createApi } from '../src/lib/api.js';

const sam = { id: 'usr_1', name: 'Sam', role: 'responder' };

test('loading resolves to signed in or anonymous', () => {
  assert.equal(sessionReducer(initialSession, { type: 'loaded', user: sam }).status, 'signed_in');
  assert.equal(sessionReducer(initialSession, { type: 'loaded', user: null }).status, 'anonymous');
});

test('expiry only matters while signed in and leaves a notice', () => {
  const signedIn = sessionReducer(initialSession, { type: 'signed_in', user: sam });
  const expired = sessionReducer(signedIn, { type: 'expired' });
  assert.equal(expired.status, 'anonymous');
  assert.match(expired.notice, /expired/);
  assert.equal(sessionReducer(initialSession, { type: 'expired' }), initialSession);
  assert.equal(sessionReducer(expired, { type: 'signed_in', user: sam }).notice, null);
});

test('sign out clears the user', () => {
  const state = sessionReducer({ status: 'signed_in', user: sam, notice: null }, { type: 'signed_out' });
  assert.deepEqual(state, { status: 'anonymous', user: null, notice: null });
});

test('role checks', () => {
  assert.equal(canRespond({ role: 'viewer' }), false);
  assert.equal(canRespond(sam), true);
  assert.equal(hasRole({ role: 'admin' }, 'responder'), true);
  assert.equal(hasRole(null, 'viewer'), false);
});

function fakeFetch(status, body) {
  return async () => ({
    status,
    ok: status < 300,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

test('a 401 on a normal call notifies onUnauthorized', async () => {
  let called = 0;
  const api = createApi({ fetchImpl: fakeFetch(401, { error: { message: 'sign in required' } }), onUnauthorized: () => called++ });
  await assert.rejects(api.listIncidents(), { status: 401 });
  assert.equal(called, 1);
});

test('a failed login is not a session expiry', async () => {
  let called = 0;
  const api = createApi({ fetchImpl: fakeFetch(401, { error: { message: 'invalid email or password' } }), onUnauthorized: () => called++ });
  await assert.rejects(api.login('a@example.com', 'x'), { message: 'invalid email or password' });
  await assert.rejects(api.me(), { status: 401 });
  assert.equal(called, 0);
});
