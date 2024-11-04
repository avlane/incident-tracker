import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCurrent, nextHandovers, shortUtc } from '../src/lib/oncall.js';

const schedule = {
  current: { who: 'ben', source: 'rotation', from: '2024-11-04T09:00:00.000Z', to: '2024-11-11T09:00:00.000Z' },
  upcoming: [
    { who: 'ben', from: '2024-11-04T09:00:00.000Z', to: '2024-11-11T09:00:00.000Z' },
    { who: 'cy', from: '2024-11-11T09:00:00.000Z', to: '2024-11-18T09:00:00.000Z' },
    { who: 'ana', from: '2024-11-18T09:00:00.000Z', to: '2024-11-25T09:00:00.000Z' },
  ],
};

test('shortUtc prints weekday and UTC time', () => {
  assert.equal(shortUtc('2024-11-11T09:05:00.000Z'), 'Mon 09:05');
  assert.equal(shortUtc('2024-11-17T23:00:00.000Z'), 'Sun 23:00');
});

test('describeCurrent', () => {
  assert.deepEqual(describeCurrent(schedule), { who: 'ben', text: 'ben until Mon 09:00 UTC' });
  const override = { ...schedule, current: { ...schedule.current, who: 'dee', source: 'override' } };
  assert.equal(describeCurrent(override).text, 'dee (override) until Mon 09:00 UTC');
  assert.deepEqual(describeCurrent({ current: null, upcoming: [] }), { who: null, text: 'Not started yet' });
});

test('nextHandovers skips the shift in progress', () => {
  assert.deepEqual(nextHandovers(schedule), [
    { who: 'cy', from: 'Mon 09:00' },
    { who: 'ana', from: 'Mon 09:00' },
  ]);
  assert.equal(nextHandovers(schedule, 1).length, 1);
});
