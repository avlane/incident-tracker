import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { verifySignature } from '../server/webhooks.js';

function recorder() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { status: 204 };
  };
  return { calls, fetchImpl };
}

async function withHook(options = {}) {
  const { calls, fetchImpl } = recorder();
  const srv = await startTestServer({ app: { dispatcherOptions: { fetchImpl, retryDelaysMs: [] } }, ...options });
  const created = await srv.api('POST', '/api/webhooks', { url: 'https://hooks.example.com/in' });
  return { srv, calls, secret: created.json.webhook.secret };
}

test('opening, updating and resolving send created, updated and resolved events', async (t) => {
  const { srv, calls } = await withHook();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'Search down', severity: 'sev2' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'looking', status: 'identified' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'fixed', status: 'resolved' });
  await srv.app.idle();
  assert.deepEqual(calls.map((c) => c.body.type), ['incident.created', 'incident.updated', 'incident.resolved']);
});

test('payloads are signed with the webhook secret', async (t) => {
  const { srv, calls, secret } = await withHook();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  await srv.app.idle();
  const { init } = calls[0];
  assert.equal(
    verifySignature({ secret, header: init.headers['x-incident-signature'], body: init.body, nowMs: Date.now() }),
    true,
  );
});

test('payloads carry the public view only', async (t) => {
  const { srv, calls } = await withHook();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3', commander: 'priya' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'secret customer detail', visibility: 'internal' });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'public note' });
  await srv.app.idle();
  assert.equal(calls.length, 2, 'the internal update sends nothing');
  const text = JSON.stringify(calls.map((c) => c.body));
  assert.ok(!text.includes('priya'));
  assert.ok(!text.includes('secret customer detail'));
  assert.ok(text.includes('public note'));
});

test('private incidents send nothing', async (t) => {
  const { srv, calls } = await withHook();
  t.after(() => srv.close());
  await srv.api('POST', '/api/incidents', { title: 'internal', severity: 'sev3', public: false });
  await srv.api('POST', '/api/incidents/INC-0001/updates', { message: 'x' });
  await srv.app.idle();
  assert.equal(calls.length, 0);
});

test('a failing receiver does not break the API request', async (t) => {
  const srv = await startTestServer({
    app: { dispatcherOptions: { fetchImpl: async () => { throw new Error('down'); }, retryDelaysMs: [] } },
  });
  t.after(() => srv.close());
  await srv.api('POST', '/api/webhooks', { url: 'https://hooks.example.com/in' });
  const res = await srv.api('POST', '/api/incidents', { title: 'x', severity: 'sev3' });
  assert.equal(res.status, 201);
  await srv.app.idle();
  assert.equal(srv.store.list('deliveries')[0].state, 'failed');
});
