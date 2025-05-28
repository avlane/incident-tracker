import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncident, incidentReducer } from '../server/incidents.js';
import { buildStatusPage } from '../server/statuspage.js';

const services = [
  { id: 'checkout', name: 'Checkout', description: '', components: [{ id: 'api', name: 'API' }, { id: 'db', name: 'Database' }] },
  { id: 'search', name: 'Search', description: '', components: [{ id: 'index', name: 'Indexer' }] },
];

const NOW = '2023-11-15T12:00:00.000Z';

function incident(n, input, at = '2023-11-15T10:00:00.000Z') {
  return createIncident({ title: `Incident ${n}`, severity: 'sev2', ...input }, { id: `INC-000${n}`, now: at });
}

test('with no incidents everything is operational', () => {
  const page = buildStatusPage({ services, incidents: [], now: NOW });
  assert.equal(page.overall.status, 'operational');
  assert.equal(page.overall.label, 'All systems operational');
  assert.deepEqual(page.services.map((s) => s.name), ['Checkout', 'Search']);
  assert.ok(page.services.every((s) => s.components.every((c) => c.status === 'operational')));
});

test('a component impact marks the component and rolls up to the service', () => {
  const inc = incident(1, { affected: [{ serviceId: 'checkout', componentId: 'db', impact: 'partial_outage' }] });
  const page = buildStatusPage({ services, incidents: [inc], now: NOW });
  const checkout = page.services.find((s) => s.id === 'checkout');
  assert.equal(checkout.status, 'partial_outage');
  assert.deepEqual(checkout.components.map((c) => c.status), ['operational', 'partial_outage']);
  assert.equal(page.services.find((s) => s.id === 'search').status, 'operational');
  assert.equal(page.overall.label, 'Partial outage');
});

test('a service-level impact applies to every component, worst impact wins', () => {
  const a = incident(1, { affected: [{ serviceId: 'search', impact: 'degraded' }] });
  const b = incident(2, { affected: [{ serviceId: 'search', componentId: 'index', impact: 'major_outage' }] });
  const page = buildStatusPage({ services, incidents: [a, b], now: NOW });
  const search = page.services.find((s) => s.id === 'search');
  assert.equal(search.status, 'major_outage');
  assert.equal(page.overall.status, 'major_outage');
});

test('resolved incidents stop affecting status and move to recent history', () => {
  let inc = incident(1, { affected: [{ serviceId: 'checkout', impact: 'major_outage' }] });
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-11-15T11:00:00.000Z', message: 'Fixed', status: 'resolved' });
  const page = buildStatusPage({ services, incidents: [inc], now: NOW });
  assert.equal(page.overall.status, 'operational');
  assert.equal(page.active.length, 0);
  assert.deepEqual(page.recent.map((i) => i.id), ['INC-0001']);
});

test('old resolved incidents fall off the page', () => {
  let inc = incident(1, {}, '2023-10-01T10:00:00.000Z');
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-10-01T11:00:00.000Z', message: 'Fixed', status: 'resolved' });
  assert.equal(buildStatusPage({ services, incidents: [inc], now: NOW }).recent.length, 0);
});

test('private incidents and internal updates never appear', () => {
  const hidden = incident(1, { public: false, affected: [{ serviceId: 'checkout', impact: 'major_outage' }] });
  let shown = incident(2, { commander: 'priya', summary: 'Public summary' });
  shown = incidentReducer(shown, { type: 'post_update', at: '2023-11-15T10:30:00.000Z', message: 'Customer X is affected, escalate', visibility: 'internal' });
  shown = incidentReducer(shown, { type: 'post_update', at: '2023-11-15T10:40:00.000Z', message: 'We are on it', status: 'identified' });
  const page = buildStatusPage({ services, incidents: [hidden, shown], now: NOW });
  assert.equal(page.overall.status, 'operational');
  assert.deepEqual(page.active.map((i) => i.id), ['INC-0002']);
  const json = JSON.stringify(page);
  assert.ok(!json.includes('priya'));
  assert.ok(!json.includes('escalate'));
  assert.deepEqual(page.active[0].updates.map((u) => u.message), ['We are on it', 'Public summary']);
});

const window = (extra = {}) => ({
  id: 'mnt_1',
  title: 'DB upgrade',
  message: 'Read-only for about an hour.',
  startsAt: '2023-11-15T11:00:00.000Z',
  endsAt: '2023-11-15T13:00:00.000Z',
  affected: [{ serviceId: 'checkout', componentId: 'db' }],
  canceled: false,
  ...extra,
});

test('an active maintenance window marks its component, quietly', () => {
  const page = buildStatusPage({ services, incidents: [], maintenance: [window()], now: NOW });
  const checkout = page.services.find((s) => s.id === 'checkout');
  assert.deepEqual(checkout.components.map((c) => c.status), ['operational', 'maintenance']);
  assert.equal(checkout.status, 'maintenance');
  assert.equal(page.overall.label, 'Scheduled maintenance in progress');
  assert.deepEqual(page.maintenance.active.map((w) => w.affected), [[{ service: 'Checkout', component: 'Database' }]]);
});

test('an incident outranks maintenance on the same component', () => {
  const inc = incident(1, { affected: [{ serviceId: 'checkout', componentId: 'db', impact: 'degraded' }] });
  const page = buildStatusPage({ services, incidents: [inc], maintenance: [window()], now: NOW });
  assert.equal(page.services[0].components[1].status, 'degraded');
  assert.equal(page.overall.status, 'degraded');
});

test('upcoming windows are listed soonest first within two weeks; canceled and finished ones are not', () => {
  const page = buildStatusPage({
    services,
    incidents: [],
    maintenance: [
      window({ id: 'late', startsAt: '2023-11-20T01:00:00.000Z', endsAt: '2023-11-20T02:00:00.000Z' }),
      window({ id: 'soon', startsAt: '2023-11-16T01:00:00.000Z', endsAt: '2023-11-16T02:00:00.000Z' }),
      window({ id: 'far', startsAt: '2024-01-01T01:00:00.000Z', endsAt: '2024-01-01T02:00:00.000Z' }),
      window({ id: 'canceled', startsAt: '2023-11-17T01:00:00.000Z', endsAt: '2023-11-17T02:00:00.000Z', canceled: true }),
      window({ id: 'done', startsAt: '2023-11-14T01:00:00.000Z', endsAt: '2023-11-14T02:00:00.000Z' }),
    ],
    now: NOW,
  });
  assert.deepEqual(page.maintenance.upcoming.map((w) => w.id), ['soon', 'late']);
  assert.equal(page.maintenance.active.length, 0);
  assert.equal(page.overall.status, 'operational');
});

test('a service-level window covers every component', () => {
  const page = buildStatusPage({ services, incidents: [], maintenance: [window({ affected: [{ serviceId: 'search' }] })], now: NOW });
  const search = page.services.find((s) => s.id === 'search');
  assert.equal(search.status, 'maintenance');
  assert.equal(search.components[0].status, 'maintenance');
});
