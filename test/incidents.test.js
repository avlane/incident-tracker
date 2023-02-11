import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncident, formatIncidentId, isOpen } from '../server/incidents.js';
import { validateIncidentInput } from '../server/validators.js';

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
