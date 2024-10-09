import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// Resolves a URL path to a file under root, or null if it would escape root.
export function resolveInside(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = normalize(join(root, decoded));
  const base = normalize(root + sep);
  return full === normalize(root) || full.startsWith(base) ? full : null;
}

async function fileIfExists(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

// Serves the built client. Returns false when the request isn't for a file
// this handler should answer, so the caller can fall through to a 404.
export function createStaticHandler(root) {
  return async function serve(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const target = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    let file = resolveInside(root, target);
    if (file === null) return false;
    let info = await fileIfExists(file);
    // Paths without an extension are client-side routes: serve the app shell.
    if (!info && extname(target) === '') {
      file = join(root, 'index.html');
      info = await fileIfExists(file);
    }
    if (!info) return false;

    const hashed = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  };
}
