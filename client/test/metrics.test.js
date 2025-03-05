import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeParams, summaryCards, weeklyBars } from '../src/lib/metrics.js';
import { parseHash } from '../src/lib/route.js';

test('rangeParams counts back from now and falls back to 30 days', () => {
  const now = Date.parse('2025-03-03T12:00:00Z');
  assert.deepEqual(rangeParams('7d', now), { from: '2025-02-24T12:00:00.000Z', to: '2025-03-03T12:00:00.000Z' });
  assert.equal(rangeParams('nonsense', now).from, '2025-02-01T12:00:00.000Z');
});

test('summaryCards shows dashes when there is nothing to average', () => {
  const metrics = {
    total: 0,
    open: 0,
    resolved: 0,
    timeToRespond: { meanMs: null, medianMs: null },
    timeToResolve: { medianMs: null, p90Ms: null },
  };
  const cards = summaryCards(metrics);
  assert.equal(cards[1].value, '-');
  assert.equal(cards[2].detail, 'p90 -');
});

test('summaryCards formats durations', () => {
  const metrics = {
    total: 4,
    open: 1,
    resolved: 3,
    timeToRespond: { meanMs: 600_000, medianMs: 300_000 },
    timeToResolve: { medianMs: 5_400_000, p90Ms: 86_400_000 },
  };
  const cards = summaryCards(metrics);
  assert.deepEqual(cards.map((c) => c.value), ['4', '5m', '1h 30m', '3']);
  assert.equal(cards[0].detail, '1 still open');
  assert.equal(cards[2].detail, 'p90 1d');
});

test('weeklyBars scales to the busiest week and keeps small counts visible', () => {
  const bars = weeklyBars([
    { weekStart: '2025-02-03', opened: 50, resolved: 25 },
    { weekStart: '2025-02-10', opened: 1, resolved: 0 },
    { weekStart: '2025-02-17', opened: 0, resolved: 0 },
  ]);
  assert.deepEqual(bars.map((b) => [b.openedPct, b.resolvedPct]), [[100, 50], [2, 0], [0, 0]]);
  assert.deepEqual(weeklyBars([]), []);
  assert.equal(weeklyBars([{ weekStart: 'x', opened: 0, resolved: 0 }])[0].openedPct, 0);
});

test('the metrics page has a route', () => {
  assert.deepEqual(parseHash('#/metrics'), { name: 'metrics' });
});
