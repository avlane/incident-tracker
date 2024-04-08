import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openStore } from './store/index.js';

const config = loadConfig();
const store = await openStore(config);
const app = createApp({ store, trustProxy: config.trustProxy });
const server = createServer((req, res) => app.handle(req, res));

server.listen(config.port, config.host, () => {
  console.log(`incident-tracker listening on http://${config.host}:${config.port}`);
});
