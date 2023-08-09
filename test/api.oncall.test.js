import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

const body = { name: 'Primary', members: ['ana', 'ben'], startsAt: '2023-03-27T09:00:00Z' };

test('schedules report who is on call now', async (t) => {
  const srv = await startTestServer({ clock: () => '2023-04-05T10:00:00.000Z' });
  t.after(() => srv.close());
  const created = await srv.api('POST', '/api/oncall', body);
  assert.equal(created.status, 201);
  assert.equal(created.json.schedule.id, 'primary');
  assert.equal(created.json.schedule.current.who, 'ben');
  assert.equal(created.json.schedule.upcoming.length, 4);

  const list = await srv.api('GET', '/api/oncall');
  assert.equal(list.json.schedules[0].current.who, 'ben');
});

test('overrides change who is on call', async (t) => {
  const srv = await startTestServer({ clock: () => '2023-04-05T10:00:00.000Z' });
  t.after(() => srv.close());
  await srv.api('POST', '/api/oncall', body);
  const res = await srv.api('POST', '/api/oncall/primary/overrides', {
    who: 'cy',
    from: '2023-04-05T00:00:00Z',
    to: '2023-04-06T00:00:00Z',
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.schedule.current.who, 'cy');
  const bad = await srv.api('POST', '/api/oncall/primary/overrides', { who: 'cy', from: 'x', to: 'y' });
  assert.equal(bad.status, 422);
});

test('new incidents default their commander to whoever is on call', async (t) => {
  const srv = await startTestServer({ clock: () => '2023-04-05T10:00:00.000Z' });
  t.after(() => srv.close());
  const before = await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  assert.equal(before.json.incident.commander, null);

  await srv.api('POST', '/api/oncall', body);
  const auto = await srv.api('POST', '/api/incidents', { title: 'y', severity: 'sev3' });
  assert.equal(auto.json.incident.commander, 'ben');
  const manual = await srv.api('POST', '/api/incidents', { title: 'z', severity: 'sev3', commander: 'dee' });
  assert.equal(manual.json.incident.commander, 'dee');
});

test('unknown schedules are 404 and deleting works', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  assert.equal((await srv.api('GET', '/api/oncall/nope')).status, 404);
  await srv.api('POST', '/api/oncall', body);
  assert.equal((await srv.api('DELETE', '/api/oncall/primary')).status, 204);
  assert.equal((await srv.api('GET', '/api/oncall')).json.schedules.length, 0);
});
