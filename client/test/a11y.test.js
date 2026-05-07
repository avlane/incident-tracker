import test from 'node:test';
import assert from 'node:assert/strict';
import { errorId, fieldProps, firstInvalid } from '../src/lib/a11y.js';

test('fields without errors get no aria props', () => {
  assert.deepEqual(fieldProps('incident', 'title', {}), {});
  assert.deepEqual(fieldProps('incident', 'title', { summary: 'too long' }), {});
});

test('fields with errors point at their message', () => {
  assert.deepEqual(fieldProps('incident', 'title', { title: 'required' }), {
    'aria-invalid': true,
    'aria-describedby': 'incident-title-error',
  });
  assert.equal(errorId('login', 'email'), 'login-email-error');
});

test('firstInvalid follows form order, not error order', () => {
  const errors = { commander: 'x', title: 'y' };
  assert.equal(firstInvalid(['title', 'summary', 'commander'], errors), 'title');
  assert.equal(firstInvalid(['summary'], errors), null);
});
