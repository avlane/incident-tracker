import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplateToForm, templateById } from '../src/lib/templates.js';
import { emptyIncidentForm, toIncidentPayload } from '../src/lib/form.js';

const tpl = {
  id: 'tpl_1',
  title: 'Payments failing',
  summary: 'Card payments return errors.',
  severity: 'sev1',
  affected: [{ serviceId: 'checkout', impact: 'major_outage' }, { serviceId: 'checkout', componentId: 'api', impact: 'major_outage' }],
};

test('an empty form takes everything from the template', () => {
  const form = applyTemplateToForm(emptyIncidentForm(), tpl);
  assert.equal(form.title, 'Payments failing');
  assert.equal(form.severity, 'sev1');
  assert.deepEqual(form.serviceIds, ['checkout']);
  assert.equal(form.templateId, 'tpl_1');
});

test('typed text and a chosen severity are kept', () => {
  const typed = { ...emptyIncidentForm(), title: 'My title', summary: 'My words', severity: 'sev2', serviceIds: ['search'] };
  const form = applyTemplateToForm(typed, tpl);
  assert.equal(form.title, 'My title');
  assert.equal(form.summary, 'My words');
  assert.equal(form.severity, 'sev2');
  assert.deepEqual(form.serviceIds, ['search']);
});

test('no template changes nothing; lookups by id', () => {
  const form = emptyIncidentForm();
  assert.equal(applyTemplateToForm(form, null), form);
  assert.equal(templateById([tpl], 'tpl_1'), tpl);
  assert.equal(templateById([tpl], 'nope'), null);
});

test('the payload carries the template id so the server can merge the rest', () => {
  const form = applyTemplateToForm(emptyIncidentForm(), tpl);
  const payload = toIncidentPayload(form);
  assert.equal(payload.templateId, 'tpl_1');
  assert.equal(payload.title, 'Payments failing');
});
