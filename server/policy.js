// Who may call what. One table, one function, so the rule for any route can
// be read (and tested) without opening a handler.
//
//   public     anyone, signed in or not
//   viewer     any signed-in user
//   responder  can open incidents and post updates
//   admin      can change services, schedules, users and settings

const PUBLIC = [
  ['GET', /^\/healthz\/?$/],
  ['GET', /^\/api\/status\/?$/],
  ['GET', /^\/api\/auth\/me\/?$/],
  ['POST', /^\/api\/auth\/login\/?$/],
  ['POST', /^\/api\/auth\/logout\/?$/],
];

// Reads that expose who did what, or credentials-adjacent settings.
const ADMIN_READ = [['GET', /^\/api\/(audit|users|webhooks|tokens)(\/|$)/]];

// Things any signed-in user may do to their own account.
const SELF_SERVICE = [
  ['DELETE', /^\/api\/auth\/sessions\/?$/],
  ['POST', /^\/api\/auth\/password\/?$/],
];

const RESPONDER = [
  ['POST', /^\/api\/incidents\/?$/],
  ['POST', /^\/api\/incidents\/[^/]+\/updates\/?$/],
  ['POST', /^\/api\/oncall\/[^/]+\/overrides\/?$/],
  ['PUT', /^\/api\/incidents\/[^/]+\/(postmortem|labels)\/?$/],
];

const matches = (rules, method, path) => rules.some(([m, re]) => m === method && re.test(path));

export function requiredRole(method, path) {
  if (matches(PUBLIC, method, path)) return 'public';
  if (matches(ADMIN_READ, method, path)) return 'admin';
  if (method === 'GET' || method === 'HEAD') return 'viewer';
  if (matches(SELF_SERVICE, method, path)) return 'viewer';
  if (matches(RESPONDER, method, path)) return 'responder';
  return 'admin';
}
