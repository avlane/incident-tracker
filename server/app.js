import { HttpError, tooManyRequests } from './errors.js';
import { bearerToken, clientIp, parseCookies, readJson, sendJson, sendText } from './http.js';
import { createRateLimiter } from './ratelimit.js';
import { createAuditLog } from './audit.js';
import { createAuthService, hasRole } from './auth.js';
import { requiredRole } from './policy.js';
import { createRouter } from './router.js';
import { registerAuthRoutes, SESSION_COOKIE } from './handlers/auth.js';
import { registerExportRoutes } from './handlers/export.js';
import { registerIncidentRoutes } from './handlers/incidents.js';
import { registerOnCallRoutes } from './handlers/oncall.js';
import { registerPostmortemRoutes } from './handlers/postmortem.js';
import { registerServiceRoutes } from './handlers/services.js';
import { registerStatusRoutes } from './handlers/status.js';

const modules = [
  registerAuthRoutes,
  registerIncidentRoutes,
  registerServiceRoutes,
  registerPostmortemRoutes,
  registerOnCallRoutes,
  registerExportRoutes,
  registerStatusRoutes,
];

export function createApp({
  store,
  clock = () => new Date().toISOString(),
  logger = console,
  hashParams,
  requireAuth = true,
  trustProxy = false,
  rateLimit = {},
} = {}) {
  const router = createRouter();
  const auth = createAuthService({ store, clock, hashParams });
  // rateLimit: false turns limiting off; otherwise each part can be tuned.
  const limits = rateLimit === false ? null : rateLimit;
  const limiters = limits
    ? {
        global: createRateLimiter({ limit: 300, windowMs: 60_000, ...limits.global, now: limits.now }),
        login: createRateLimiter({ limit: 10, windowMs: 15 * 60_000, ...limits.login, now: limits.now }),
      }
    : null;
  const sweeper = limiters
    ? setInterval(() => Object.values(limiters).forEach((l) => l.sweep()), 60_000)
    : null;
  sweeper?.unref();
  const auditLog = createAuditLog({ store, clock });
  const deps = { store, clock, logger, auth, limiters, auditLog };
  for (const register of modules) register(router, deps);

  // Handlers return { status?, body?, text?, contentType?, headers? }.
  async function dispatch(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const ip = clientIp(req, trustProxy);
    if (limiters) {
      const verdict = limiters.global.check(ip);
      res.setHeader('ratelimit-limit', String(verdict.limit));
      res.setHeader('ratelimit-remaining', String(verdict.remaining));
      if (!verdict.allowed) throw tooManyRequests(verdict.retryAfterSeconds);
    }
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'not found');
    if (found.allowed) {
      const error = new HttpError(405, 'method not allowed');
      error.headers = { allow: found.allowed.join(', ') };
      throw error;
    }
    const needed = requireAuth ? requiredRole(req.method, url.pathname) : 'public';
    const token = bearerToken(req.headers.authorization) ?? parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? null;
    const user = auth.authenticate(token)?.user ?? null;
    if (needed !== 'public') {
      if (!user) throw new HttpError(401, 'sign in required');
      if (!hasRole(user, needed)) throw new HttpError(403, `requires the ${needed} role`);
    }
    let parsed;
    const ctx = {
      ...deps,
      ip,
      token,
      user,
      // Handlers call this after a change succeeds: ctx.audit('incident.create', id, { ... }).
      audit: (action, target, meta, actor = user) => auditLog.record({ actor, action, target, ip, meta }),
      req,
      url,
      query: url.searchParams,
      params: found.params,
      async readBody() {
        parsed ??= await readJson(req);
        return parsed;
      },
    };
    const result = (await found.handler(ctx)) ?? {};
    const status = result.status ?? 200;
    if (status === 204) {
      res.writeHead(204, result.headers);
      res.end();
    } else if (result.text !== undefined) {
      sendText(res, status, result.text, result.contentType, result.headers);
    } else {
      sendJson(res, status, result.body ?? {}, result.headers);
    }
  }

  async function handle(req, res) {
    try {
      await dispatch(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        const body = { error: { message: err.message } };
        if (err.details !== undefined) body.error.details = err.details;
        sendJson(res, err.status, body, err.headers);
      } else {
        logger.error(err);
        sendJson(res, 500, { error: { message: 'internal error' } });
      }
    }
  }

  return { handle, router, auth, auditLog, close: () => clearInterval(sweeper) };
}
