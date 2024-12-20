import { HttpError } from './errors.js';

const DEFAULT_LIMIT = 256 * 1024;

// Reads and parses a JSON request body. `req` only needs to be async
// iterable, which keeps this testable with a plain Readable.
export async function readJson(req, { limit = DEFAULT_LIMIT } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'request body too large');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'request body is not valid JSON');
  }
}

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name && !(name in out)) {
      try {
        out[name] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        // ignore cookies that aren't valid percent-encoding
      }
    }
  }
  return out;
}

export function bearerToken(header = '') {
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  return m ? m[1] : null;
}

// The address to rate-limit and audit by. X-Forwarded-For is only believed when
// the operator says a trusted proxy sets it; otherwise anyone could pick their
// own address by sending the header.
export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim() !== '') return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

// True when the browser reached us over HTTPS: either directly, or through a
// trusted proxy that says so. Used to decide whether to add Secure to cookies.
export function isSecureRequest(req, trustProxy = false) {
  if (req.socket?.encrypted) return true;
  return trustProxy && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
}
