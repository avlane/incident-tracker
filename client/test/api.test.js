import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, buildQuery, createApi } from '../src/lib/api.js';

function stubFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body, type = 'application/json' } = responses.shift();
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
      json: async () => body,
      text: async () => body,
    };
  };
  return { fetchImpl, calls };
}

test('buildQuery skips empty values and joins lists', () => {
  assert.equal(buildQuery({}), '');
  assert.equal(buildQuery({ q: '', status: [] }), '');
  assert.equal(buildQuery({ q: 'db down', severity: ['sev1', 'sev2'], open: true }), '?q=db+down&severity=sev1%2Csev2&open=true');
});

test('listIncidents sends filters as a query string', async () => {
  const { fetchImpl, calls } = stubFetch([{ body: { incidents: [], total: 0 } }]);
  const api = createApi({ fetchImpl });
  const result = await api.listIncidents({ open: true });
  assert.deepEqual(result, { incidents: [], total: 0 });
  assert.equal(calls[0].url, '/api/incidents?open=true');
  assert.equal(calls[0].init.method, 'GET');
});

test('createIncident posts JSON', async () => {
  const { fetchImpl, calls } = stubFetch([{ status: 201, body: { incident: { id: 'INC-0001' } } }]);
  const api = createApi({ fetchImpl, base: 'http://x' });
  await api.createIncident({ title: 'a', severity: 'sev3' });
  assert.equal(calls[0].url, 'http://x/api/incidents');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { title: 'a', severity: 'sev3' });
});

test('errors become ApiError with details', async () => {
  const { fetchImpl } = stubFetch([
    { status: 422, body: { error: { message: 'validation failed', details: [{ field: 'title', message: 'title is required' }] } } },
  ]);
  const api = createApi({ fetchImpl });
  await assert.rejects(api.createIncident({}), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.details[0].field, 'title');
    return true;
  });
});

test('ids are URL-encoded and 204 gives null', async () => {
  const { fetchImpl, calls } = stubFetch([{ status: 200, body: { incident: {} } }, { status: 204 }]);
  const api = createApi({ fetchImpl });
  await api.getIncident('a/b');
  assert.equal(calls[0].url, '/api/incidents/a%2Fb');
});
