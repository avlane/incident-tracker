import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveInside } from '../server/static.js';
import { startTestServer } from './helpers.js';

test('resolveInside keeps paths under the root', () => {
  assert.equal(resolveInside('/srv/app', '/index.html'), '/srv/app/index.html');
  assert.equal(resolveInside('/srv/app', '/a/../b.js'), '/srv/app/b.js');
  assert.equal(resolveInside('/srv/app', '/../secret'), null);
  assert.equal(resolveInside('/srv/app', '/%2e%2e/secret'), null);
  assert.equal(resolveInside('/srv/app', '/..%2fsecret'), null);
  assert.equal(resolveInside('/srv/app', '/x%00.js'), null);
  assert.equal(resolveInside('/srv/app', '/%E0%A4%A'), null);
  assert.equal(resolveInside('/srv/app', '/../app-other/x'), null);
});

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), 'it-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>shell</title>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  return dir;
}

test('serves the shell, hashed assets and falls back for client routes', async (t) => {
  const dir = makeDist();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const srv = await startTestServer({ app: { staticDir: dir } });
  t.after(() => srv.close());

  const root = await srv.anon('GET', '/');
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type'), /^text\/html/);
  assert.equal(root.headers.get('cache-control'), 'no-cache');
  assert.match(root.text, /shell/);

  const asset = await srv.anon('GET', '/assets/app-abc123.js');
  assert.match(asset.headers.get('content-type'), /^text\/javascript/);
  assert.match(asset.headers.get('cache-control'), /immutable/);

  assert.match((await srv.anon('GET', '/some/client/route')).text, /shell/);
  assert.equal((await srv.anon('GET', '/assets/missing.js')).status, 404);
});

test('path traversal and API paths are not served from disk', async (t) => {
  const dir = makeDist();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const srv = await startTestServer({ app: { staticDir: dir } });
  t.after(() => srv.close());

  const escape = await fetch(`${srv.base}/..%2f..%2f..%2fetc/passwd`);
  assert.notEqual(escape.status, 200);
  assert.ok(!(await escape.text()).includes('root:'));
  assert.equal((await srv.anon('GET', '/api/nope')).status, 401);
  assert.equal((await srv.anon('GET', '/api/status')).status, 200);
});

test('HEAD returns headers only and POST is not handled', async (t) => {
  const dir = makeDist();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const srv = await startTestServer({ app: { staticDir: dir } });
  t.after(() => srv.close());
  const head = await fetch(`${srv.base}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${srv.base}/`, { method: 'POST' })).status, 404);
});
