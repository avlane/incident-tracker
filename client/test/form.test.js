import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyIncidentForm, fieldErrorsFromApi, toIncidentPayload, validateIncidentForm } from '../src/lib/form.js';
import { filtersReducer, initialFilters, isFiltering } from '../src/lib/filters.js';
import { hrefFor, parseHash } from '../src/lib/route.js';

test('an empty form fails validation on the title only', () => {
  assert.deepEqual(Object.keys(validateIncidentForm(emptyIncidentForm())), ['title']);
});

test('payload drops blanks and marks services degraded', () => {
  const payload = toIncidentPayload({
    title: ' DB slow ',
    summary: '',
    severity: 'sev2',
    commander: ' ',
    serviceIds: ['checkout'],
  });
  assert.deepEqual(payload, {
    title: 'DB slow',
    severity: 'sev2',
    affected: [{ serviceId: 'checkout', impact: 'degraded' }],
  });
});

test('API field errors map onto form fields', () => {
  assert.deepEqual(
    fieldErrorsFromApi([
      { field: 'title', message: 'title is required' },
      { field: 'affected[0]', message: 'unknown service x' },
      { field: 'affected[1]', message: 'second' },
    ]),
    { title: 'title is required', affected: 'unknown service x' },
  );
});

test('filtersReducer toggles list values and resets', () => {
  let state = filtersReducer(initialFilters, { type: 'toggle', field: 'severity', value: 'sev1' });
  state = filtersReducer(state, { type: 'toggle', field: 'severity', value: 'sev2' });
  state = filtersReducer(state, { type: 'toggle', field: 'severity', value: 'sev1' });
  assert.deepEqual(state.severity, ['sev2']);
  assert.equal(isFiltering(state), true);
  assert.equal(isFiltering(filtersReducer(state, { type: 'reset' })), false);
  assert.equal(initialFilters.severity.length, 0);
});

test('routes round-trip', () => {
  assert.deepEqual(parseHash(''), { name: 'list' });
  assert.deepEqual(parseHash('#/'), { name: 'list' });
  assert.deepEqual(parseHash('#/incidents/INC-0003'), { name: 'incident', id: 'INC-0003' });
  assert.deepEqual(parseHash('#/wat'), { name: 'not-found' });
  assert.equal(hrefFor({ name: 'incident', id: 'INC-0003' }), '#/incidents/INC-0003');
  assert.equal(hrefFor({ name: 'list' }), '#/');
});

test('an in-page anchor like #main is not mistaken for a route', () => {
  // Navigating to "#main" lands on the not-found page, which is why the skip
  // link moves focus with a click handler instead of linking to it.
  assert.deepEqual(parseHash('#main'), { name: 'not-found' });
});
