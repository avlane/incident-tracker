import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplate, createTemplate } from '../server/templates.js';
import { validateTemplateInput } from '../server/validators.js';
import { startTestServer } from './helpers.js';

const tpl = createTemplate(
  {
    name: 'DB failover',
    title: 'Database failover in progress',
    summary: 'The primary is unreachable and replicas are being promoted.',
    severity: 'sev1',
    labels: ['db'],
    affected: [{ serviceId: 'checkout', impact: 'major_outage' }],
  },
  { id: 'tpl_1', now: '2026-06-03T10:00:00.000Z' },
);

test('a template fills in what the request leaves out', () => {
  assert.deepEqual(applyTemplate(tpl, { templateId: 'tpl_1' }), {
    templateId: 'tpl_1',
    title: 'Database failover in progress',
    summary: 'The primary is unreachable and replicas are being promoted.',
    severity: 'sev1',
    affected: [{ serviceId: 'checkout', impact: 'major_outage' }],
    labels: ['db'],
  });
});

test('whatever the request says wins, and labels add up', () => {
  const merged = applyTemplate(tpl, { title: 'Our own title', severity: 'sev3', affected: [], labels: ['night'] });
  assert.equal(merged.title, 'Our own title');
  assert.equal(merged.severity, 'sev3');
  assert.deepEqual(merged.affected, []);
  assert.deepEqual(merged.labels, ['db', 'night']);
  assert.equal(merged.summary, tpl.summary);
});

test('a blank title falls back to the template; an empty template changes nothing', () => {
  assert.equal(applyTemplate(tpl, { title: '' }).title, 'Database failover in progress');
  const empty = createTemplate({ name: 'Blank' }, { id: 'tpl_2', now: '2026-06-03T10:00:00.000Z' });
  assert.deepEqual(applyTemplate(empty, { title: 't', severity: 'sev4' }), { title: 't', severity: 'sev4' });
});

test('template validation', () => {
  assert.equal(validateTemplateInput({}).errors[0].field, 'name');
  assert.deepEqual(validateTemplateInput({ severity: 'sev2' }, { partial: true }).value, { severity: 'sev2' });
  assert.deepEqual(validateTemplateInput({ name: 'x', severity: null }).value.severity, null);
  const bad = validateTemplateInput({ name: 'x', severity: 'sev0', labels: ['Bad Label'], affected: [{ serviceId: 'a' }] });
  assert.deepEqual(bad.errors.map((e) => e.field).sort(), ['affected[0]', 'labels', 'severity']);
});

test('opening an incident from a template over HTTP', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  await srv.api('POST', '/api/services', { name: 'Checkout' });
  const created = await srv.api('POST', '/api/templates', {
    name: 'Payments outage',
    title: 'Payments failing',
    severity: 'sev1',
    labels: ['payments'],
    affected: [{ serviceId: 'checkout', impact: 'major_outage' }],
  });
  assert.equal(created.status, 201);
  const templateId = created.json.template.id;

  const incident = (await srv.api('POST', '/api/incidents', { templateId, summary: 'Started 10:02 UTC', labels: ['night'] })).json.incident;
  assert.equal(incident.title, 'Payments failing');
  assert.equal(incident.severity, 'sev1');
  assert.deepEqual(incident.labels, ['payments', 'night']);
  assert.equal(incident.affected[0].serviceId, 'checkout');
  assert.equal(incident.updates[0].message, 'Started 10:02 UTC');

  const bad = await srv.api('POST', '/api/incidents', { templateId: 'tpl_nope' });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.error.details[0].field, 'templateId');
});

test('template admin: patch, delete, roles', async (t) => {
  const srv = await startTestServer();
  t.after(() => srv.close());
  const { template } = (await srv.api('POST', '/api/templates', { name: 'A', severity: 'sev2' })).json;
  const patched = await srv.api('PATCH', `/api/templates/${template.id}`, { severity: null, title: 'New' });
  assert.equal(patched.json.template.severity, null);
  assert.equal(patched.json.template.title, 'New');
  assert.equal((await srv.api('PATCH', '/api/templates/tpl_nope', {})).status, 404);

  const responder = await srv.as('responder');
  assert.equal((await responder('GET', '/api/templates')).status, 200);
  assert.equal((await responder('POST', '/api/templates', { name: 'B' })).status, 403);
  assert.equal((await srv.api('DELETE', `/api/templates/${template.id}`)).status, 204);
  assert.equal((await srv.api('GET', '/api/templates')).json.templates.length, 0);
});
