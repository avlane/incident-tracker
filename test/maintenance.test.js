import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaintenance, maintenanceState } from '../server/maintenance.js';
import { validateMaintenanceInput } from '../server/validators.js';
import { startTestServer } from './helpers.js';

const window = createMaintenance(
  { title: 'DB upgrade', startsAt: '2025-05-20T02:00:00.000Z', endsAt: '2025-05-20T04:00:00.000Z' },
  { id: 'mnt_1', now: '2025-05-16T10:00:00.000Z' },
);

test('state follows the clock and cancellation wins', () => {
  assert.equal(maintenanceState(window, '2025-05-20T01:59:59.000Z'), 'scheduled');
  assert.equal(maintenanceState(window, '2025-05-20T02:00:00.000Z'), 'active');
  assert.equal(maintenanceState(window, '2025-05-20T03:59:59.000Z'), 'active');
  assert.equal(maintenanceState(window, '2025-05-20T04:00:00.000Z'), 'completed');
  assert.equal(maintenanceState({ ...window, canceled: true }, '2025-05-20T03:00:00.000Z'), 'canceled');
});

test('validation of times and length', () => {
  const ok = { title: 't', startsAt: '2025-05-20T02:00:00Z', endsAt: '2025-05-20T03:00:00Z' };
  assert.deepEqual(validateMaintenanceInput(ok).errors, []);
  assert.equal(validateMaintenanceInput({ ...ok, endsAt: '2025-05-20T01:00:00Z' }).errors[0].message, 'endsAt must be after startsAt');
  assert.match(validateMaintenanceInput({ ...ok, endsAt: '2025-06-20T01:00:00Z' }).errors[0].message, /at most 7 days/);
  assert.deepEqual(validateMaintenanceInput({}).errors.map((e) => e.field).sort(), ['endsAt', 'startsAt', 'title']);
  assert.deepEqual(validateMaintenanceInput({ canceled: true }, { partial: true }).value, { canceled: true });
});

const body = { title: 'DB upgrade', startsAt: '2025-05-20T02:00:00Z', endsAt: '2025-05-20T04:00:00Z', affected: [{ serviceId: 'checkout', componentId: 'db' }] };

test('create, list by state and cancel', async (t) => {
  const srv = await startTestServer({ clock: () => '2025-05-16T10:00:00.000Z' });
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout', components: ['API', 'DB'] });

  const created = await srv.api('POST', '/api/maintenance', body);
  assert.equal(created.status, 201);
  assert.equal(created.json.maintenance.state, 'scheduled');

  assert.equal((await srv.api('GET', '/api/maintenance?state=scheduled')).json.maintenance.length, 1);
  assert.equal((await srv.api('GET', '/api/maintenance?state=active')).json.maintenance.length, 0);

  const id = created.json.maintenance.id;
  const canceled = await srv.api('PATCH', `/api/maintenance/${id}`, { canceled: true });
  assert.equal(canceled.json.maintenance.state, 'canceled');
  assert.deepEqual(srv.app.auditLog.list().entries.map((e) => e.action), ['maintenance.cancel', 'maintenance.create', 'service.create']);
});

test('affected services must exist and reschedules are re-checked', async (t) => {
  const srv = await startTestServer({ clock: () => '2025-05-16T10:00:00.000Z' });
  t.after(() => srv.close());
  assert.equal((await srv.api('POST', '/api/maintenance', body)).status, 422);
  await srv.api('POST', '/api/services', { name: 'Checkout', components: ['DB'] });
  const { maintenance } = (await srv.api('POST', '/api/maintenance', body)).json;
  const bad = await srv.api('PATCH', `/api/maintenance/${maintenance.id}`, { endsAt: '2025-05-20T01:00:00Z' });
  assert.equal(bad.status, 422);
  const moved = await srv.api('PATCH', `/api/maintenance/${maintenance.id}`, { startsAt: '2025-05-21T02:00:00Z', endsAt: '2025-05-21T03:00:00Z' });
  assert.equal(moved.json.maintenance.startsAt, '2025-05-21T02:00:00.000Z');
});

test('a completed window cannot be edited; only admins can create', async (t) => {
  const srv = await startTestServer({ clock: () => '2025-06-01T00:00:00.000Z' });
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout', components: ['DB'] });
  const { maintenance } = (await srv.api('POST', '/api/maintenance', body)).json;
  assert.equal(maintenance.state, 'completed');
  assert.equal((await srv.api('PATCH', `/api/maintenance/${maintenance.id}`, { title: 'x' })).status, 422);
  const responder = await srv.as('responder');
  assert.equal((await responder('POST', '/api/maintenance', body)).status, 403);
  assert.equal((await responder('GET', '/api/maintenance')).status, 200);
  assert.equal((await srv.api('GET', '/api/maintenance/mnt_nope')).status, 404);
});
