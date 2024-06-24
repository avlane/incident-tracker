export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '127.0.0.1',
    trustProxy: env.TRUST_PROXY === '1',
    allowPrivateWebhooks: env.ALLOW_PRIVATE_WEBHOOKS === '1',
    dataFile: env.DATA_FILE ?? 'data/incidents.json',
  };
}
