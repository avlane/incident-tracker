import { HttpError, unprocessable } from '../errors.js';

export const SESSION_COOKIE = 'session';

function cookie(token, expiresAt) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (expiresAt) attrs.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${attrs.join('; ')}`;
}

export function registerAuthRoutes(router, { auth }) {
  router.post('/api/auth/login', async (ctx) => {
    const body = await ctx.readBody();
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw unprocessable([{ field: 'email', message: 'email and password are required' }]);
    }
    const session = await auth.login(body.email, body.password);
    if (!session) throw new HttpError(401, 'invalid email or password');
    return {
      body: { user: session.user, expiresAt: session.expiresAt },
      headers: { 'set-cookie': cookie(session.token, session.expiresAt) },
    };
  });

  router.post('/api/auth/logout', async (ctx) => {
    if (ctx.token) auth.logout(ctx.token);
    return { status: 204, headers: { 'set-cookie': cookie('', new Date(0)) } };
  });

  router.get('/api/auth/me', async (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'not signed in');
    return { body: { user: ctx.user } };
  });
}
