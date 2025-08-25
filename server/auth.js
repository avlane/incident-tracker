import { createHash, randomBytes } from 'node:crypto';
import { conflict, unprocessable } from './errors.js';
import { hashPassword, needsRehash, passwordProblems, verifyPassword } from './passwords.js';

export const ROLES = ['viewer', 'responder', 'admin'];
// API tokens are for scripts; they can read and respond but never administer.
export const TOKEN_ROLES = ['viewer', 'responder'];
export const TOKEN_PREFIX = 'itk_';

const rank = (role) => ROLES.indexOf(role);
export const hasRole = (user, needed) => rank(user.role) >= rank(needed);

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function publicUser(user) {
  const { passwordHash, ...rest } = user; // eslint-disable-line no-unused-vars
  return rest;
}

// Users and sessions live in the store. Only a SHA-256 of each session token is
// stored, so a leaked database file does not hand out working sessions.
export function createAuthService({
  store,
  clock,
  sessionTtlMs = 12 * 3_600_000,
  // Activity keeps a session alive, but never past this age.
  sessionMaxAgeMs = 7 * 24 * 3_600_000,
  hashParams,
  randomToken = () => randomBytes(32).toString('base64url'),
}) {
  let dummyHash;

  const findByEmail = (email) => store.list('users').find((u) => u.email === email.trim().toLowerCase()) ?? null;

  async function createUser({ email, name, role, password }) {
    const problems = passwordProblems(password);
    if (problems.length > 0) {
      throw unprocessable([{ field: 'password', message: `password ${problems[0]}` }]);
    }
    if (findByEmail(email)) throw conflict(`a user with email ${email} already exists`);
    const user = {
      id: `usr_${randomBytes(6).toString('hex')}`,
      email: email.trim().toLowerCase(),
      name,
      role,
      passwordHash: await hashPassword(password, hashParams),
      disabled: false,
      createdAt: clock(),
    };
    store.put('users', user);
    return publicUser(user);
  }

  // Returns { token, user, expiresAt } or null. Unknown emails still spend the
  // time of a hash check, so response timing doesn't reveal which emails exist.
  async function login(email, password) {
    const user = typeof email === 'string' ? findByEmail(email) : null;
    if (!user) {
      dummyHash ??= await hashPassword('not a real password', hashParams);
      await verifyPassword(typeof password === 'string' ? password : '', dummyHash);
      return null;
    }
    const ok = typeof password === 'string' && (await verifyPassword(password, user.passwordHash));
    if (!ok || user.disabled) return null;
    if (needsRehash(user.passwordHash, hashParams)) {
      store.put('users', { ...user, passwordHash: await hashPassword(password, hashParams) });
    }
    const token = randomToken();
    const now = clock();
    const expiresAt = new Date(Date.parse(now) + sessionTtlMs).toISOString();
    store.put('sessions', { id: hashToken(token), userId: user.id, createdAt: now, expiresAt });
    return { token, user: publicUser(user), expiresAt };
  }

  // Sliding expiry: use the session and it keeps going, up to the absolute cap.
  // Only written once half the lifetime is gone, so reads don't turn into writes.
  function slide(session) {
    const now = Date.parse(clock());
    if (Date.parse(session.expiresAt) - now > sessionTtlMs / 2) return session;
    const capped = Math.min(now + sessionTtlMs, Date.parse(session.createdAt) + sessionMaxAgeMs);
    if (capped <= Date.parse(session.expiresAt)) return session;
    const next = { ...session, expiresAt: new Date(capped).toISOString() };
    store.put('sessions', next);
    return next;
  }

  // --- API tokens -------------------------------------------------------

  function createApiToken({ name, role, createdBy, expiresInDays }) {
    const token = `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
    const now = clock();
    const doc = {
      id: hashToken(token),
      name,
      role,
      createdBy,
      createdAt: now,
      expiresAt: expiresInDays ? new Date(Date.parse(now) + expiresInDays * 86_400_000).toISOString() : null,
      lastUsedAt: null,
    };
    store.put('tokens', doc);
    return { token, record: presentToken(doc) };
  }

  // The record id is the stored hash, so show a short stable prefix of it instead.
  const presentToken = ({ id, ...rest }) => ({ id: `tok_${id.slice(0, 10)}`, ...rest });

  const listApiTokens = () => store.list('tokens').map(presentToken);

  function revokeApiToken(publicId) {
    const doc = store.list('tokens').find((t) => `tok_${t.id.slice(0, 10)}` === publicId);
    return doc ? store.remove('tokens', doc.id) : false;
  }

  function authenticateApiToken(token) {
    const doc = store.get('tokens', hashToken(token));
    if (!doc) return null;
    const now = clock();
    if (doc.expiresAt && Date.parse(doc.expiresAt) <= Date.parse(now)) return null;
    // Record use at most once an hour so reads don't become writes.
    if (!doc.lastUsedAt || Date.parse(now) - Date.parse(doc.lastUsedAt) > 3_600_000) {
      store.put('tokens', { ...doc, lastUsedAt: now });
    }
    return {
      user: { id: `tok_${doc.id.slice(0, 10)}`, name: `token: ${doc.name}`, email: null, role: doc.role, kind: 'token' },
      session: null,
    };
  }

  function authenticate(token) {
    if (typeof token !== 'string' || token === '') return null;
    if (token.startsWith(TOKEN_PREFIX)) return authenticateApiToken(token);
    const session = store.get('sessions', hashToken(token));
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= Date.parse(clock())) {
      store.remove('sessions', session.id);
      return null;
    }
    const user = store.get('users', session.userId);
    if (!user || user.disabled) return null;
    return { user: publicUser(user), session: slide(session) };
  }

  function logout(token) {
    return store.remove('sessions', hashToken(token));
  }

  // Signs a user out of every device. Returns how many sessions were removed.
  function logoutAll(userId) {
    let removed = 0;
    for (const session of store.list('sessions')) {
      if (session.userId === userId && store.remove('sessions', session.id)) removed++;
    }
    return removed;
  }

  function purgeExpired() {
    const now = Date.parse(clock());
    let removed = 0;
    for (const session of store.list('sessions')) {
      if (Date.parse(session.expiresAt) <= now && store.remove('sessions', session.id)) removed++;
    }
    return removed;
  }

  // Changing your password needs the current one (a stolen session alone
  // isn't enough) and signs every other session out. Returns the number of
  // other sessions removed, or null when the current password was wrong.
  async function changePassword(userId, currentPassword, newPassword, keepToken) {
    const user = store.get('users', userId);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) return null;
    const problems = passwordProblems(newPassword);
    if (problems.length > 0) throw unprocessable([{ field: 'next', message: `password ${problems[0]}` }]);
    if (newPassword === currentPassword) {
      throw unprocessable([{ field: 'next', message: 'the new password must differ from the current one' }]);
    }
    store.put('users', { ...user, passwordHash: await hashPassword(newPassword, hashParams) });
    const keep = keepToken ? hashToken(keepToken) : null;
    let removed = 0;
    for (const session of store.list('sessions')) {
      if (session.userId === userId && session.id !== keep && store.remove('sessions', session.id)) removed++;
    }
    return removed;
  }

  // Role and disabled changes. The tracker must always keep at least one
  // enabled admin, otherwise nobody can fix things from inside the app.
  function updateUser(id, changes) {
    const user = store.get('users', id);
    if (!user) return null;
    const next = { ...user, ...changes };
    const wasAdmin = user.role === 'admin' && !user.disabled;
    const stillAdmin = next.role === 'admin' && !next.disabled;
    if (wasAdmin && !stillAdmin) {
      const others = store.list('users').filter((u) => u.id !== id && u.role === 'admin' && !u.disabled);
      if (others.length === 0) throw conflict('this is the last enabled admin');
    }
    store.put('users', next);
    if (next.disabled && !user.disabled) logoutAll(id);
    return publicUser(next);
  }

  const listUsers = () => store.list('users').map(publicUser);

  return { createUser, login, authenticate, logout, logoutAll, changePassword, updateUser, createApiToken, listApiTokens, revokeApiToken, purgeExpired, listUsers, findByEmail };
}
