import { HttpError } from './errors.js';
import { readJson, sendJson, sendText } from './http.js';
import { createRouter } from './router.js';
import { registerIncidentRoutes } from './handlers/incidents.js';
import { registerServiceRoutes } from './handlers/services.js';

const modules = [registerIncidentRoutes, registerServiceRoutes];

export function createApp({ store, clock = () => new Date().toISOString(), logger = console } = {}) {
  const router = createRouter();
  const deps = { store, clock, logger };
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
    const ctx = {
      ...deps,
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
    if (result.text !== undefined) {
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

  return { handle, router };
}
