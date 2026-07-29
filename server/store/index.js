import { createJsonStore } from './json-store.js';

// Opens the store described by the config. This is async because the SQLite
// backend loads node:sqlite lazily, so the JSON backend keeps working on Node
// versions that don't have it.
export async function openStore(config = {}) {
  if (config.store === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const { createSqliteStore } = await import('./sqlite-store.js');
    return createSqliteStore({ DatabaseSync, path: config.dbFile ?? 'data/incidents.db', busyTimeoutMs: config.busyTimeoutMs });
  }
  return createJsonStore({ path: config.dataFile ?? null });
}
