import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUptime } from '../server/uptime.js';

const NOW = '2026-02-11T12:00:00.000Z'; // noon: today has been running for 12 hours
const services = [
  { id: 'web', name: 'Web' },
  { id: 'api', name: 'API' },
];

const incident = (id, from, to, affected, extra = {}) => ({
  id,
  createdAt: from,
  resolvedAt: to,
  status: to ? 'resolved' : 'investigating',
  public: true,
  affected,
  ...extra,
});

const one = (list, serviceId = 'web', days = 1) => buildUptime({ services, incidents: list, now: NOW, days }).services.find((s) => s.id === serviceId);

test('no incidents means 100% and all-operational days', () => {
  const result = buildUptime({ services, incidents: [], now: NOW, days: 3 });
  assert.deepEqual(result.services.map((s) => s.name), ['API', 'Web']);
  assert.equal(result.services[0].uptimePercent, 100);
  assert.deepEqual(result.services[0].days, [
    { date: '2026-02-09', status: 'operational' },
    { date: '2026-02-10', status: 'operational' },
    { date: '2026-02-11', status: 'operational' },
  ]);
});

test('a major outage counts fully, a partial outage half, degraded not at all', () => {
  // the window for days=1 is 12 hours (midnight to noon today)
  const major = one([incident('a', '2026-02-11T00:00:00.000Z', '2026-02-11T03:00:00.000Z', [{ serviceId: 'web', impact: 'major_outage' }])]);
  assert.equal(major.uptimePercent, 75);
  const partial = one([incident('a', '2026-02-11T00:00:00.000Z', '2026-02-11T03:00:00.000Z', [{ serviceId: 'web', impact: 'partial_outage' }])]);
  assert.equal(partial.uptimePercent, 87.5);
  const degraded = one([incident('a', '2026-02-11T00:00:00.000Z', '2026-02-11T03:00:00.000Z', [{ serviceId: 'web', impact: 'degraded' }])]);
  assert.equal(degraded.uptimePercent, 100);
  assert.equal(degraded.days[0].status, 'degraded');
});

test('overlapping incidents are not counted twice and the worse one wins', () => {
  const list = [
    incident('a', '2026-02-11T00:00:00.000Z', '2026-02-11T04:00:00.000Z', [{ serviceId: 'web', impact: 'partial_outage' }]),
    incident('b', '2026-02-11T02:00:00.000Z', '2026-02-11T06:00:00.000Z', [{ serviceId: 'web', impact: 'major_outage' }]),
  ];
  // 0-2h half down (1h), 2-6h fully down (4h): 5h of 12h
  assert.equal(one(list).uptimePercent, 58.333);
});

test('open incidents run until now; incidents are clipped to the window', () => {
  const open = incident('a', '2026-02-11T06:00:00.000Z', null, [{ serviceId: 'web', impact: 'major_outage' }]);
  assert.equal(one([open]).uptimePercent, 50);
  const old = incident('b', '2026-02-01T00:00:00.000Z', '2026-02-10T12:00:00.000Z', [{ serviceId: 'web', impact: 'major_outage' }]);
  const result = one([old], 'web', 2);
  // window is 36h (Feb 10 00:00 to Feb 11 12:00); the outage covers Feb 10 00:00-12:00
  assert.equal(result.uptimePercent, 66.667);
  assert.deepEqual(result.days.map((d) => d.status), ['major_outage', 'operational']);
});

test('only the right service, and no private incidents', () => {
  const list = [
    incident('a', '2026-02-11T00:00:00.000Z', '2026-02-11T06:00:00.000Z', [{ serviceId: 'api', componentId: 'db', impact: 'major_outage' }]),
    incident('b', '2026-02-11T00:00:00.000Z', '2026-02-11T06:00:00.000Z', [{ serviceId: 'web', impact: 'major_outage' }], { public: false }),
  ];
  assert.equal(one(list, 'web').uptimePercent, 100);
  assert.equal(one(list, 'api').uptimePercent, 50);
});

test('several entries for one service in one incident use the worst', () => {
  const list = [
    incident('a', '2026-02-11T00:00:00.000Z', '2026-02-11T06:00:00.000Z', [
      { serviceId: 'web', componentId: 'cdn', impact: 'degraded' },
      { serviceId: 'web', componentId: 'origin', impact: 'major_outage' },
    ]),
  ];
  assert.equal(one(list).uptimePercent, 50);
});

test('the default window is 90 days', () => {
  assert.equal(buildUptime({ services, incidents: [], now: NOW }).services[0].days.length, 90);
});
