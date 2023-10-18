import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('CSV export honours filters and sets download headers', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'Checkout slow', severity: 'sev2' });
  await srv.api('POST', '/api/incidents', { title: 'Email delayed', severity: 'sev4' });

  const all = await srv.api('GET', '/api/export/incidents.csv');
  assert.equal(all.status, 200);
  assert.match(all.headers.get('content-type'), /^text\/csv/);
  assert.match(all.headers.get('content-disposition'), /incidents\.csv/);
  assert.equal(all.text.trim().split('\r\n').length, 3);

  const filtered = await srv.api('GET', '/api/export/incidents.csv?severity=sev4');
  const lines = filtered.text.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^INC-0002,Email delayed,sev4/);

  assert.equal((await srv.api('GET', '/api/export/incidents.csv?severity=zzz')).status, 400);
});
