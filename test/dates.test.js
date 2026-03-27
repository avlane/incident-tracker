import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRangeEnd, parseRangeStart } from '../server/dates.js';
import { createIncident } from '../server/incidents.js';
import { filterIncidents, parseFilters } from '../server/search.js';
import { startTestServer } from './helpers.js';

test('a bare date end means the end of that day, a timestamp means itself', () => {
  assert.equal(new Date(parseRangeEnd('2026-03-02')).toISOString(), '2026-03-02T23:59:59.999Z');
  assert.equal(new Date(parseRangeEnd('2026-03-02T10:00:00Z')).toISOString(), '2026-03-02T10:00:00.000Z');
  assert.equal(new Date(parseRangeStart('2026-03-02')).toISOString(), '2026-03-02T00:00:00.000Z');
  assert.ok(Number.isNaN(parseRangeEnd('2026-13-45')));
  assert.ok(Number.isNaN(parseRangeEnd('soon')));
});

test('the incident filter includes the whole of the "to" day', () => {
  const late = createIncident({ title: 'late night', severity: 'sev3' }, { id: 'INC-0001', now: '2026-03-02T22:30:00.000Z' });
  const next = createIncident({ title: 'next day', severity: 'sev3' }, { id: 'INC-0002', now: '2026-03-03T00:30:00.000Z' });
  const { filters } = parseFilters(new URLSearchParams('from=2026-03-02&to=2026-03-02'));
  assert.deepEqual(filterIncidents([late, next], filters).items.map((i) => i.id), ['INC-0001']);
});

test('metrics and the audit log treat a bare "to" date the same way', async (t) => {
  const srv = await startTestServer({ clock: () => '2026-03-02T22:30:00.000Z' });
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'late night', severity: 'sev3' });

  const metrics = await srv.api('GET', '/api/metrics?from=2026-03-02&to=2026-03-02');
  assert.equal(metrics.json.metrics.total, 1);
  const audit = await srv.api('GET', '/api/audit?from=2026-03-02&to=2026-03-02');
  assert.equal(audit.json.entries.length, 1);
  const csv = await srv.api('GET', '/api/export/audit.csv?to=2026-03-02');
  assert.equal(csv.text.trim().split('\r\n').length, 2);
  const before = await srv.api('GET', '/api/audit?to=2026-03-01');
  assert.equal(before.json.entries.length, 0);
});
