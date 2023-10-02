import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, incidentDuration, relativeTime } from '../src/lib/format.js';

test('formatDuration shows the two largest units', () => {
  assert.equal(formatDuration(30_000), '30s');
  assert.equal(formatDuration(90 * 60_000), '1h 30m');
  assert.equal(formatDuration(((2 * 24 + 5) * 60 + 10) * 60_000), '2d 5h');
  assert.equal(formatDuration(Number.NaN), 'n/a');
});

test('relativeTime', () => {
  const now = Date.parse('2023-08-30T12:00:00Z');
  assert.equal(relativeTime('2023-08-30T11:59:50Z', now), 'just now');
  assert.equal(relativeTime('2023-08-30T11:15:00Z', now), '45m ago');
  assert.equal(relativeTime('2023-08-30T13:00:00Z', now), 'in the future');
  assert.equal(relativeTime('2023-08-30T12:00:45Z', now), 'just now');
});

test('incidentDuration uses resolvedAt when present', () => {
  const open = { createdAt: '2023-08-30T10:00:00Z', resolvedAt: null };
  const done = { createdAt: '2023-08-30T10:00:00Z', resolvedAt: '2023-08-30T10:12:00Z' };
  assert.equal(incidentDuration(open, Date.parse('2023-08-30T11:00:00Z')), '1h');
  assert.equal(incidentDuration(done, Date.parse('2023-09-01T00:00:00Z')), '12m');
});

test('an open incident never shows a negative duration under clock skew', () => {
  const open = { createdAt: '2023-08-30T10:00:30Z', resolvedAt: null };
  assert.equal(incidentDuration(open, Date.parse('2023-08-30T10:00:00Z')), '0s');
});
