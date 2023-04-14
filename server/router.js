// A very small router. Patterns look like /api/incidents/:id and are matched
// segment by segment; there are no regular expressions or wildcards.

function compile(pattern) {
  return pattern
    .split('/')
    .filter(Boolean)
    .map((part) => (part.startsWith(':') ? { param: part.slice(1) } : { literal: part }));
}

function matchSegments(segments, path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.literal !== undefined) {
      if (seg.literal !== parts[i]) return null;
    } else {
      try {
        params[seg.param] = decodeURIComponent(parts[i]);
      } catch {
        return null;
      }
    }
  }
  return params;
}

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    routes.push({ method, segments: compile(pattern), handler });
  }

  // Returns { handler, params } for a match, { allowed: [...] } when the path
  // exists under other methods, or null when nothing matches the path.
  function match(method, path) {
    const allowed = [];
    for (const route of routes) {
      const params = matchSegments(route.segments, path);
      if (params === null) continue;
      if (route.method === method) return { handler: route.handler, params };
      allowed.push(route.method);
    }
    return allowed.length > 0 ? { allowed: [...new Set(allowed)].sort() } : null;
  }

  return {
    add,
    match,
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    put: (pattern, handler) => add('PUT', pattern, handler),
    patch: (pattern, handler) => add('PATCH', pattern, handler),
    delete: (pattern, handler) => add('DELETE', pattern, handler),
  };
}
