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

export function createApi({ fetchImpl = (...args) => globalThis.fetch(...args), base = '' } = {}) {
  async function request(method, path, body) {
    const init = { method, headers: { accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetchImpl(base + path, init);
    if (res.status === 204) return null;
    const type = res.headers.get('content-type') ?? '';
    const payload = type.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const error = payload && payload.error ? payload.error : {};
      throw new ApiError(res.status, error.message ?? `request failed (${res.status})`, error.details);
    }
    return payload;
  }

  return {
    listIncidents: (filters) => request('GET', `/api/incidents${buildQuery(filters)}`),
    getIncident: (id) => request('GET', `/api/incidents/${encodeURIComponent(id)}`),
    createIncident: (input) => request('POST', '/api/incidents', input),
    postUpdate: (id, input) => request('POST', `/api/incidents/${encodeURIComponent(id)}/updates`, input),
    getPostmortem: (id) => request('GET', `/api/incidents/${encodeURIComponent(id)}/postmortem`),
    getStatus: () => request('GET', '/api/status'),
    listServices: () => request('GET', '/api/services'),
    listOnCall: () => request('GET', '/api/oncall'),
  };
}
