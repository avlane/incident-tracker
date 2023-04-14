import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { createJsonStore } from '../server/store/json-store.js';

// A clock that starts at `start` and moves forward `stepMs` on every call, so
// timestamps in tests are deterministic and strictly increasing.
export function fakeClock(start = '2023-04-01T09:00:00.000Z', stepMs = 60_000) {
  let t = Date.parse(start);
  const clock = () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
  clock.peek = () => new Date(t).toISOString();
  return clock;
}

export async function startTestServer(options = {}) {
  const store = options.store ?? createJsonStore();
  const clock = options.clock ?? fakeClock();
  const logger = options.logger ?? { error() {}, warn() {}, info() {} };
  const app = createApp({ store, clock, logger });
  const server = createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, body, headers = {}) {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON, callers can read `text`
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  return {
    base,
    store,
    clock,
    app,
    api,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
