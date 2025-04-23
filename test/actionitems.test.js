import test from 'node:test';
import assert from 'node:assert/strict';
import { collectActionItems } from '../server/actionitems.js';
import { startTestServer } from './helpers.js';

const incidents = [
  { id: 'INC-0001', title: 'A', postmortem: { actionItems: [{ action: 'late one', owner: 'Priya', due: '2025-04-01' }, { action: 'no date' }] } },
  { id: 'INC-0002', title: 'B', postmortem: { actionItems: [{ action: 'soon', owner: 'priya', due: '2025-05-10' }, { action: 'sam task', owner: 'Sam', due: '2025-04-20' }] } },
  { id: 'INC-0003', title: 'C', postmortem: null },
];
const NOW = '2025-04-23T12:00:00.000Z';

test('items are sorted by due date with undated ones last', () => {
  const items = collectActionItems(incidents, { now: NOW });
  assert.deepEqual(items.map((i) => i.action), ['late one', 'sam task', 'soon', 'no date']);
  assert.deepEqual(items.map((i) => i.overdue), [true, true, false, false]);
});

test('owner filter ignores case and overdue filter keeps only late items', () => {
  assert.deepEqual(collectActionItems(incidents, { owner: 'PRIYA', now: NOW }).map((i) => i.action), ['late one', 'soon']);
  assert.deepEqual(collectActionItems(incidents, { overdueOnly: true, now: NOW }).map((i) => i.action), ['late one', 'sam task']);
});

test('an item due today is not overdue yet', () => {
  const items = collectActionItems([{ id: 'I', title: 't', postmortem: { actionItems: [{ action: 'x', due: '2025-04-23' }] } }], { now: NOW });
  assert.equal(items[0].overdue, false);
});

test('GET /api/action-items across incidents', async (t) => {
  const srv = await startTestServer({ clock: () => NOW });
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'one', severity: 'sev3' });
  await srv.api('POST', '/api/incidents', { title: 'two', severity: 'sev3' });
  await srv.api('PUT', '/api/incidents/INC-0001/postmortem', { actionItems: [{ action: 'fix alerts', owner: 'Sam', due: '2025-04-01' }] });
  await srv.api('PUT', '/api/incidents/INC-0002/postmortem', { actionItems: [{ action: 'write runbook', owner: 'Ana', due: '2025-06-01' }] });
  const all = await srv.api('GET', '/api/action-items');
  assert.equal(all.json.total, 2);
  assert.equal(all.json.items[0].incidentId, 'INC-0001');
  const late = await srv.api('GET', '/api/action-items?overdue=true');
  assert.deepEqual(late.json.items.map((i) => i.action), ['fix alerts']);
  assert.equal((await srv.api('GET', '/api/action-items?owner=ana')).json.total, 1);
});
