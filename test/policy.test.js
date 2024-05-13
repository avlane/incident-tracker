import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredRole } from '../server/policy.js';

test('public routes', () => {
  assert.equal(requiredRole('GET', '/api/status'), 'public');
  assert.equal(requiredRole('POST', '/api/auth/login'), 'public');
  assert.equal(requiredRole('POST', '/api/auth/logout'), 'public');
});

test('reading needs a signed-in user', () => {
  assert.equal(requiredRole('GET', '/api/incidents'), 'viewer');
  assert.equal(requiredRole('GET', '/api/incidents/INC-0001/postmortem'), 'viewer');
  assert.equal(requiredRole('GET', '/api/export/incidents.csv'), 'viewer');
});

test('responders handle incidents, admins handle everything else that writes', () => {
  assert.equal(requiredRole('POST', '/api/incidents'), 'responder');
  assert.equal(requiredRole('POST', '/api/incidents/INC-0001/updates'), 'responder');
  assert.equal(requiredRole('POST', '/api/oncall/primary/overrides'), 'responder');
  assert.equal(requiredRole('POST', '/api/services'), 'admin');
  assert.equal(requiredRole('PATCH', '/api/services/checkout'), 'admin');
  assert.equal(requiredRole('DELETE', '/api/oncall/primary'), 'admin');
  assert.equal(requiredRole('POST', '/api/oncall'), 'admin');
});

test('unknown writes default to admin', () => {
  assert.equal(requiredRole('PUT', '/api/whatever'), 'admin');
  assert.equal(requiredRole('POST', '/api/incidents/INC-0001/purge'), 'admin');
});

test('the audit log is admin-only even to read', () => {
  assert.equal(requiredRole('GET', '/api/audit'), 'admin');
  assert.equal(requiredRole('GET', '/api/audit/'), 'admin');
  assert.equal(requiredRole('GET', '/api/auditing-notes'), 'viewer');
});
