import test from 'node:test';
import assert from 'node:assert/strict';
import { addOverride, createSchedule, upcomingShifts, whoIsOnCall } from '../server/oncall.js';
import { validateOverrideInput, validateScheduleInput } from '../server/validators.js';

const schedule = () =>
  createSchedule(
    { name: 'Primary', members: ['ana', 'ben', 'cy'], startsAt: '2023-07-03T09:00:00.000Z' },
    { id: 'primary', now: '2023-07-01T00:00:00.000Z' },
  );

test('rotation moves through members weekly and wraps', () => {
  const s = schedule();
  assert.equal(whoIsOnCall(s, '2023-07-03T09:00:00.000Z').who, 'ana');
  assert.equal(whoIsOnCall(s, '2023-07-10T08:59:59.000Z').who, 'ana');
  assert.equal(whoIsOnCall(s, '2023-07-10T09:00:00.000Z').who, 'ben');
  assert.equal(whoIsOnCall(s, '2023-07-17T12:00:00.000Z').who, 'cy');
  assert.equal(whoIsOnCall(s, '2023-07-24T12:00:00.000Z').who, 'ana');
});

test('shift boundaries are reported', () => {
  const now = whoIsOnCall(schedule(), '2023-07-12T00:00:00.000Z');
  assert.equal(now.from, '2023-07-10T09:00:00.000Z');
  assert.equal(now.to, '2023-07-17T09:00:00.000Z');
  assert.equal(now.source, 'rotation');
});

test('nobody is on call before the schedule starts', () => {
  assert.equal(whoIsOnCall(schedule(), '2023-06-30T00:00:00.000Z'), null);
});

test('custom rotation length', () => {
  const s = createSchedule(
    { name: 'Daily', members: ['ana', 'ben'], startsAt: '2023-07-03T00:00:00.000Z', rotationHours: 24 },
    { id: 'daily', now: '2023-07-01T00:00:00.000Z' },
  );
  assert.equal(whoIsOnCall(s, '2023-07-04T01:00:00.000Z').who, 'ben');
  assert.equal(whoIsOnCall(s, '2023-07-05T01:00:00.000Z').who, 'ana');
});

test('overrides win, and the latest overlapping one wins', () => {
  let s = schedule();
  s = addOverride(s, { who: 'dee', from: '2023-07-04T00:00:00.000Z', to: '2023-07-06T00:00:00.000Z' });
  s = addOverride(s, { who: 'eli', from: '2023-07-05T00:00:00.000Z', to: '2023-07-05T12:00:00.000Z' });
  assert.deepEqual(whoIsOnCall(s, '2023-07-04T12:00:00.000Z').who, 'dee');
  assert.equal(whoIsOnCall(s, '2023-07-05T06:00:00.000Z').who, 'eli');
  assert.equal(whoIsOnCall(s, '2023-07-05T06:00:00.000Z').source, 'override');
  assert.equal(whoIsOnCall(s, '2023-07-06T00:00:00.000Z').who, 'ana');
});

test('upcomingShifts lists consecutive shifts', () => {
  const shifts = upcomingShifts(schedule(), '2023-07-12T00:00:00.000Z', 3);
  assert.deepEqual(shifts.map((s) => s.who), ['ben', 'cy', 'ana']);
  assert.equal(shifts[0].from, '2023-07-10T09:00:00.000Z');
  assert.equal(shifts[1].from, shifts[0].to);
});

test('schedule and override validation', () => {
  assert.deepEqual(
    validateScheduleInput({ name: 'P', members: ['a', 'a'], startsAt: 'soon' }).errors.map((e) => e.field),
    ['members', 'startsAt'],
  );
  assert.deepEqual(validateScheduleInput({ name: 'P', members: ['a'], startsAt: '2023-07-03T09:00:00Z' }).errors, []);
  const bad = validateOverrideInput({ who: 'x', from: '2023-07-05T00:00:00Z', to: '2023-07-04T00:00:00Z' });
  assert.equal(bad.errors[0].message, 'to must be after from');
});
