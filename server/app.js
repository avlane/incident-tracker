import { HttpError, tooManyRequests } from './errors.js';
import { bearerToken, clientIp, parseCookies, readJson, sendJson, sendText } from './http.js';
import { createRateLimiter } from './ratelimit.js';
import { accessLogLine, requestIdFor } from './requestlog.js';
import { createAuditLog } from './audit.js';
import { createDispatcher } from './dispatcher.js';
import { createAuthService, hasRole } from './auth.js';
import { requiredRole } from './policy.js';
import { toPublicIncident } from './statuspage.js';
import { createRouter } from './router.js';
import { createStaticHandler } from './static.js';
import { registerActionItemRoutes } from './handlers/actionitems.js';
import { registerAuditRoutes } from './handlers/audit.js';
import { registerAuthRoutes, SESSION_COOKIE } from './handlers/auth.js';
import { registerExportRoutes } from './handlers/export.js';
import { registerHealthRoutes } from './handlers/health.js';
import { registerIncidentRoutes } from './handlers/incidents.js';
import { registerMaintenanceRoutes } from './handlers/maintenance.js';
import { registerMetricsRoutes } from './handlers/metrics.js';
import { registerOnCallRoutes } from './handlers/oncall.js';
import { registerPostmortemRoutes } from './handlers/postmortem.js';
import { registerServiceRoutes } from './handlers/services.js';
import { registerStatusRoutes } from './handlers/status.js';
import { registerTokenRoutes } from './handlers/tokens.js';
import { registerUserRoutes } from './handlers/users.js';
import { registerWebhookRoutes } from './handlers/webhooks.js';

const modules = [
  registerHealthRoutes,
  registerAuthRoutes,
  registerAuditRoutes,
  registerActionItemRoutes,
  registerIncidentRoutes,
  registerServiceRoutes,
  registerPostmortemRoutes,
  registerOnCallRoutes,
  registerExportRoutes,
  registerMaintenanceRoutes,
  registerMetricsRoutes,
  registerStatusRoutes,
  registerTokenRoutes,
  registerUserRoutes,
  registerWebhookRoutes,
];

export function createApp({
  store,
  clock = () => new Date().toISOString(),
  logger = console,
  hashParams,
  requireAuth = true,
  trustProxy = false,
  rateLimit = {},
  // allowPrivate lets webhooks target http:// and internal addresses (development only).
  webhookPolicy = { allowPrivate: false },
  dispatcherOptions = {},
  // Directory holding the built client (client/dist); omit to serve the API only.
  staticDir = null,
  // Write one JSON line per request to logger.info.
  accessLog = false,
  // Absolute URL of the client, used for links in the Atom feed.
  publicUrl = 'http://localhost:3000',
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
  const dispatcher = createDispatcher({ store, clock, logger, allowPrivate: webhookPolicy.allowPrivate, ...dispatcherOptions });
  // Expired sessions are also ignored when presented, this just keeps them from piling up.
  const sessionSweeper = setInterval(() => auth.purgeExpired(), 3_600_000);
  sessionSweeper.unref();
  const deps = { store, clock, logger, auth, limiters, auditLog, webhookPolicy, dispatcher, trustProxy, publicUrl };
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
    // Checked before routing, so signed-out callers can't probe which paths exist.
    const needed = requireAuth ? requiredRole(req.method, url.pathname) : 'public';
    const token = bearerToken(req.headers.authorization) ?? parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? null;
    const user = auth.authenticate(token)?.user ?? null;
    if (needed !== 'public') {
      if (!user) throw new HttpError(401, 'sign in required');
      if (!hasRole(user, needed)) throw new HttpError(403, `requires the ${needed} role`);
    }
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'not found');
    if (found.allowed) {
      const error = new HttpError(405, 'method not allowed');
      error.headers = { allow: found.allowed.join(', ') };
      throw error;
    }
    req.logContext.user = user;
    let parsed;
    const ctx = {
      ...deps,
      ip,
      token,
      user,
      // Webhooks get the same public view the status page shows, never the raw incident.
      notify: (type, incident) => dispatcher.emit(type, toPublicIncident(incident, store.list('services'))),
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

  const serveStatic = staticDir ? createStaticHandler(staticDir) : null;

  async function handle(req, res) {
    const id = requestIdFor(req);
    const started = Date.now();
    res.setHeader('x-request-id', id);
    // Handlers fill this in so the log line can name the caller.
    req.logContext = {};
    if (accessLog) {
      res.on('finish', () => {
        logger.info(
          accessLogLine({ id, req, status: res.statusCode, ms: Date.now() - started, user: req.logContext.user, ip: clientIp(req, trustProxy), at: clock() }),
        );
      });
    }
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (serveStatic && !pathname.startsWith('/api/')) {
        if (await serveStatic(req, res, pathname)) return;
        throw new HttpError(404, 'not found');
      }
      await dispatch(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        const body = { error: { message: err.message } };
        if (err.details !== undefined) body.error.details = err.details;
        sendJson(res, err.status, body, err.headers);
      } else {
        logger.error(`request ${id} failed:`, err);
        sendJson(res, 500, { error: { message: 'internal error' } });
      }
    }
  }

  return {
    handle,
    router,
    auth,
    auditLog,
    idle: () => dispatcher.idle(),
    close() {
      clearInterval(sweeper);
      clearInterval(sessionSweeper);
    },
  };
}
