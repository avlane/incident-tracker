import test from 'node:test';
import assert from 'node:assert/strict';
import { dayBars, formatUptime, uptimeById } from '../src/lib/uptime.js';

test('formatUptime never rounds up to a better figure', () => {
  assert.equal(formatUptime(100), '100%');
  assert.equal(formatUptime(99.5), '99.5%');
  assert.equal(formatUptime(99.9996), '99.999%');
  assert.equal(formatUptime(99.99999), '99.999%');
  assert.equal(formatUptime(0), '0%');
  assert.equal(formatUptime(Number.NaN), 'n/a');
  assert.equal(formatUptime(undefined), 'n/a');
});

test('dayBars label each day with its status', () => {
  const bars = dayBars([
    { date: '2026-03-10', status: 'operational' },
    { date: '2026-03-11', status: 'major_outage' },
    { date: '2026-03-12', status: 'mystery' },
  ]);
  assert.deepEqual(bars.map((b) => b.className), ['st-operational', 'st-major_outage', 'st-unknown']);
  assert.equal(bars[1].title, '2026-03-11: Major outage');
  assert.equal(bars[2].title, '2026-03-12: mystery');
});

test('uptimeById handles a missing uptime block (an older server)', () => {
  assert.deepEqual(uptimeById(undefined), {});
  assert.deepEqual(Object.keys(uptimeById({ services: [{ id: 'web' }, { id: 'api' }] })), ['web', 'api']);
});
