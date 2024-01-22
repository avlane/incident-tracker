import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService, hasRole, hashToken } from '../server/auth.js';
import { createJsonStore } from '../server/store/json-store.js';
import { validateUserInput } from '../server/validators.js';
import { fakeClock } from './helpers.js';

// Cheap scrypt parameters keep these tests fast; they are not what runs for real.
const FAST = { N: 1024 };

function setup(options = {}) {
  const store = createJsonStore();
  const clock = options.clock ?? fakeClock('2024-01-24T09:00:00.000Z', 1000);
  let n = 0;
  const auth = createAuthService({ store, clock, hashParams: FAST, randomToken: () => `token-${++n}`, ...options });
  return { store, auth, clock };
}

const alice = { email: 'Alice@Example.com', name: 'Alice', role: 'admin', password: 'a long enough password' };

test('createUser normalises the email, hides the hash and rejects duplicates', async () => {
  const { auth, store } = setup();
  const user = await auth.createUser(alice);
  assert.equal(user.email, 'alice@example.com');
  assert.equal(user.passwordHash, undefined);
  assert.match(store.list('users')[0].passwordHash, /^scrypt\$/);
  await assert.rejects(auth.createUser({ ...alice, email: 'ALICE@example.com' }), { status: 409 });
});

test('createUser enforces the password policy', async () => {
  const { auth } = setup();
  await assert.rejects(auth.createUser({ ...alice, password: 'short' }), { status: 422 });
});

test('login returns a session whose token is only stored hashed', async () => {
  const { auth, store } = setup();
  await auth.createUser(alice);
  const session = await auth.login('alice@example.com', alice.password);
  assert.equal(session.token, 'token-1');
  assert.equal(session.user.role, 'admin');
  assert.equal(store.get('sessions', 'token-1'), null);
  assert.ok(store.get('sessions', hashToken('token-1')));
  assert.equal(auth.authenticate('token-1').user.name, 'Alice');
});

test('bad credentials all fail the same way', async () => {
  const { auth } = setup();
  await auth.createUser(alice);
  assert.equal(await auth.login('alice@example.com', 'wrong password!!'), null);
  assert.equal(await auth.login('nobody@example.com', alice.password), null);
  assert.equal(await auth.login(undefined, undefined), null);
  assert.equal(await auth.login('alice@example.com', 12345), null);
});

test('sessions expire and logout revokes them', async () => {
  let now = Date.parse('2024-01-24T09:00:00.000Z');
  const { auth, store } = setup({ sessionTtlMs: 5000, clock: () => new Date(now).toISOString() });
  await auth.createUser(alice);
  const first = await auth.login(alice.email, alice.password);
  now += 4999;
  assert.ok(auth.authenticate(first.token));
  now += 1;
  assert.equal(auth.authenticate(first.token), null);
  assert.equal(store.list('sessions').length, 0);

  const second = await auth.login(alice.email, alice.password);
  assert.equal(auth.logout(second.token), true);
  assert.equal(auth.authenticate(second.token), null);
});

test('disabled users cannot log in or keep using a session', async () => {
  const { auth, store } = setup();
  const user = await auth.createUser(alice);
  const session = await auth.login(alice.email, alice.password);
  store.put('users', { ...store.get('users', user.id), disabled: true });
  assert.equal(auth.authenticate(session.token), null);
  assert.equal(await auth.login(alice.email, alice.password), null);
});

test('authenticate ignores junk tokens', () => {
  const { auth } = setup();
  assert.equal(auth.authenticate(''), null);
  assert.equal(auth.authenticate(undefined), null);
  assert.equal(auth.authenticate('nope'), null);
});

test('roles are ordered viewer < responder < admin', () => {
  assert.equal(hasRole({ role: 'admin' }, 'responder'), true);
  assert.equal(hasRole({ role: 'responder' }, 'admin'), false);
  assert.equal(hasRole({ role: 'viewer' }, 'viewer'), true);
});

test('validateUserInput', () => {
  assert.deepEqual(validateUserInput({}).errors.map((e) => e.field).sort(), ['email', 'name', 'password', 'role']);
  assert.equal(validateUserInput({ ...alice }).value.email, 'alice@example.com');
  assert.equal(validateUserInput({ ...alice, email: 'nope' }).errors[0].field, 'email');
});
