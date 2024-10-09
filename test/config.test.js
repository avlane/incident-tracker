import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';

test('defaults', () => {
  assert.deepEqual(loadConfig({}), {
    port: 3000,
    host: '127.0.0.1',
    trustProxy: false,
    allowPrivateWebhooks: false,
    staticDir: 'client/dist',
    store: 'json',
    dbFile: 'data/incidents.db',
    dataFile: 'data/incidents.json',
  });
});

test('environment overrides', () => {
  const config = loadConfig({
    PORT: '8080',
    HOST: '0.0.0.0',
    TRUST_PROXY: '1',
    ALLOW_PRIVATE_WEBHOOKS: '1',
    STORE: 'sqlite',
    DB_FILE: '/var/lib/it/db.sqlite',
  });
  assert.equal(config.port, 8080);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.trustProxy, true);
  assert.equal(config.allowPrivateWebhooks, true);
  assert.equal(config.store, 'sqlite');
  assert.equal(config.dbFile, '/var/lib/it/db.sqlite');
});

test('bad values fail loudly', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT must be/);
  assert.throws(() => loadConfig({ PORT: '70000' }), /PORT must be/);
  assert.throws(() => loadConfig({ STORE: 'postgres' }), /STORE must be one of json, sqlite/);
  assert.equal(loadConfig({ TRUST_PROXY: 'yes' }).trustProxy, false);
});
