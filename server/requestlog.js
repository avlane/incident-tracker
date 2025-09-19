import { randomUUID } from 'node:crypto';

// Request ids let one log line, one error report and one user complaint be
// tied together. An id sent by a proxy is reused if it looks sane; otherwise a
// fresh one is made, so a client can't inject junk into the logs.
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function requestIdFor(req) {
  const given = req.headers['x-request-id'];
  return typeof given === 'string' && SAFE_ID.test(given) ? given : randomUUID();
}

// One JSON object per finished request. The query string is left out on
// purpose: it is where tokens and search terms end up.
export function accessLogLine({ id, req, status, ms, user, ip, at }) {
  return JSON.stringify({
    at,
    id,
    method: req.method,
    path: (req.url ?? '').split('?')[0].slice(0, 200),
    status,
    ms,
    ip,
    user: user ? (user.kind === 'token' ? user.name : user.email) : null,
  });
}
