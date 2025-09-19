import test from 'node:test';
import assert from 'node:assert/strict';
import { accessLogLine, requestIdFor } from '../server/requestlog.js';
import { startTestServer } from './helpers.js';

test('requestIdFor reuses sane ids and replaces junk', () => {
  assert.equal(requestIdFor({ headers: { 'x-request-id': 'abc-123_X.y' } }), 'abc-123_X.y');
  const fresh = requestIdFor({ headers: {} });
  assert.match(fresh, /^[0-9a-f-]{36}$/);
  for (const bad of ['has space', 'new\nline', 'x'.repeat(65), '<script>', '']) {
    assert.match(requestIdFor({ headers: { 'x-request-id': bad } }), /^[0-9a-f-]{36}$/, JSON.stringify(bad));
  }
});

test('log lines drop the query string and name the caller', () => {
  const line = JSON.parse(
    accessLogLine({
      id: 'r1',
      req: { method: 'GET', url: '/api/incidents?q=secret-thing&token=abc' },
      status: 200,
      ms: 3,
      user: { email: 'sam@example.com' },
      ip: '10.0.0.1',
      at: '2025-09-19T10:00:00.000Z',
    }),
  );
  assert.equal(line.path, '/api/incidents');
  assert.equal(line.user, 'sam@example.com');
  assert.ok(!JSON.stringify(line).includes('secret-thing'));
  assert.equal(JSON.parse(accessLogLine({ id: 'r', req: { method: 'GET', url: '/x' }, status: 404, ms: 1, user: null })).user, null);
  assert.equal(JSON.parse(accessLogLine({ id: 'r', req: { method: 'GET', url: '/x' }, status: 200, ms: 1, user: { kind: 'token', name: 'token: ci' } })).user, 'token: ci');
});

test('responses carry a request id and the access log has one line per request', async (t) => {
  const lines = [];
  const logger = { info: (l) => lines.push(JSON.parse(l)), error() {}, warn() {} };
  const srv = await startTestServer({ logger, app: { accessLog: true } });
  t.after(() => srv.close());

  const ok = await srv.api('GET', '/api/incidents', undefined, { 'x-request-id': 'trace-1' });
  assert.equal(ok.headers.get('x-request-id'), 'trace-1');
  const missing = await srv.anon('GET', '/api/status/nope');
  assert.match(missing.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);

  await new Promise((resolve) => setTimeout(resolve, 20));
  const mine = lines.find((l) => l.id === 'trace-1');
  assert.equal(mine.status, 200);
  assert.equal(mine.user, 'admin1@example.com');
  assert.equal(lines.find((l) => l.path === '/api/status/nope').status, 401);
});

test('without accessLog nothing is logged', async (t) => {
  const lines = [];
  const srv = await startTestServer({ logger: { info: (l) => lines.push(l), error() {}, warn() {} } });
  t.after(() => srv.close());
  await srv.api('GET', '/api/incidents');
  assert.equal(lines.length, 0);
});
