import test from 'node:test';
import assert from 'node:assert/strict';
import { createDispatcher } from '../server/dispatcher.js';
import { createJsonStore } from '../server/store/json-store.js';
import { verifySignature } from '../server/webhooks.js';
import { fakeClock } from './helpers.js';

const publicHost = async () => [{ address: '93.184.216.34', family: 4 }];

function setup({ responses = [200], hooks, retryDelaysMs = [10, 20], resolver = publicHost } = {}) {
  const store = createJsonStore();
  for (const hook of hooks ?? [{ id: 'wh_1', url: 'https://hooks.example.com/a', events: [], active: true, secret: 'whsec_x' }]) {
    store.put('webhooks', hook);
  }
  const calls = [];
  const sleeps = [];
  const queue = [...responses];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return { status: next };
  };
  const dispatcher = createDispatcher({
    store,
    clock: fakeClock('2024-07-05T10:00:00.000Z', 1000),
    fetchImpl,
    sleep: async (ms) => sleeps.push(ms),
    resolveHost: resolver,
    retryDelaysMs,
    logger: { error() {} },
  });
  return { store, calls, sleeps, dispatcher };
}

const incident = { id: 'INC-0001', title: 'x' };

test('a delivery is signed, typed and recorded', async () => {
  const { dispatcher, calls, store } = setup();
  assert.equal(dispatcher.emit('incident.created', incident), 1);
  await dispatcher.idle();

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://hooks.example.com/a');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.headers['x-incident-event'], 'incident.created');
  assert.equal(
    verifySignature({ secret: 'whsec_x', header: init.headers['x-incident-signature'], body: init.body, nowMs: Date.now() }),
    true,
  );
  assert.equal(JSON.parse(init.body).data.incident.id, 'INC-0001');

  const [delivery] = store.list('deliveries');
  assert.equal(delivery.state, 'delivered');
  assert.equal(delivery.attempts.length, 1);
  assert.equal(delivery.attempts[0].status, 200);
});

test('only active webhooks subscribed to the event are called', async () => {
  const { dispatcher, calls } = setup({
    hooks: [
      { id: 'a', url: 'https://a.example.com/', events: ['incident.resolved'], active: true, secret: 's' },
      { id: 'b', url: 'https://b.example.com/', events: [], active: false, secret: 's' },
      { id: 'c', url: 'https://c.example.com/', events: ['incident.created'], active: true, secret: 's' },
    ],
  });
  assert.equal(dispatcher.emit('incident.created', incident), 1);
  await dispatcher.idle();
  assert.deepEqual(calls.map((c) => c.url), ['https://c.example.com/']);
});

test('5xx and network errors are retried with the configured delays', async () => {
  const { dispatcher, calls, sleeps, store } = setup({ responses: [500, new Error('ECONNRESET'), 200] });
  dispatcher.emit('incident.updated', incident);
  await dispatcher.idle();
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [10, 20]);
  const [delivery] = store.list('deliveries');
  assert.equal(delivery.state, 'delivered');
  assert.deepEqual(delivery.attempts.map((a) => a.status ?? a.error), [500, 'ECONNRESET', 200]);
});

test('it gives up after the last delay', async () => {
  const { dispatcher, calls, store } = setup({ responses: [503] });
  dispatcher.emit('incident.updated', incident);
  await dispatcher.idle();
  assert.equal(calls.length, 3);
  assert.equal(store.list('deliveries')[0].state, 'failed');
});

test('client errors and redirects are not retried', async () => {
  for (const status of [400, 404, 302]) {
    const { dispatcher, calls, store } = setup({ responses: [status] });
    dispatcher.emit('incident.updated', incident);
    await dispatcher.idle();
    assert.equal(calls.length, 1, `status ${status}`);
    assert.equal(store.list('deliveries')[0].state, 'failed');
  }
});

test('429 is retried', async () => {
  const { dispatcher, calls } = setup({ responses: [429, 200] });
  dispatcher.emit('incident.updated', incident);
  await dispatcher.idle();
  assert.equal(calls.length, 2);
});

test('a host that resolves to a private address is blocked without calling fetch', async () => {
  for (const address of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '::1']) {
    const { dispatcher, calls, store } = setup({ resolver: async () => [{ address }] });
    dispatcher.emit('incident.created', incident);
    await dispatcher.idle();
    assert.equal(calls.length, 0, address);
    const [delivery] = store.list('deliveries');
    assert.equal(delivery.state, 'failed');
    assert.equal(delivery.attempts.length, 1, 'blocked deliveries are not retried');
    assert.match(delivery.attempts[0].error, /^blocked/);
  }
});

test('one private address among public ones is enough to block', async () => {
  const { dispatcher, calls } = setup({ resolver: async () => [{ address: '93.184.216.34' }, { address: '10.1.1.1' }] });
  dispatcher.emit('incident.created', incident);
  await dispatcher.idle();
  assert.equal(calls.length, 0);
});

test('unresolvable hosts fail and are retried like a network error', async () => {
  let n = 0;
  const { dispatcher, calls, store } = setup({
    resolver: async () => {
      n++;
      if (n < 2) throw new Error('getaddrinfo ENOTFOUND hooks.example.com');
      return [{ address: '93.184.216.34' }];
    },
  });
  dispatcher.emit('incident.created', incident);
  await dispatcher.idle();
  assert.equal(calls.length, 1);
  assert.equal(store.list('deliveries')[0].state, 'delivered');
  assert.match(store.list('deliveries')[0].attempts[0].error, /ENOTFOUND/);
});

test('allowPrivate skips the check', async () => {
  const store = createJsonStore();
  store.put('webhooks', { id: 'w', url: 'http://127.0.0.1:9000/x', events: [], active: true, secret: 's' });
  const calls = [];
  const dispatcher = createDispatcher({
    store,
    clock: fakeClock(),
    fetchImpl: async (u) => (calls.push(u), { status: 200 }),
    allowPrivate: true,
    resolveHost: async () => {
      throw new Error('should not be asked');
    },
    logger: { error() {} },
  });
  dispatcher.emit('incident.created', incident);
  await dispatcher.idle();
  assert.deepEqual(calls, ['http://127.0.0.1:9000/x']);
});

test('a slack-format webhook receives a Slack message, signed over those bytes', async () => {
  const { dispatcher, calls } = setup({
    hooks: [{ id: 'wh_s', url: 'https://hooks.example.com/slack', events: [], active: true, secret: 'whsec_s', format: 'slack' }],
  });
  dispatcher.emit('incident.created', {
    id: 'INC-0001',
    title: 'Checkout down',
    status: 'investigating',
    affected: [],
    updates: [{ at: '2026-04-22T10:00:00.000Z', status: 'investigating', message: 'Looking into it' }],
  });
  await dispatcher.idle();
  const { init } = calls[0];
  const body = JSON.parse(init.body);
  assert.equal(body.text, 'New incident: INC-0001 Checkout down (Investigating)');
  assert.equal(body.type, undefined);
  assert.equal(verifySignature({ secret: 'whsec_s', header: init.headers['x-incident-signature'], body: init.body, nowMs: Date.now() }), true);
});

test('webhooks saved before formats existed still get JSON events', async () => {
  const { dispatcher, calls } = setup();
  dispatcher.emit('incident.created', incident);
  await dispatcher.idle();
  assert.equal(JSON.parse(calls[0].init.body).type, 'incident.created');
});
