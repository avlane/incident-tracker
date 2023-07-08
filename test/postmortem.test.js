import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncident, incidentReducer } from '../server/incidents.js';
import { generatePostmortem } from '../server/postmortem.js';
import { formatDuration } from '../server/time.js';

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(45_000), '45s');
  assert.equal(formatDuration(5 * 60_000), '5m');
  assert.equal(formatDuration(80 * 60_000), '1h 20m');
  assert.equal(formatDuration((26 * 60 + 5) * 60_000), '1d 2h');
  assert.equal(formatDuration(-1), 'n/a');
  assert.equal(formatDuration(NaN), 'n/a');
});

const services = [{ id: 'checkout', name: 'Checkout', components: [{ id: 'api', name: 'API' }] }];

function resolvedIncident() {
  let inc = createIncident(
    {
      title: 'Card payments | failing',
      summary: 'Payments returned 502.',
      severity: 'sev1',
      commander: 'Priya',
      affected: [{ serviceId: 'checkout', componentId: 'api', impact: 'major_outage' }],
    },
    { id: 'INC-0007', now: '2023-07-08T14:00:00.000Z' },
  );
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-07-08T14:20:00.000Z', author: 'Sam', status: 'identified', message: 'Bad config pushed.\nSecond line.' });
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-07-08T15:20:00.000Z', status: 'resolved', message: 'Reverted.' });
  return inc;
}

test('postmortem contains the facts the tracker knows', () => {
  const md = generatePostmortem(resolvedIncident(), { services });
  assert.match(md, /^# Postmortem: INC-0007 Card payments \| failing$/m);
  assert.match(md, /\| Severity \| SEV1 \|/);
  assert.match(md, /\| Duration \| 1h 20m \|/);
  assert.match(md, /\| Started \| 2023-07-08 14:00 UTC \|/);
  assert.match(md, /- Checkout \/ API: major outage/);
  assert.match(md, /- 2023-07-08 14:20 \*\*Identified\*\* \(Sam\): Bad config pushed\.\n  Second line\./);
  assert.match(md, /- 2023-07-08 15:20 \*\*Resolved\*\*: Reverted\./);
  assert.match(md, /## Action items/);
});

test('an open incident reports the duration so far', () => {
  const inc = createIncident({ title: 'x', severity: 'sev3' }, { id: 'INC-0001', now: '2023-07-08T14:00:00.000Z' });
  const md = generatePostmortem(inc, { now: '2023-07-08T14:30:00.000Z' });
  assert.match(md, /\| Resolved \| still open \|/);
  assert.match(md, /\| Duration \| 30m so far \|/);
  assert.match(md, /No services were marked as affected/);
});

test('table cells are escaped', () => {
  const inc = createIncident({ title: 'x', severity: 'sev3', commander: 'a|b' }, { id: 'INC-0001', now: '2023-07-08T14:00:00.000Z' });
  assert.match(generatePostmortem(inc), /\| Commander \| a\\\|b \|/);
});
