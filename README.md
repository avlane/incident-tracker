# incident-tracker

A small-team incident tracker. Open an incident, post updates as the status
moves from investigating to resolved, keep a service list and an on-call
rotation, generate a postmortem draft, and publish a public status page.

The API is a plain Node program with no dependencies. The browser client is a
separate package under `client/` (React and Vite).

## Tests

- The server code, the store, the router and the domain logic are covered by
  tests that run with `node --test`. Those tests start the real HTTP server on
  an ephemeral port and call it with `fetch`, so the request path is
  exercised end to end.
- The client's plain JavaScript modules (`client/src/lib/*.js`: the API
  wrapper, form and filter logic, routing, timeline helpers) are tested with
  `node --test` too.

## Running the API

Needs Node 18 or newer.

```
npm start
```

Environment variables: `PORT` (default 3000), `HOST` (default 127.0.0.1) and
`DATA_FILE` (default `data/incidents.json`).

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

## HTTP API

| Method and path | What it does |
|---|---|
| `POST /api/incidents` | Open an incident (`title`, `severity`, optional `summary`, `commander`, `affected`, `public`) |
| `GET /api/incidents` | List and search: `q`, `severity`, `status`, `open`, `service`, `from`, `to`, `sort`, `limit`, `offset` |
| `GET /api/incidents/:id` | One incident with its timeline |
| `POST /api/incidents/:id/updates` | Post an update, optionally changing status or severity; `visibility: "internal"` keeps it off the status page |
| `GET /api/incidents/:id/postmortem` | Markdown postmortem draft |
| `GET /api/export/incidents.csv` | CSV export, same filters as the list |
| `GET`/`POST /api/services`, `GET`/`PATCH`/`DELETE /api/services/:id` | Services and their components |
| `GET`/`POST /api/oncall`, `POST /api/oncall/:id/overrides` | Rotations and overrides; new incidents default their commander to whoever is on call |
| `GET /api/status` | Public status page data |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Sign in, sign out, who am I |

A resolved incident can only be reopened (moved back to `investigating`).

## Client

```
cd client
npm install
npm run dev
```

Vite serves the UI on port 5173 and proxies `/api` to the API on port 3000..

## License

MIT, see `LICENSE`.
