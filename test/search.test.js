import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncident, incidentReducer } from '../server/incidents.js';
import { filterIncidents, parseFilters } from '../server/search.js';

function make(n, extra = {}) {
  const at = `2023-06-${String(n).padStart(2, '0')}T12:00:00.000Z`;
  return createIncident(
    { title: `Incident ${n}`, severity: 'sev3', ...extra },
    { id: `INC-${String(n).padStart(4, '0')}`, now: at },
  );
}

const filters = (query) => parseFilters(new URLSearchParams(query));

const sample = () => {
  const a = make(1, { title: 'Checkout latency', severity: 'sev2', affected: [{ serviceId: 'checkout', impact: 'degraded' }] });
  const b = make(2, { title: 'Email delays', summary: 'queue backed up', severity: 'sev3' });
  let c = make(3, { title: 'Login failures', severity: 'sev1', affected: [{ serviceId: 'auth', impact: 'major_outage' }] });
  c = incidentReducer(c, { type: 'post_update', at: '2023-06-03T13:00:00.000Z', message: 'Rolled back the deploy', status: 'resolved' });
  return [a, b, c];
};

test('defaults list everything newest first', () => {
  const { filters: f, errors } = filters('');
  assert.deepEqual(errors, []);
  const { items, total } = filterIncidents(sample(), f);
  assert.equal(total, 3);
  assert.deepEqual(items.map((i) => i.id), ['INC-0003', 'INC-0002', 'INC-0001']);
});

test('text search is case-insensitive, AND across terms, and reads updates', () => {
  const run = (q) => filterIncidents(sample(), filters(`q=${q}`).filters).items.map((i) => i.id);
  assert.deepEqual(run('CHECKOUT'), ['INC-0001']);
  assert.deepEqual(run('queue+backed'), ['INC-0002']);
  assert.deepEqual(run('rolled+back'), ['INC-0003']);
  assert.deepEqual(run('checkout+email'), []);
});

test('severity, status, open and service filters combine', () => {
  const run = (q) => filterIncidents(sample(), filters(q).filters).items.map((i) => i.id);
  assert.deepEqual(run('severity=sev1,sev2&sort=created'), ['INC-0001', 'INC-0003']);
  assert.deepEqual(run('open=true'), ['INC-0002', 'INC-0001']);
  assert.deepEqual(run('status=resolved'), ['INC-0003']);
  assert.deepEqual(run('service=auth'), ['INC-0003']);
});

test('date range, sort by severity and paging', () => {
  const run = (q) => filterIncidents(sample(), filters(q).filters);
  assert.deepEqual(run('from=2023-06-02&to=2023-06-02T23:59:59Z').items.map((i) => i.id), ['INC-0002']);
  assert.deepEqual(run('sort=severity').items.map((i) => i.id), ['INC-0003', 'INC-0001', 'INC-0002']);
  const page = run('sort=created&limit=1&offset=1');
  assert.deepEqual(page.items.map((i) => i.id), ['INC-0002']);
  assert.equal(page.total, 3);
});

test('parseFilters reports bad values', () => {
  const { errors } = filters('severity=sev9&from=yesterday&limit=0&open=maybe&sort=color');
  assert.deepEqual(errors.map((e) => e.field).sort(), ['from', 'limit', 'open', 'severity', 'sort']);
});

test('label filter requires every listed label and search reads labels', () => {
  const list = [
    { ...make(1, { title: 'One' }), labels: ['db', 'customer-facing'] },
    { ...make(2, { title: 'Two' }), labels: ['db'] },
    { ...make(3, { title: 'Three' }), labels: [] },
  ];
  const run = (q) => filterIncidents(list, filters(q).filters).items.map((i) => i.id).sort();
  assert.deepEqual(run('label=db'), ['INC-0001', 'INC-0002']);
  assert.deepEqual(run('label=db,customer-facing'), ['INC-0001']);
  assert.deepEqual(run('label=DB'), ['INC-0001', 'INC-0002']);
  assert.deepEqual(run('q=customer-facing'), ['INC-0001']);
  assert.deepEqual(run('label=nope'), []);
});

test('incidents from before labels existed still filter', () => {
  const old = make(1);
  delete old.labels;
  assert.equal(filterIncidents([old], filters('label=db').filters).total, 0);
  assert.equal(filterIncidents([old], filters('').filters).total, 1);
});
