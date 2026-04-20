import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isPrivateAddress } from './urlguard.js';
import { formatPayload } from './webhookformat.js';
import { EVENT_HEADER, SIGNATURE_HEADER, buildEvent, signatureHeader } from './webhooks.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Sends signed webhook events. emit() returns immediately; deliveries run in
// the background and every attempt is recorded in the "deliveries" collection.
//
// Retries: network errors, timeouts, 429 and 5xx are retried after each delay
// in retryDelaysMs. Other 4xx answers are the receiver saying no, so they are
// not retried. Redirects are never followed (a redirect could point somewhere
// the URL check would have refused).
export function createDispatcher({
  store,
  clock,
  logger = console,
  fetchImpl = (...args) => globalThis.fetch(...args),
  sleep = wait,
  retryDelaysMs = [2_000, 10_000, 60_000],
  timeoutMs = 5_000,
  // Hostnames are checked again at send time, because a name that looked fine
  // when the webhook was saved can be re-pointed at an internal address later.
  // This narrows the window but cannot close it: fetch resolves the name
  // itself a moment after we did (DNS rebinding). Run the server on a network
  // that can't reach internal services if that matters.
  allowPrivate = false,
  resolveHost = (hostname) => lookup(hostname, { all: true, verbatim: true }),
}) {
  const pending = new Set();

  async function attempt(webhook, event, body, deliveryId) {
    const started = Date.now();
    const record = { at: clock() };
    try {
      if (!allowPrivate) {
        const { hostname } = new URL(webhook.url);
        const bare = hostname.replace(/^\[|\]$/g, '');
        const addresses = (await resolveHost(bare)).map((a) => a.address);
        if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
          record.error = 'blocked: host resolves to a private or unresolvable address';
          record.ms = Date.now() - started;
          return { record, ok: false, retry: false };
        }
      }
      const res = await fetchImpl(webhook.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'incident-tracker/0.1',
          [EVENT_HEADER]: event.type,
          'x-incident-delivery': deliveryId,
          [SIGNATURE_HEADER]: signatureHeader(webhook.secret, body, Date.now()),
        },
        body,
      });
      record.status = res.status;
      record.ms = Date.now() - started;
      const ok = res.status >= 200 && res.status < 300;
      const retry = res.status === 429 || res.status >= 500;
      return { record, ok, retry };
    } catch (err) {
      record.error = err.name === 'TimeoutError' ? 'timeout' : String(err.message ?? err).slice(0, 200);
      record.ms = Date.now() - started;
      return { record, ok: false, retry: true };
    }
  }

  async function deliver(webhook, event, { retry = true } = {}) {
    // The signature covers exactly the bytes sent, whichever format they are in.
    const body = JSON.stringify(formatPayload(webhook.format, event));
    const delivery = {
      id: `dlv_${randomBytes(6).toString('hex')}`,
      webhookId: webhook.id,
      eventId: event.id,
      type: event.type,
      createdAt: clock(),
      state: 'pending',
      attempts: [],
    };
    for (let n = 0; ; n++) {
      const { record, ok, retry: willRetry } = await attempt(webhook, event, body, delivery.id);
      delivery.attempts.push(record);
      if (ok) delivery.state = 'delivered';
      else if (!willRetry || !retry || n >= retryDelaysMs.length) delivery.state = 'failed';
      store.put('deliveries', delivery);
      if (delivery.state !== 'pending') return delivery;
      await sleep(retryDelaysMs[n]);
    }
  }

  function emit(type, incident) {
    const event = buildEvent(type, incident, clock(), `evt_${randomBytes(6).toString('hex')}`);
    const targets = store
      .list('webhooks')
      .filter((w) => w.active && (w.events.length === 0 || w.events.includes(type)));
    for (const webhook of targets) {
      const job = deliver(webhook, event)
        .catch((err) => logger.error(err))
        .finally(() => pending.delete(job));
      pending.add(job);
    }
    return targets.length;
  }

  // Sends a one-off event to a single webhook and waits for the outcome. Used
  // for "send test event"; it never retries, so the answer comes back fast.
  function sendTest(webhook) {
    const event = buildEvent('webhook.ping', { message: 'Test event from incident-tracker' }, clock(), `evt_${randomBytes(6).toString('hex')}`);
    return deliver(webhook, event, { retry: false });
  }

  // Resolves when every delivery started so far has finished (used by tests
  // and by graceful shutdown).
  async function idle() {
    while (pending.size > 0) await Promise.all([...pending]);
  }

  return { emit, sendTest, idle };
}
