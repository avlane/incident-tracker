// A thin wrapper over fetch for the incident API. It has no React in it and
// takes the fetch function as a parameter, so it can be tested with a stub.

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

// Calls to these paths can legitimately answer 401 without meaning "your
// session ran out", so they don't trigger onUnauthorized.
const AUTH_PATHS = ['/api/auth/login', '/api/auth/me', '/api/auth/logout'];

export function createApi({
  fetchImpl = (...args) => globalThis.fetch(...args),
  base = '',
  onUnauthorized = () => {},
} = {}) {
  async function request(method, path, body) {
    const init = { method, credentials: 'same-origin', headers: { accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetchImpl(base + path, init);
    if (res.status === 204) return null;
    const type = res.headers.get('content-type') ?? '';
    const payload = type.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      if (res.status === 401 && !AUTH_PATHS.includes(path)) onUnauthorized();
      const error = payload && payload.error ? payload.error : {};
      throw new ApiError(res.status, error.message ?? `request failed (${res.status})`, error.details);
    }
    return payload;
  }

  return {
    login: (email, password) => request('POST', '/api/auth/login', { email, password }),
    logout: () => request('POST', '/api/auth/logout'),
    me: () => request('GET', '/api/auth/me'),
    listIncidents: (filters) => request('GET', `/api/incidents${buildQuery(filters)}`),
    getIncident: (id) => request('GET', `/api/incidents/${encodeURIComponent(id)}`),
    createIncident: (input) => request('POST', '/api/incidents', input),
    postUpdate: (id, input) => request('POST', `/api/incidents/${encodeURIComponent(id)}/updates`, input),
    putPostmortem: (id, input) => request('PUT', `/api/incidents/${encodeURIComponent(id)}/postmortem`, input),
    listActionItems: (filters) => request('GET', `/api/action-items${buildQuery(filters)}`),
    getPostmortem: (id) => request('GET', `/api/incidents/${encodeURIComponent(id)}/postmortem`),
    getMetrics: (range) => request('GET', `/api/metrics${buildQuery(range)}`),
    getStatus: () => request('GET', '/api/status'),
    listServices: () => request('GET', '/api/services'),
    listOnCall: () => request('GET', '/api/oncall'),
  };
}
