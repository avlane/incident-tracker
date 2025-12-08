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

test('audit CSV is admin-only, oldest first, and honours filters', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout' });
  await srv.api('POST', '/api/incidents', { title: '=cmd|calc', severity: 'sev3' });

  const res = await srv.api('GET', '/api/export/audit.csv');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /audit\.csv/);
  const lines = res.text.trim().split('\r\n');
  assert.equal(lines[0], 'id,at,actor,action,target,ip,meta');
  assert.match(lines[1], /^00000001,.*,admin1@example\.com,service\.create,checkout,127\.0\.0\.1,/);
  assert.match(lines[2], /incident\.create/);
  assert.ok(lines[2].includes('=cmd|calc'), 'the title is in the meta JSON, inside a quoted field');

  const filtered = await srv.api('GET', '/api/export/audit.csv?action=incident');
  assert.equal(filtered.text.trim().split('\r\n').length, 2);

  const viewer = await srv.as('viewer');
  assert.equal((await viewer('GET', '/api/export/audit.csv')).status, 403);
  assert.equal((await srv.api('GET', '/api/export/audit.csv?from=never')).status, 400);
});
