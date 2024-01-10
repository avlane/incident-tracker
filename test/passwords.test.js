import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, needsRehash, passwordProblems, verifyPassword } from '../server/passwords.js';

test('a hash verifies the right password and rejects others', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterz', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('every hash gets its own salt', async () => {
  const [a, b] = await Promise.all([hashPassword('same password!'), hashPassword('same password!')]);
  assert.notEqual(a, b);
});

test('unicode is normalised before hashing', async () => {
  const stored = await hashPassword('café au lait 12');
  assert.equal(await verifyPassword('café au lait 12', stored), true);
});

test('malformed stored values never verify and never throw', async () => {
  for (const bad of ['', 'plain', 'scrypt$x$y$z$a$b', 'bcrypt$1$2$3$a$b', null, undefined]) {
    assert.equal(await verifyPassword('anything', bad), false);
  }
});

test('needsRehash notices weaker parameters', async () => {
  const weak = await hashPassword('another password', { N: 1024 });
  assert.equal(needsRehash(weak), true);
  assert.equal(await verifyPassword('another password', weak), true);
  assert.equal(needsRehash(await hashPassword('another password')), false);
  assert.equal(needsRehash('garbage'), true);
});

test('passwordProblems', () => {
  assert.deepEqual(passwordProblems('a-fine-password'), []);
  assert.equal(passwordProblems('short').length, 1);
  assert.equal(passwordProblems('Password123').length, 1);
  assert.equal(passwordProblems('x'.repeat(201)).length, 1);
  assert.equal(passwordProblems(undefined).length, 1);
});
