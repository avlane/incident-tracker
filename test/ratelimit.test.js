import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../server/ratelimit.js';

function clock(start = 1_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => {
    t += ms;
  };
  return now;
}

test('allows up to the limit then blocks with a retry hint', () => {
  const now = clock();
  const rl = createRateLimiter({ limit: 3, windowMs: 10_000, now });
  assert.deepEqual([1, 2, 3].map(() => rl.check('ip').allowed), [true, true, true]);
  const blocked = rl.check('ip');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 10);
  now.advance(2500);
  assert.equal(rl.check('ip').retryAfterSeconds, 8);
});

test('remaining counts down', () => {
  const rl = createRateLimiter({ limit: 3, windowMs: 1000, now: clock() });
  assert.deepEqual([1, 2, 3].map(() => rl.check('k').remaining), [2, 1, 0]);
});

test('the window resets after windowMs', () => {
  const now = clock();
  const rl = createRateLimiter({ limit: 1, windowMs: 1000, now });
  assert.equal(rl.check('k').allowed, true);
  assert.equal(rl.check('k').allowed, false);
  now.advance(1000);
  assert.equal(rl.check('k').allowed, true);
});

test('keys are independent and reset forgets one', () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: clock() });
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('b').allowed, true);
  assert.equal(rl.check('a').allowed, false);
  rl.reset('a');
  assert.equal(rl.check('a').allowed, true);
});

test('sweep removes expired buckets only', () => {
  const now = clock();
  const rl = createRateLimiter({ limit: 5, windowMs: 1000, now });
  rl.check('old');
  now.advance(600);
  rl.check('new');
  now.advance(500);
  rl.sweep();
  assert.equal(rl.size, 1);
});
