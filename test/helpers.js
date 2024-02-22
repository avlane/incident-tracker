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

const FAST_HASH = { N: 1024 };

// Starts the real server on an ephemeral port. By default an admin user is
// created and `api` sends its bearer token; pass `auth: false` to get an
// unauthenticated `api`. `as(role)` makes an api for a fresh user of that role.
export async function startTestServer(options = {}) {
  const store = options.store ?? createJsonStore();
  const clock = options.clock ?? fakeClock();
  const logger = options.logger ?? { error() {}, warn() {}, info() {} };
  const app = createApp({ store, clock, logger, hashParams: FAST_HASH, ...options.app });
  const server = createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  function apiWith(defaultHeaders) {
    return async function api(method, path, body, headers = {}) {
      const init = { method, headers: { ...defaultHeaders, ...headers } };
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
    };
  }

  async function login(role, n = 1) {
    const email = `${role}${n}@example.com`;
    await app.auth.createUser({ email, name: `Test ${role}`, role, password: 'test password 123' });
    const session = await app.auth.login(email, 'test password 123');
    return { authorization: `Bearer ${session.token}` };
  }

  const headers = options.auth === false ? {} : await login('admin');
  return {
    base,
    store,
    clock,
    app,
    headers,
    api: apiWith(headers),
    anon: apiWith({}),
    as: async (role) => apiWith(await login(role, Math.floor(Math.random() * 1e6))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
