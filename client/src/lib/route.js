// Hash-based routing: #/ is the list, #/incidents/INC-0001 is one incident.

export function parseHash(hash) {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'list' };
  if (parts.length === 1 && parts[0] === 'status') return { name: 'status' };
  if (parts[0] === 'incidents' && parts.length === 2) {
    return { name: 'incident', id: decodeURIComponent(parts[1]) };
  }
  return { name: 'not-found' };
}

export function hrefFor(route) {
  if (route.name === 'status') return '#/status';
  if (route.name === 'incident') return `#/incidents/${encodeURIComponent(route.id)}`;
  return '#/';
}
