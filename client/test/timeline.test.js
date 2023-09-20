import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedStatuses, buildTimeline, emptyUpdateForm, toUpdatePayload } from '../src/lib/timeline.js';

const incident = {
  id: 'INC-0001',
  status: 'identified',
  severity: 'sev2',
  createdAt: '2023-09-20T10:00:00.000Z',
  updates: [
    { id: 1, at: '2023-09-20T10:00:00.000Z', status: 'investigating', severity: 'sev3', message: 'opened' },
    { id: 2, at: '2023-09-20T10:25:00.000Z', status: 'identified', severity: 'sev2', message: 'found it' },
    { id: 3, at: '2023-09-20T12:30:00.000Z', status: 'identified', severity: 'sev2', message: 'still working' },
  ],
};

test('buildTimeline labels offsets and flags changes', () => {
  const t = buildTimeline(incident);
  assert.deepEqual(t.map((e) => e.offset), ['start', '+25m', '+2h 30m']);
  assert.deepEqual(t.map((e) => e.statusChanged), [false, true, false]);
  assert.deepEqual(t.map((e) => e.severityChanged), [false, true, false]);
});

test('a resolved incident only offers reopening', () => {
  assert.deepEqual(allowedStatuses('resolved'), ['resolved', 'investigating']);
  assert.equal(allowedStatuses('monitoring').length, 4);
});

test('update payload only carries changes', () => {
  const values = { ...emptyUpdateForm(incident), message: ' Fix deployed ', status: 'monitoring' };
  assert.deepEqual(toUpdatePayload(values, incident), { message: 'Fix deployed', status: 'monitoring' });
  assert.deepEqual(
    toUpdatePayload({ ...values, status: 'identified', severity: 'sev1', author: ' sam ' }, incident),
    { message: 'Fix deployed', severity: 'sev1', author: 'sam' },
  );
});
