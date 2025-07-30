import { HttpError, tooManyRequests, unprocessable } from '../errors.js';
import { isSecureRequest } from '../http.js';

export const SESSION_COOKIE = 'session';

function cookie(token, expiresAt, secure) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) attrs.push('Secure');
  if (expiresAt) attrs.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${attrs.join('; ')}`;
}

export function registerAuthRoutes(router, { auth, limiters, trustProxy }) {
  router.post('/api/auth/login', async (ctx) => {
    // Failed guesses are what we want to slow down; a success clears the count.
    const verdict = limiters?.login.check(ctx.ip);
    if (verdict && !verdict.allowed) throw tooManyRequests(verdict.retryAfterSeconds);
    const body = await ctx.readBody();
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw unprocessable([{ field: 'email', message: 'email and password are required' }]);
    }
    const session = await auth.login(body.email, body.password);
    if (!session) {
      ctx.audit('auth.login_failed', null, { email: body.email.slice(0, 200) });
      throw new HttpError(401, 'invalid email or password');
    }
    ctx.audit('auth.login', session.user.id, {}, session.user);
    limiters?.login.reset(ctx.ip);
    return {
      body: { user: session.user, expiresAt: session.expiresAt },
      headers: {
        'set-cookie': cookie(session.token, session.expiresAt, isSecureRequest(ctx.req, trustProxy)),
        'cache-control': 'no-store',
      },
    };
  });

  router.post('/api/auth/logout', async (ctx) => {
    if (ctx.token && auth.logout(ctx.token)) ctx.audit('auth.logout', ctx.user?.id ?? null);
    return { status: 204, headers: { 'set-cookie': cookie('', new Date(0), isSecureRequest(ctx.req, trustProxy)), 'cache-control': 'no-store' } };
  });

  // "Sign out everywhere": ends every session this user has, including this one.
  router.delete('/api/auth/sessions', async (ctx) => {
    const removed = auth.logoutAll(ctx.user.id);
    ctx.audit('auth.logout_all', ctx.user.id, { sessions: removed });
    return { body: { removed }, headers: { 'set-cookie': cookie('', new Date(0), isSecureRequest(ctx.req, trustProxy)) } };
  });

  router.post('/api/auth/password', async (ctx) => {
    const body = await ctx.readBody();
    if (typeof body.current !== 'string' || typeof body.next !== 'string') {
      throw unprocessable([{ field: 'next', message: 'current and next are required' }]);
    }
    // Guessing the current password through this route is as good as guessing it at login.
    const key = `pw:${ctx.user.id}`;
    const verdict = limiters?.login.check(key);
    if (verdict && !verdict.allowed) throw tooManyRequests(verdict.retryAfterSeconds);
    const removed = await auth.changePassword(ctx.user.id, body.current, body.next, ctx.token);
    if (removed === null) {
      ctx.audit('auth.password_change_failed', ctx.user.id);
      throw new HttpError(403, 'current password is incorrect');
    }
    limiters?.login.reset(key);
    ctx.audit('auth.password_change', ctx.user.id, { otherSessionsEnded: removed });
    return { body: { ok: true, otherSessionsEnded: removed } };
  });

  router.get('/api/auth/me', async (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'not signed in');
    return { body: { user: ctx.user } };
  });
}
