import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent, generateSecret, signPayload, signatureHeader, verifySignature } from '../server/webhooks.js';

const BODY = '{"a":1}';

test('signPayload matches a precomputed HMAC-SHA256', () => {
  assert.equal(signPayload('whsec_test', 1718000000, BODY), '502bde99d2bded01820a40feb9edaad23be9e5a16853a603567b3108ddccec17');
});

test('signatureHeader uses whole seconds', () => {
  const header = signatureHeader('whsec_test', BODY, 1718000000999);
  assert.equal(header, 't=1718000000,v1=502bde99d2bded01820a40feb9edaad23be9e5a16853a603567b3108ddccec17');
});

test('a fresh, correct signature verifies', () => {
  const header = signatureHeader('whsec_test', BODY, 1718000000000);
  assert.equal(verifySignature({ secret: 'whsec_test', header, body: BODY, nowMs: 1718000100000 }), true);
});

test('wrong secret, tampered body and malformed headers fail', () => {
  const header = signatureHeader('whsec_test', BODY, 1718000000000);
  const now = 1718000000000;
  assert.equal(verifySignature({ secret: 'other', header, body: BODY, nowMs: now }), false);
  assert.equal(verifySignature({ secret: 'whsec_test', header, body: '{"a":2}', nowMs: now }), false);
  assert.equal(verifySignature({ secret: 'whsec_test', header: 'v1=abc', body: BODY, nowMs: now }), false);
  assert.equal(verifySignature({ secret: 'whsec_test', header: 't=1718000000,v1=zz', body: BODY, nowMs: now }), false);
  assert.equal(verifySignature({ secret: 'whsec_test', header: undefined, body: BODY, nowMs: now }), false);
});

test('old timestamps are rejected even with a valid signature', () => {
  const header = signatureHeader('whsec_test', BODY, 1718000000000);
  assert.equal(verifySignature({ secret: 'whsec_test', header, body: BODY, nowMs: 1718000301000 }), false);
  assert.equal(verifySignature({ secret: 'whsec_test', header, body: BODY, nowMs: 1718000300000 }), true);
});

test('any v1 value may match, to allow secret rotation', () => {
  const good = signPayload('whsec_new', 1718000000, BODY);
  const header = 't=1718000000,v1=' + signPayload('whsec_old', 1718000000, BODY) + ',v1=' + good;
  assert.equal(verifySignature({ secret: 'whsec_new', header, body: BODY, nowMs: 1718000000000 }), true);
});

test('secrets look like secrets and differ', () => {
  const [a, b] = [generateSecret(), generateSecret()];
  assert.match(a, /^whsec_[0-9a-f]{48}$/);
  assert.notEqual(a, b);
});

test('buildEvent wraps the incident', () => {
  const event = buildEvent('incident.created', { id: 'INC-0001' }, '2024-06-13T10:00:00.000Z', 'evt_1');
  assert.deepEqual(event, {
    id: 'evt_1',
    type: 'incident.created',
    createdAt: '2024-06-13T10:00:00.000Z',
    data: { incident: { id: 'INC-0001' } },
  });
});
