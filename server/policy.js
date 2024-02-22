// Who may call what. One table, one function, so the rule for any route can
// be read (and tested) without opening a handler.
//
//   public     anyone, signed in or not
//   viewer     any signed-in user
//   responder  can open incidents and post updates
//   admin      can change services, schedules, users and settings

const PUBLIC = [
  ['GET', /^\/api\/status\/?$/],
  ['GET', /^\/api\/auth\/me\/?$/],
  ['POST', /^\/api\/auth\/login\/?$/],
  ['POST', /^\/api\/auth\/logout\/?$/],
];

const RESPONDER = [
  ['POST', /^\/api\/incidents\/?$/],
  ['POST', /^\/api\/incidents\/[^/]+\/updates\/?$/],
  ['POST', /^\/api\/oncall\/[^/]+\/overrides\/?$/],
];

const matches = (rules, method, path) => rules.some(([m, re]) => m === method && re.test(path));

export function requiredRole(method, path) {
  if (matches(PUBLIC, method, path)) return 'public';
  if (method === 'GET' || method === 'HEAD') return 'viewer';
  if (matches(RESPONDER, method, path)) return 'responder';
  return 'admin';
}
