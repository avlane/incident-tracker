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

test('migrate-store copies a JSON database into an empty SQLite one', async () => {
  const { createJsonStore } = await import('../server/store/json-store.js');
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    return; // node:sqlite unavailable here
  }
  const { createSqliteStore } = await import('../server/store/sqlite-store.js');
  const source = createJsonStore();
  source.put('incidents', { id: 'INC-0001', title: 'a' });
  source.put('services', { id: 'checkout' });
  source.nextSeq('incident');
  const target = createSqliteStore({ DatabaseSync });
  const lines = [];
  // the command closes what it opens, so hand it wrappers that keep the data readable
  const keepOpen = (store) => ({ ...store, close() {} });
  const deps = {
    out: (l) => lines.push(l),
    openJson: async () => keepOpen(source),
    openSqlite: async () => keepOpen(target),
  };
  assert.equal(await runCommand(['migrate-store', '--from', 'a.json', '--to', 'b.db'], deps), 0);
  assert.deepEqual(lines, ['incidents: 1', 'services: 1', 'done']);
  assert.equal(target.get('incidents', 'INC-0001').title, 'a');
  assert.equal(target.nextSeq('incident'), 2);

  await assert.rejects(runCommand(['migrate-store', '--from', 'a.json', '--to', 'b.db'], deps), /already contains data/);
  await assert.rejects(runCommand(['migrate-store', '--from', 'a.json'], deps), /--from and --to are required/);
  target.close();
});
