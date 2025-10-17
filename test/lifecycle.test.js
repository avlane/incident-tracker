import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createShutdown } from '../server/lifecycle.js';
import { createJsonStore } from '../server/store/json-store.js';
import { startTestServer } from './helpers.js';

const quietLogger = () => ({ lines: [], info(l) { this.lines.push(l); }, warn(l) { this.lines.push(l); }, error(e) { this.lines.push(String(e)); } });

function fakes() {
  const calls = [];
  const server = createServer((req, res) => res.end('ok'));
  const store = { close: () => calls.push('store.close') };
  const app = { idle: async () => calls.push('app.idle'), close: () => calls.push('app.close') };
  return { calls, server, store, app };
}

test('shutdown stops the server, drains deliveries, closes things in order and exits 0', async () => {
  const { calls, server, store, app } = fakes();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const codes = [];
  const logger = quietLogger();
  const shutdown = createShutdown({ server, app, store, logger, exit: (c) => codes.push(c) });
  await shutdown('SIGTERM');
  assert.deepEqual(calls, ['app.idle', 'app.close', 'store.close']);
  assert.deepEqual(codes, [0]);
  assert.equal(server.listening, false);
  assert.match(logger.lines[0], /SIGTERM/);
});

test('a second signal while stopping is ignored', async () => {
  const { server, store, app } = fakes();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const codes = [];
  const shutdown = createShutdown({ server, app, store, logger: quietLogger(), exit: (c) => codes.push(c) });
  await Promise.all([shutdown('SIGINT'), shutdown('SIGINT')]);
  assert.deepEqual(codes, [0]);
});

test('a hung delivery makes it give up at the deadline and exit non-zero', async () => {
  const { server, store } = fakes();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = { idle: () => new Promise(() => {}), close() {} };
  const codes = [];
  const logger = quietLogger();
  const shutdown = createShutdown({ server, app, store, logger, timeoutMs: 20, exit: (c) => codes.push(c) });
  await shutdown('SIGTERM');
  assert.deepEqual(codes, [1]);
  assert.ok(logger.lines.some((l) => /gave up waiting/.test(l)));
});

test('GET /healthz is public and reports the store', async (t) => {
  const srv = await startTestServer({ auth: false });
  t.after(() => srv.close());
  const res = await srv.api('GET', '/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.store, 'json');
});

test('/healthz is 503 when the store is broken', async (t) => {
  const store = createJsonStore();
  store.get = () => {
    throw new Error('disk gone');
  };
  const srv = await startTestServer({ auth: false, store });
  t.after(() => srv.close());
  const res = await srv.api('GET', '/healthz');
  assert.equal(res.status, 503);
  assert.equal(res.json.ok, false);
});
