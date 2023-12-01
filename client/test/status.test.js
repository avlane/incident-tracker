import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAffected, statusClass } from '../src/lib/status.js';
import { parseHash } from '../src/lib/route.js';

test('statusClass falls back for unknown statuses', () => {
  assert.equal(statusClass('major_outage'), 'st-major_outage');
  assert.equal(statusClass('on_fire'), 'st-unknown');
});

test('describeAffected joins service and component', () => {
  assert.equal(describeAffected({ service: 'Checkout', component: 'API' }), 'Checkout / API');
  assert.equal(describeAffected({ service: 'Search', component: null }), 'Search');
});

test('the status page has a route', () => {
  assert.deepEqual(parseHash('#/status'), { name: 'status' });
});
