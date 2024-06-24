import { isIP } from 'node:net';

// Webhook URLs are supplied by users, and the server will POST to them, so an
// unchecked URL lets someone make this server call internal addresses (cloud
// metadata endpoints, admin panels). This module checks the URL as written.
// It cannot see what a hostname resolves to; that has to be checked again at
// delivery time.

function privateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function isPrivateAddress(ip) {
  const family = isIP(ip);
  if (family === 4) return privateV4(ip);
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped addresses: written as ::ffff:10.0.0.1, but the URL parser
    // normalises them to ::ffff:a00:1, so both spellings are handled.
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (dotted) return privateV4(dotted[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return lower === '::1' || lower === '::' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return false;
}

// Returns an error message, or null when the URL is acceptable.
export function webhookUrlProblem(value, { allowPrivate = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return 'url is not a valid URL';
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    return 'url must use https';
  }
  if (url.username || url.password) return 'url must not contain credentials';
  if (allowPrivate) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'url must not point at a local or internal host';
  }
  if (isPrivateAddress(host)) return 'url must not point at a private address';
  return null;
}
