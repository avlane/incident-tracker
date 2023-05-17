import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, createIncident, formatIncidentId, incidentReducer, isOpen } from '../server/incidents.js';
import { validateIncidentInput, validateUpdateInput } from '../server/validators.js';

test('formatIncidentId pads to four digits', () => {
  assert.equal(formatIncidentId(7), 'INC-0007');
  assert.equal(formatIncidentId(12345), 'INC-12345');
});

test('createIncident starts in investigating with matching timestamps', () => {
  const inc = createIncident(
    { title: 'API 500s', severity: 'sev2' },
    { id: 'INC-0001', now: '2023-02-01T10:00:00.000Z' },
  );
  assert.equal(inc.status, 'investigating');
  assert.equal(inc.createdAt, inc.updatedAt);
  assert.equal(inc.resolvedAt, null);
  assert.deepEqual(inc.affected, []);
  assert.equal(isOpen(inc), true);
});

test('validateIncidentInput trims and accepts a minimal incident', () => {
  const { value, errors } = validateIncidentInput({ title: '  Login down ', severity: 'sev1' });
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { title: 'Login down', severity: 'sev1' });
});

test('validateIncidentInput reports every problem at once', () => {
  const { errors } = validateIncidentInput({ title: '', severity: 'urgent', affected: [{ serviceId: 'x' }] });
  const fields = errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['affected[0]', 'severity', 'title']);
});

test('validateIncidentInput rejects non-objects and over-long titles', () => {
  assert.equal(validateIncidentInput(null).errors.length, 1);
  assert.equal(validateIncidentInput([]).errors.length, 1);
  const long = validateIncidentInput({ title: 'x'.repeat(141), severity: 'sev3' });
  assert.equal(long.errors[0].field, 'title');
});

const open = () =>
  createIncident(
    { title: 'DB failover', summary: 'Primary unreachable', severity: 'sev2' },
    { id: 'INC-0001', now: '2023-04-01T09:00:00.000Z' },
  );

test('createIncident seeds the timeline with an opening entry', () => {
  const inc = open();
  assert.equal(inc.updates.length, 1);
  assert.equal(inc.updates[0].kind, 'opened');
  assert.equal(inc.updates[0].message, 'Primary unreachable');
});

test('post_update appends to the timeline without mutating the input', () => {
  const before = open();
  const after = incidentReducer(before, {
    type: 'post_update',
    at: '2023-04-01T09:20:00.000Z',
    author: 'sam',
    message: 'Replica promoted',
    status: 'identified',
  });
  assert.equal(before.updates.length, 1);
  assert.equal(before.status, 'investigating');
  assert.equal(after.status, 'identified');
  assert.equal(after.updatedAt, '2023-04-01T09:20:00.000Z');
  assert.deepEqual(after.updates.map((u) => u.id), [1, 2]);
  assert.equal(after.updates[1].severity, 'sev2');
});

test('resolving sets resolvedAt once and reopening clears it', () => {
  let inc = open();
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-04-01T10:00:00.000Z', message: 'Fixed', status: 'resolved' });
  assert.equal(inc.resolvedAt, '2023-04-01T10:00:00.000Z');
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-04-01T10:30:00.000Z', message: 'Still resolved' });
  assert.equal(inc.resolvedAt, '2023-04-01T10:00:00.000Z');
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-04-01T11:00:00.000Z', message: 'Back again', status: 'investigating' });
  assert.equal(inc.resolvedAt, null);
});

test('severity can change in an update', () => {
  const inc = incidentReducer(open(), { type: 'post_update', at: '2023-04-01T09:05:00.000Z', message: 'Wider than thought', severity: 'sev1' });
  assert.equal(inc.severity, 'sev1');
});

test('assign changes the commander and unknown actions throw', () => {
  const inc = incidentReducer(open(), { type: 'assign', at: '2023-04-01T09:01:00.000Z', commander: 'priya' });
  assert.equal(inc.commander, 'priya');
  assert.throws(() => incidentReducer(inc, { type: 'explode' }), /unknown incident action/);
});

test('validateUpdateInput needs a message and checks enums', () => {
  assert.equal(validateUpdateInput({}).errors[0].field, 'message');
  const bad = validateUpdateInput({ message: 'x', status: 'done', severity: 'sev9' });
  assert.deepEqual(bad.errors.map((e) => e.field), ['status', 'severity']);
  const ok = validateUpdateInput({ message: ' ok ', status: 'monitoring' });
  assert.deepEqual(ok.value, { message: 'ok', status: 'monitoring' });
});

test('canTransition lets a resolved incident reopen only to investigating', () => {
  assert.equal(canTransition('investigating', 'monitoring'), true);
  assert.equal(canTransition('monitoring', 'identified'), true);
  assert.equal(canTransition('resolved', 'resolved'), true);
  assert.equal(canTransition('resolved', 'investigating'), true);
  assert.equal(canTransition('resolved', 'monitoring'), false);
  assert.equal(canTransition('resolved', 'identified'), false);
});
