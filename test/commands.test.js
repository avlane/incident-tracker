import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../server/auth.js';
import { runCommand } from '../server/commands.js';
import { createJsonStore } from '../server/store/json-store.js';
import { fakeClock } from './helpers.js';

function setup(extra = {}) {
  const store = createJsonStore();
  const auth = createAuthService({ store, clock: fakeClock(), hashParams: { N: 1024 } });
  const lines = [];
  const deps = { auth, readStdin: async () => 'a stdin passphrase\n', env: {}, out: (l) => lines.push(l), ...extra };
  return { store, auth, lines, deps };
}

test('create-user reads the password from stdin', async () => {
  const { auth, lines, deps } = setup();
  const code = await runCommand(
    ['create-user', '--email', 'ops@example.com', '--name', 'Ops', '--role', 'admin', '--password-stdin'],
    deps,
  );
  assert.equal(code, 0);
  assert.match(lines[0], /^created admin ops@example\.com \(usr_/);
  assert.ok(await auth.login('ops@example.com', 'a stdin passphrase'));
});

test('create-user can take the password from the environment and defaults to responder', async () => {
  const { auth, deps } = setup({ env: { INCIDENT_PASSWORD: 'from the environment' } });
  await runCommand(['create-user', '--email', 'r@example.com', '--name', 'R'], deps);
  assert.equal(auth.findByEmail('r@example.com').role, 'responder');
});

test('create-user reports missing pieces', async () => {
  const { deps } = setup();
  await assert.rejects(runCommand(['create-user', '--email', 'x@example.com'], deps), /--email and --name are required/);
  await assert.rejects(runCommand(['create-user', '--email', 'x@example.com', '--name', 'X'], deps), /no password given/);
  await assert.rejects(
    runCommand(['create-user', '--email', 'x@example.com', '--name', 'X', '--role', 'boss', '--password-stdin'], deps),
    /role must be one of/,
  );
});

test('weak passwords are rejected by the service', async () => {
  const { deps } = setup({ readStdin: async () => 'short' });
  await assert.rejects(
    runCommand(['create-user', '--email', 'x@example.com', '--name', 'X', '--password-stdin'], deps),
    { status: 422 },
  );
});

test('list-users and unknown commands', async () => {
  const { auth, lines, deps } = setup();
  await auth.createUser({ email: 'a@example.com', name: 'Ann', role: 'viewer', password: 'a long enough pass' });
  assert.equal(await runCommand(['list-users'], deps), 0);
  assert.match(lines[0], /viewer\s+a@example\.com\s+Ann/);
  await assert.rejects(runCommand(['frobnicate'], deps), /usage:/);
});
