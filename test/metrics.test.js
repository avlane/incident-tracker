import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncident, incidentReducer } from '../server/incidents.js';
import { computeMetrics, mean, percentile, weekStart } from '../server/metrics.js';

const min = (n) => n * 60_000;

function incident(n, createdAt, { severity = 'sev3', affected = [], respondAfter, resolveAfter } = {}) {
  let inc = createIncident({ title: `i${n}`, severity, affected }, { id: `INC-${n}`, now: createdAt });
  const t0 = Date.parse(createdAt);
  if (respondAfter !== undefined) {
    inc = incidentReducer(inc, { type: 'post_update', at: new Date(t0 + respondAfter).toISOString(), message: 'looking' });
  }
  if (resolveAfter !== undefined) {
    inc = incidentReducer(inc, { type: 'post_update', at: new Date(t0 + resolveAfter).toISOString(), message: 'done', status: 'resolved' });
  }
  return inc;
}

test('mean and percentile handle empty and small lists', () => {
  assert.equal(mean([]), null);
  assert.equal(mean([1, 2, 4]), 2);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 90), 5);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 90), 40);
  assert.equal(percentile([40, 10, 30, 20], 25), 10);
});

test('weekStart is the UTC Monday', () => {
  assert.equal(weekStart(Date.parse('2025-02-03T00:00:00Z')), '2025-02-03'); // a Monday
  assert.equal(weekStart(Date.parse('2025-02-09T23:59:59Z')), '2025-02-03'); // Sunday
  assert.equal(weekStart(Date.parse('2025-02-10T00:00:00Z')), '2025-02-10');
});

const RANGE = { from: '2025-02-03T00:00:00.000Z', to: '2025-02-16T23:59:59.000Z' };

test('time to respond and resolve average only the incidents that have them', () => {
  const list = [
    incident(1, '2025-02-03T10:00:00.000Z', { respondAfter: min(5), resolveAfter: min(60) }),
    incident(2, '2025-02-04T10:00:00.000Z', { respondAfter: min(15), resolveAfter: min(120) }),
    incident(3, '2025-02-05T10:00:00.000Z'), // never answered, still open
  ];
  const m = computeMetrics(list, RANGE);
  assert.equal(m.total, 3);
  assert.equal(m.open, 1);
  assert.equal(m.resolved, 2);
  assert.deepEqual(m.timeToRespond, { meanMs: min(10), medianMs: min(5), p90Ms: min(15), samples: 2 });
  assert.equal(m.timeToResolve.meanMs, min(90));
  assert.equal(m.timeToResolve.samples, 2);
});

test('incidents outside the range are ignored', () => {
  const list = [incident(1, '2025-01-01T10:00:00.000Z'), incident(2, '2025-02-04T10:00:00.000Z', { severity: 'sev1' })];
  const m = computeMetrics(list, RANGE);
  assert.equal(m.total, 1);
  assert.deepEqual(m.bySeverity, { sev1: 1, sev2: 0, sev3: 0, sev4: 0 });
});

test('per-service counts sum resolution time and sort busiest first', () => {
  const list = [
    incident(1, '2025-02-03T10:00:00.000Z', { affected: [{ serviceId: 'api', impact: 'degraded' }], resolveAfter: min(30) }),
    incident(2, '2025-02-04T10:00:00.000Z', {
      affected: [{ serviceId: 'api', impact: 'degraded' }, { serviceId: 'api', componentId: 'db', impact: 'major_outage' }, { serviceId: 'web', impact: 'degraded' }],
      resolveAfter: min(60),
    }),
  ];
  const { byService } = computeMetrics(list, RANGE);
  assert.deepEqual(byService, [
    { serviceId: 'api', incidents: 2, resolvedMs: min(90) },
    { serviceId: 'web', incidents: 1, resolvedMs: min(60) },
  ]);
});

test('weekly buckets cover empty weeks and count resolutions by when they happened', () => {
  const list = [
    incident(1, '2025-02-09T22:00:00.000Z', { resolveAfter: min(180) }), // opened Sunday, resolved Monday
    incident(2, '2025-02-12T10:00:00.000Z'),
  ];
  const { weekly } = computeMetrics(list, { from: '2025-02-03T00:00:00.000Z', to: '2025-02-23T00:00:00.000Z' });
  assert.deepEqual(weekly, [
    { weekStart: '2025-02-03', opened: 1, resolved: 0 },
    { weekStart: '2025-02-10', opened: 1, resolved: 1 },
    { weekStart: '2025-02-17', opened: 0, resolved: 0 },
  ]);
});

test('no incidents gives nulls, not NaN', () => {
  const m = computeMetrics([], RANGE);
  assert.equal(m.total, 0);
  assert.equal(m.timeToRespond.meanMs, null);
  assert.equal(m.timeToResolve.p90Ms, null);
  assert.equal(m.weekly.length, 2);
});
