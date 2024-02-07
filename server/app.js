import { HttpError } from './errors.js';
import { bearerToken, parseCookies, readJson, sendJson, sendText } from './http.js';
import { createAuthService } from './auth.js';
import { createRouter } from './router.js';
import { registerAuthRoutes, SESSION_COOKIE } from './handlers/auth.js';
import { registerExportRoutes } from './handlers/export.js';
import { registerIncidentRoutes } from './handlers/incidents.js';
import { registerOnCallRoutes } from './handlers/oncall.js';
import { registerPostmortemRoutes } from './handlers/postmortem.js';
import { registerServiceRoutes } from './handlers/services.js';
import { registerStatusRoutes } from './handlers/status.js';

const modules = [registerAuthRoutes, registerIncidentRoutes, registerServiceRoutes, registerPostmortemRoutes, registerOnCallRoutes, registerExportRoutes, registerStatusRoutes];

export function createApp({ store, clock = () => new Date().toISOString(), logger = console, hashParams } = {}) {
  const router = createRouter();
  const auth = createAuthService({ store, clock, hashParams });
  const deps = { store, clock, logger, auth };
  for (const register of modules) register(router, deps);

  // Handlers return { status?, body?, text?, contentType?, headers? }.
  async function dispatch(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'not found');
    if (found.allowed) {
      const error = new HttpError(405, 'method not allowed');
      error.headers = { allow: found.allowed.join(', ') };
      throw error;
    }
    let parsed;
    const token = bearerToken(req.headers.authorization) ?? parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? null;
    const ctx = {
      ...deps,
      token,
      user: auth.authenticate(token)?.user ?? null,
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

  return { handle, router, auth };
}
