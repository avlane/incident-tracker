# incident-tracker

A small-team incident tracker. Open an incident, post updates as the status
moves from investigating to resolved, keep a service list and an on-call
rotation, generate a postmortem draft, and publish a public status page.

The API is a plain Node program with no dependencies. The browser client is a
separate package under `client/` (React and Vite).

## Tests

- `npm test` runs 365 tests with `node --test`, none skipped, none failing.
  Most of them start the real HTTP server on an ephemeral port and call it with
  `fetch`, so routing, auth, rate limiting, audit, webhooks and the stores are
  exercised through the same request path a real client uses. The API has no
  runtime dependencies, so nothing needed installing.
- The same store contract test runs against the JSON store and against
  `node:sqlite`, including transactions, nested rollback, import/export and
  schema migrations.
- Webhook delivery is tested against a stubbed `fetch` (signatures, retries,
  timeouts, private-address refusal).
- The client's plain JavaScript modules (`client/src/lib/*.js`: API wrapper,
  forms, filters, routing, timeline, metrics, uptime and so on) are tested with
  `node --test` too; they have no React in them.
- The real entry points were smoke tested by hand: `server/cli.js create-user`
  and `list-users`, `server/index.js` on the JSON store and on SQLite
  (`migrate-store`, login, opening an incident, the status page, the postmortem
  Markdown, `/healthz`), `prune`, and a clean exit on SIGTERM.

## Running the API

Needs Node 20 or newer (22.5 or newer for the SQLite store). Node 18 reached end of life in April 2025 and is no longer supported.

```
npm start
```

Settings come from environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT`, `HOST` | `3000`, `127.0.0.1` | Where to listen |
| `STORE` | `json` | `json` or `sqlite` |
| `DATA_FILE` | `data/incidents.json` | JSON store location |
| `DB_FILE` | `data/incidents.db` | SQLite store location |
| `PUBLIC_URL` | `http://localhost:<PORT>` | Where the client is reachable, for links in the Atom feed |
| `TRUST_PROXY` | off | Set to `1` to believe `X-Forwarded-For` (rate limits and audit use it) |
| `ALLOW_PRIVATE_WEBHOOKS` | off | Set to `1` to allow `http://` and internal webhook targets (development) |

### Storage

The default store keeps everything in memory and mirrors it to one JSON file,
written atomically (temp file then rename). It is fine for a small team and
trivial to inspect.

The SQLite store uses the `node:sqlite` module built into Node 22.5 and newer.
Node 22.13 and 23.4 stopped requiring `--experimental-sqlite`, so on current
versions it is just:

```
STORE=sqlite npm start
```

On Node 22.5 to 22.12, run the server with the flag yourself
(`STORE=sqlite node --experimental-sqlite server/index.js`); the SQLite tests
skip themselves when `node:sqlite` can't be loaded, and
`node --experimental-sqlite --test` runs them on those versions. On Node 20
use the default JSON store.

Both stores implement the same small interface (`list`, `get`, `put`, `remove`,
`nextSeq`, `transaction`) and one shared contract test runs against both. The
SQLite schema is versioned with `PRAGMA user_version` and numbered migrations.

To move an existing JSON database over:

```
node server/cli.js migrate-store --from data/incidents.json --to data/incidents.db
STORE=sqlite npm start
```

The target must be empty. Without `STORE=sqlite`, the JSON store is used.

```
npm test
```

## Users and sign-in

Every API route except `GET /api/status` and the login route needs a session.
There is no sign-up page; create the first user from the command line, reading
the password from stdin so it never lands in shell history or `ps`:

```
printf '%s' 'a long passphrase' | node server/cli.js create-user \
  --email you@example.com --name "You" --role admin --password-stdin
```

Roles: `viewer` can read, `responder` can open incidents and post updates,
`admin` can change everything else. Passwords are hashed with scrypt from
`node:crypto`; session tokens are random, sent as an HttpOnly cookie (or a
bearer token) and only their SHA-256 is stored.

## Continuous integration

`.github/workflows/test.yml` runs `npm test` on Node 22 and 24.

## HTTP API

All routes are JSON under `/api` unless noted. "Role" is the least role that may call it; anything not listed as public needs a session cookie or `Authorization: Bearer <token>`.

