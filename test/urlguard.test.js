import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, webhookUrlProblem } from '../server/urlguard.js';

test('ordinary https URLs pass', () => {
  assert.equal(webhookUrlProblem('https://hooks.example.com/incidents?token=abc'), null);
  assert.equal(webhookUrlProblem('https://8.8.8.8/hook'), null);
});

test('non-https, credentials and garbage are rejected', () => {
  assert.equal(webhookUrlProblem('http://hooks.example.com/x'), 'url must use https');
  assert.equal(webhookUrlProblem('ftp://hooks.example.com/x'), 'url must use https');
  assert.equal(webhookUrlProblem('https://user:pw@hooks.example.com/x'), 'url must not contain credentials');
  assert.equal(webhookUrlProblem('not a url'), 'url is not a valid URL');
});

test('local and internal hosts are rejected', () => {
  for (const u of [
    'https://localhost/x',
    'https://app.localhost/x',
    'https://printer.local/x',
    'https://db.internal/x',
    'https://127.0.0.1/x',
    'https://10.1.2.3/x',
    'https://172.20.0.1/x',
    'https://192.168.1.10/x',
    'https://169.254.169.254/latest/meta-data',
    'https://100.64.0.1/x',
    'https://[::1]/x',
    'https://[fd00::1]/x',
    'https://[fe80::1]/x',
    'https://[::ffff:10.0.0.1]/x',
  ]) {
    assert.ok(webhookUrlProblem(u), `${u} should be rejected`);
  }
});

test('addresses just outside the private ranges are fine', () => {
  assert.equal(isPrivateAddress('172.32.0.1'), false);
  assert.equal(isPrivateAddress('172.15.0.1'), false);
  assert.equal(isPrivateAddress('100.128.0.1'), false);
  assert.equal(isPrivateAddress('2606:4700::1111'), false);
  assert.equal(isPrivateAddress('example.com'), false);
});

test('allowPrivate relaxes the host and scheme rules but not credentials', () => {
  assert.equal(webhookUrlProblem('http://localhost:9000/hook', { allowPrivate: true }), null);
  assert.equal(webhookUrlProblem('http://user:pw@localhost/hook', { allowPrivate: true }), 'url must not contain credentials');
});
