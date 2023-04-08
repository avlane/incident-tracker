import { createJsonStore } from './json-store.js';

// Opens the store described by the config. This is async so that backends
// which need to be loaded lazily can be added without changing callers.
export async function openStore(config = {}) {
  return createJsonStore({ path: config.dataFile ?? null });
}
