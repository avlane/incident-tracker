// Graceful shutdown: stop accepting connections, let in-flight requests and
// webhook deliveries finish (up to a deadline), close the store, then exit.
// Everything it touches is passed in, so tests can drive it without signals.
export function createShutdown({ server, app, store, logger = console, timeoutMs = 10_000, exit = (code) => process.exit(code) }) {
  let started = false;

  return async function shutdown(reason) {
    if (started) return; // a second signal while we are already stopping
    started = true;
    logger.info(`shutting down (${reason})`);

    const deadline = new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), timeoutMs);
      timer.unref();
    });
    const drained = (async () => {
      await new Promise((resolve) => server.close(resolve));
      await app.idle();
      return 'drained';
    })();

    const outcome = await Promise.race([drained, deadline]);
    if (outcome === 'timeout') logger.warn(`gave up waiting after ${timeoutMs}ms; closing anyway`);
    try {
      app.close();
      store.close();
    } catch (err) {
      logger.error(err);
      exit(1);
      return;
    }
    exit(outcome === 'drained' ? 0 : 1);
  };
}
