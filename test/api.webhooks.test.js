import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

const url = 'https://hooks.example.com/incidents';
const resolveHost = async () => [{ address: '93.184.216.34' }];

test('create shows the secret once, then only a hint', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const created = await srv.api('POST', '/api/webhooks', { url, events: ['incident.created'], description: 'chat' });
  assert.equal(created.status, 201);
  assert.match(created.json.webhook.secret, /^whsec_/);

  const list = await srv.api('GET', '/api/webhooks');
  assert.equal(list.json.webhooks.length, 1);
  assert.equal(list.json.webhooks[0].secret, undefined);
  assert.equal(list.json.webhooks[0].secretHint, `...${created.json.webhook.secret.slice(-4)}`);
  assert.ok(!list.text.includes(created.json.webhook.secret));
});

test('unsafe URLs and unknown events are rejected', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const bad = await srv.api('POST', '/api/webhooks', { url: 'https://169.254.169.254/x', events: ['nope'] });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.json.error.details.map((d) => d.field).sort(), ['events', 'url']);
  assert.equal((await srv.api('POST', '/api/webhooks', {})).status, 422);
});

test('patch, rotate and delete', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const { webhook } = (await srv.api('POST', '/api/webhooks', { url })).json;

  const patched = await srv.api('PATCH', `/api/webhooks/${webhook.id}`, { active: false });
  assert.equal(patched.json.webhook.active, false);
  assert.equal(patched.json.webhook.url, url);

  const rotated = await srv.api('POST', `/api/webhooks/${webhook.id}/rotate-secret`);
  assert.notEqual(rotated.json.webhook.secret, webhook.secret);

  assert.equal((await srv.api('DELETE', `/api/webhooks/${webhook.id}`)).status, 204);
  assert.equal((await srv.api('PATCH', `/api/webhooks/${webhook.id}`, {})).status, 404);
});

test('only admins can see or change webhooks', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const responder = await srv.as('responder');
  assert.equal((await responder('GET', '/api/webhooks')).status, 403);
  assert.equal((await responder('POST', '/api/webhooks', { url })).status, 403);
});

test('private targets are allowed only when the policy says so', async (t) => {
  const srv = await startTestServer({ app: { webhookPolicy: { allowPrivate: true } } });
  t.after(() => srv.close());
  assert.equal((await srv.api('POST', '/api/webhooks', { url: 'http://127.0.0.1:9000/hook' })).status, 201);
});

test('deliveries list shows what was sent, newest first, per webhook', async (t) => {
  const statuses = [200, 500, 200];
  const srv = await startTestServer({
    app: { dispatcherOptions: { fetchImpl: async () => ({ status: statuses.shift() ?? 200 }), retryDelaysMs: [], sleep: async () => {}, resolveHost } },
  });
  t.after(() => srv.close());
  const a = (await srv.api('POST', '/api/webhooks', { url })).json.webhook;
  // a second webhook, to prove the list is scoped to one webhook
  await srv.api('POST', '/api/webhooks', { url: 'https://other.example.com/in' });

  await srv.api('POST', '/api/incidents', { title: 'one', severity: 'sev3' });
  await srv.app.idle();

  const list = await srv.api('GET', `/api/webhooks/${a.id}/deliveries`);
  assert.equal(list.status, 200);
  assert.equal(list.json.deliveries.length, 1);
  assert.equal(list.json.deliveries[0].webhookId, a.id);
  assert.equal(list.json.deliveries[0].type, 'incident.created');
  assert.ok(!list.text.includes('whsec_'));
  assert.equal((await srv.api('GET', '/api/webhooks/wh_nope/deliveries')).status, 404);
});

test('send test posts a ping and reports the outcome without retrying', async (t) => {
  const calls = [];
  const srv = await startTestServer({
    app: {
      dispatcherOptions: {
        fetchImpl: async (u, init) => {
          calls.push(JSON.parse(init.body));
          return { status: 500 };
        },
        retryDelaysMs: [1, 1],
        sleep: async () => {},
        resolveHost,
      },
    },
  });
  t.after(() => srv.close());
  const { webhook } = (await srv.api('POST', '/api/webhooks', { url })).json;
  const res = await srv.api('POST', `/api/webhooks/${webhook.id}/test`);
  assert.equal(res.status, 200);
  assert.equal(res.json.delivery.state, 'failed');
  assert.equal(res.json.delivery.attempts.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'webhook.ping');
});
