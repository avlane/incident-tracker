const STORES = ['json', 'sqlite'];

// Reads settings from environment variables and refuses nonsense early, so a
// typo in STORE fails at startup instead of silently using the wrong database.
export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer from 0 to 65535, got "${env.PORT}"`);
  }
  const store = env.STORE ?? 'json';
  if (!STORES.includes(store)) {
    throw new Error(`STORE must be one of ${STORES.join(', ')}, got "${store}"`);
  }
  return {
    port,
    host: env.HOST ?? '127.0.0.1',
    trustProxy: env.TRUST_PROXY === '1',
    allowPrivateWebhooks: env.ALLOW_PRIVATE_WEBHOOKS === '1',
    publicUrl: env.PUBLIC_URL ?? `http://localhost:${port}`,
    staticDir: env.STATIC_DIR ?? 'client/dist',
    store,
    dbFile: env.DB_FILE ?? 'data/incidents.db',
    busyTimeoutMs: Number(env.DB_BUSY_TIMEOUT_MS ?? 5000),
    dataFile: env.DATA_FILE ?? 'data/incidents.json',
  };
}
