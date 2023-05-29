import test from 'node:test';
import assert from 'node:assert/strict';
import { createService, slugify, updateService } from '../server/services.js';
import { validateServiceInput } from '../server/validators.js';
import { startTestServer } from './helpers.js';

const NOW = '2023-05-27T10:00:00.000Z';

test('slugify handles accents, punctuation and edge dashes', () => {
  assert.equal(slugify('Checkout & Payments'), 'checkout-payments');
  assert.equal(slugify('  Café API!! '), 'cafe-api');
  assert.equal(slugify('###'), '');
});

test('createService derives ids and keeps them unique', () => {
  const svc = createService(
    { name: 'Search', components: ['API', 'Indexer', 'api'] },
    { takenIds: new Set(['search']), now: NOW },
  );
  assert.equal(svc.id, 'search-2');
  assert.deepEqual(svc.components.map((c) => c.id), ['api', 'indexer', 'api-2']);
});

test('updateService keeps component ids for names that stay', () => {
  const svc = createService({ name: 'Search', components: ['API', 'Indexer'] }, { takenIds: new Set(), now: NOW });
  const next = updateService(svc, { components: ['Indexer', 'Cache'] }, { now: NOW });
  assert.deepEqual(next.components, [
    { id: 'indexer', name: 'Indexer' },
    { id: 'cache', name: 'Cache' },
  ]);
  assert.equal(next.name, 'Search');
});

test('validateServiceInput requires a name unless partial', () => {
  assert.equal(validateServiceInput({}).errors[0].field, 'name');
  assert.deepEqual(validateServiceInput({ description: 'x' }, { partial: true }).errors, []);
  assert.equal(validateServiceInput({ name: 'a', components: [1] }).errors[0].field, 'components');
});

test('service routes: create, conflict, update, delete', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());

  const created = await srv.api('POST', '/api/services', { name: 'Checkout', components: ['API', 'Database'] });
  assert.equal(created.status, 201);
  assert.equal(created.json.service.id, 'checkout');

  assert.equal((await srv.api('POST', '/api/services', { name: 'checkout' })).status, 409);

  const patched = await srv.api('PATCH', '/api/services/checkout', { description: 'Cart and payments' });
  assert.equal(patched.json.service.description, 'Cart and payments');
  assert.equal(patched.json.service.components.length, 2);

  const list = await srv.api('GET', '/api/services');
  assert.deepEqual(list.json.services.map((s) => s.id), ['checkout']);

  assert.equal((await srv.api('DELETE', '/api/services/checkout')).status, 204);
  assert.equal((await srv.api('GET', '/api/services/checkout')).status, 404);
});
