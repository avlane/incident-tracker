import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Stored format: scrypt$N$r$p$<salt base64>$<hash base64>
// The cost parameters are stored with each hash, so they can be raised later
// and old hashes keep verifying (see needsRehash).
export const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64, saltLength: 16 };

export async function hashPassword(password, params = DEFAULT_PARAMS) {
  const { N, r, p, keylen, saltLength } = { ...DEFAULT_PARAMS, ...params };
  const salt = randomBytes(saltLength);
  const hash = await scryptAsync(password.normalize('NFKC'), salt, keylen, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

function parse(stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, N, r, p, salt, hash] = parts;
  const parsed = { N: Number(N), r: Number(r), p: Number(p), salt: Buffer.from(salt, 'base64'), hash: Buffer.from(hash, 'base64') };
  if (![parsed.N, parsed.r, parsed.p].every(Number.isInteger) || parsed.hash.length === 0) return null;
  return parsed;
}

export async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed) return false;
  const { N, r, p, salt, hash } = parsed;
  const candidate = await scryptAsync(password.normalize('NFKC'), salt, hash.length, { N, r, p });
  return timingSafeEqual(candidate, hash);
}

export function needsRehash(stored, params = DEFAULT_PARAMS) {
  const parsed = parse(stored);
  if (!parsed) return true;
  const want = { ...DEFAULT_PARAMS, ...params };
  return parsed.N < want.N || parsed.r < want.r || parsed.p < want.p;
}

const COMMON = new Set(['password', 'password1', 'password123', '1234567890', 'qwertyuiop', 'letmein123', 'incident123']);

// Returns a list of problems; an empty list means the password is acceptable.
export function passwordProblems(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 10) problems.push('must be at least 10 characters');
  else if (password.length > 200) problems.push('must be at most 200 characters');
  else if (COMMON.has(password.toLowerCase())) problems.push('is too common');
  return problems;
}