| Method and path | Role | What it does |
|---|---|---|
| `GET /healthz` | public | Liveness plus a store check |
| `GET /api/status`, `GET /api/status.atom` | public | Status page data: services, active and recent incidents, maintenance; the same as an Atom feed |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | public | Sign in, out, who am I |
| `POST /api/auth/password`, `DELETE /api/auth/sessions` | viewer | Change your password; sign out everywhere |
| `GET /api/incidents` | viewer | List and search: `q`, `severity`, `status`, `open`, `service`, `label`, `from`, `to`, `sort`, `limit`, `offset` |
| `GET /api/incidents/:id` | viewer | One incident with its timeline |
| `POST /api/incidents` | responder | Open an incident (`title`, `severity`, optional `summary`, `commander`, `affected`, `labels`, `public`) |
| `POST /api/incidents/:id/updates` | responder | Post an update, optionally changing status or severity; `visibility: "internal"` keeps it off the status page and out of webhooks |
| `PUT /api/incidents/:id/labels` | responder | Replace the labels |
| `POST /api/incidents/:id/links`, `DELETE /api/incidents/:id/links/:target` | responder | Link incidents as related, duplicate or causal |
| `GET /api/incidents/:id/postmortem` | viewer | Markdown postmortem draft |
| `PUT /api/incidents/:id/postmortem` | responder | Store the written postmortem and its action items |
| `GET /api/action-items` | viewer | Action items across postmortems (`owner`, `overdue=true`) |
| `GET /api/metrics` | viewer | Time to respond and resolve, by severity, service and week |
| `GET /api/export/incidents.csv` | viewer | CSV export with the list filters |
| `GET /api/export/audit.csv`, `GET /api/audit`, `GET /api/audit/verify` | admin | Audit log, and a check of its hash chain |
| `GET`/`POST /api/services`, `GET`/`PATCH`/`DELETE /api/services/:id` | viewer / admin | Services and components |
| `GET`/`POST /api/oncall`, `POST /api/oncall/:id/overrides`, `DELETE /api/oncall/:id` | viewer / responder / admin | Rotations, with backup and overrides; new incidents default their commander to whoever is on call |
| `GET`/`POST /api/maintenance`, `GET`/`PATCH /api/maintenance/:id` | viewer / admin | Scheduled maintenance windows |
| `GET`/`POST /api/users`, `PATCH /api/users/:id` | admin | User management |
| `GET`/`POST /api/tokens`, `DELETE /api/tokens/:id` | admin | API tokens for scripts (viewer or responder only) |
| `/api/webhooks` and `/api/webhooks/:id/{rotate-secret,test,deliveries}` | admin | Webhook registry |

A resolved incident can only be reopened (moved back to `investigating`).
Requests are rate limited (300 a minute per address, and 10 login attempts per
15 minutes); `429` responses carry `Retry-After`.

## Webhooks

Register an HTTPS URL and, optionally, the events you want (`incident.created`,
`incident.updated`, `incident.resolved`). The secret is shown once. Each
request is a JSON body of the incident's *public* view (the same data as the
status page; internal updates and commanders are never sent) with these headers:

```
X-Incident-Event:      incident.updated
X-Incident-Delivery:   dlv_1a2b3c4d5e6f
X-Incident-Signature:  t=1718000000,v1=<hex HMAC-SHA256>
```

The signature is `HMAC-SHA256(secret, "<t>.<raw body>")`. Verify it against the
raw bytes you received, in constant time, and reject timestamps more than a few
minutes old:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, header, rawBody, nowMs = Date.now()) {
  const fields = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(nowMs / 1000 - Number(fields.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${fields.t}.${rawBody}`).digest();
  const given = Buffer.from(fields.v1 ?? '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

Set `format` to `slack` to get a Slack incoming-webhook message (headline, status,
affected services and the newest public update) instead of the JSON event.
The signature headers are sent either way, over the bytes actually sent.

Failed deliveries (network errors, timeouts, 429, 5xx) are retried after 2
seconds, 10 seconds and a minute; other 4xx answers and redirects are not
retried or followed. Each attempt is recorded and listed by
`GET /api/webhooks/:id/deliveries` (status codes only, never bodies). Hosts are
checked when the webhook is saved and again when it is sent, and addresses in
private ranges are refused. The second check cannot rule out DNS rebinding, so
run the server where it cannot reach internal services if that matters to you.

## Operating notes

- `node server/cli.js prune` removes old webhook deliveries, expired sessions
  and expired tokens. It never touches incidents or the audit log.
- The audit log is append-only and hash-chained; `GET /api/audit/verify`
  reports where the chain breaks if an entry is edited or removed in the
  database. It detects tampering after the fact, not by someone who can
  rewrite the whole chain.
- `SIGTERM` stops accepting connections, lets in-flight webhook deliveries
  finish (10 seconds at most) and closes the store.
- Requests get an `X-Request-Id` and one JSON access-log line each; query
  strings are left out of the log.

## Client

```
cd client
npm install
npm run dev
```

Vite serves the UI on port 5173 and proxies `/api` to the API on port 3000.
Vite 7 needs Node 20.19 or newer.

## License

MIT, see `LICENSE`.
