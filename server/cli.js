import { createAuthService } from './auth.js';
import { runCommand } from './commands.js';
import { loadConfig } from './config.js';
import { openStore } from './store/index.js';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const config = loadConfig();
const store = await openStore(config);
const auth = createAuthService({ store, clock: () => new Date().toISOString() });

try {
  process.exitCode = await runCommand(process.argv.slice(2), {
    auth,
    readStdin,
    env: process.env,
    out: (line) => console.log(line),
  });
} catch (err) {
  console.error(err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message);
  process.exitCode = 1;
} finally {
  store.close();
}
