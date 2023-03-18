import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../server/router.js';

const handler = () => {};

test('matches literal and parameter segments', () => {
  const router = createRouter();
  router.get('/api/incidents/:id', handler);
  const hit = router.match('GET', '/api/incidents/INC-0001');
  assert.equal(hit.handler, handler);
  assert.deepEqual(hit.params, { id: 'INC-0001' });
});

test('decodes parameters and ignores a trailing slash', () => {
  const router = createRouter();
  router.get('/api/services/:slug', handler);
  assert.deepEqual(router.match('GET', '/api/services/web%20app/').params, { slug: 'web app' });
});

test('malformed escapes do not match instead of throwing', () => {
  const router = createRouter();
  router.get('/x/:id', handler);
  assert.equal(router.match('GET', '/x/%E0%A4%A'), null);
});

test('unknown paths give null and wrong methods list what is allowed', () => {
  const router = createRouter();
  router.get('/api/incidents', handler);
  router.post('/api/incidents', handler);
  assert.equal(router.match('GET', '/nope'), null);
  assert.deepEqual(router.match('DELETE', '/api/incidents').allowed, ['GET', 'POST']);
});

test('segment counts must agree', () => {
  const router = createRouter();
  router.get('/api/incidents/:id', handler);
  assert.equal(router.match('GET', '/api/incidents'), null);
  assert.equal(router.match('GET', '/api/incidents/a/b'), null);
});
