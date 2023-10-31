import test from 'node:test';
import assert from 'node:assert/strict';
import { INCIDENT_COLUMNS, csvField, toCsv } from '../server/csv.js';
import { createIncident, incidentReducer } from '../server/incidents.js';

test('csvField quotes only when needed', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('line\nbreak'), '"line\nbreak"');
  assert.equal(csvField(null), '');
  assert.equal(csvField(0), '0');
});

test('toCsv writes a header and CRLF line endings', () => {
  const out = toCsv([{ a: 1, b: 'x,y' }], [
    { header: 'a', value: (r) => r.a },
    { header: 'b', value: (r) => r.b },
  ]);
  assert.equal(out, 'a,b\r\n1,"x,y"\r\n');
});

test('incident rows include duration for resolved incidents only', () => {
  let inc = createIncident(
    { title: 'Slow, very slow', severity: 'sev2', affected: [{ serviceId: 'search', impact: 'degraded' }, { serviceId: 'api', impact: 'degraded' }] },
    { id: 'INC-0001', now: '2023-10-18T10:00:00.000Z' },
  );
  const open = toCsv([inc], INCIDENT_COLUMNS).split('\r\n')[1];
  assert.equal(open, 'INC-0001,"Slow, very slow",sev2,investigating,,search api,2023-10-18T10:00:00.000Z,,,1');
  inc = incidentReducer(inc, { type: 'post_update', at: '2023-10-18T10:05:00.000Z', message: 'ok', status: 'resolved' });
  const done = toCsv([inc], INCIDENT_COLUMNS).split('\r\n')[1];
  assert.match(done, /,2023-10-18T10:05:00.000Z,300,2$/);
});

test('cells that look like formulas are neutralised', () => {
  assert.equal(csvField('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvField('+1'), "'+1");
  assert.equal(csvField('-2+3'), "'-2+3");
  assert.equal(csvField('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvField('\tx'), "'\tx");
  assert.equal(csvField(-5), '-5');
  assert.equal(csvField('a=b'), 'a=b');
});

test('cells that look like formulas are neutralised', () => {
  assert.equal(csvField('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvField('+1'), "'+1");
  assert.equal(csvField('-2+3'), "'-2+3");
  assert.equal(csvField('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvField('\tx'), "'\tx");
  assert.equal(csvField(-5), '-5');
  assert.equal(csvField('a=b'), 'a=b');
});
