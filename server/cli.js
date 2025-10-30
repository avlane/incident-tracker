import { existsSync } from 'node:fs';
import { createAuthService } from './auth.js';
import { runCommand } from './commands.js';
import { loadConfig } from './config.js';
import { openStore } from './store/index.js';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const argv = process.argv.slice(2);
const config = loadConfig();

// migrate-store opens its own source and target, so it doesn't open the
// configured store (which would create an empty one as a side effect).
const store = argv[0] === 'migrate-store' ? null : await openStore(config);
const auth = store ? createAuthService({ store, clock: () => new Date().toISOString() }) : null;

try {
  process.exitCode = await runCommand(argv, {
    auth,
    store,
    readStdin,
    env: process.env,
    out: (line) => console.log(line),
    openJson: (path) => {
      if (!existsSync(path)) throw new Error(`${path} does not exist`);
      return openStore({ dataFile: path });
    },
    openSqlite: (path) => openStore({ store: 'sqlite', dbFile: path }),
  });
} catch (err) {
  console.error(err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message);
  process.exitCode = 1;
} finally {
  store?.close();
}
