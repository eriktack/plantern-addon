// node tools/serve.js [port] [location]   (run.cmd does this). Serves the repo and accepts saves to
// locations/, and prints the addresses to open on this computer and on a phone.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlanternServer } from './server.js';
import { startupLines } from './net.js';
import { stampConsole, wantsTimestamps } from './log.js';

if (wantsTimestamps()) stampConsole();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 3000);
const loc = process.argv[3] || '';          // only for the printed links; the pages remember the last house
const server = createPlanternServer(root);

server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use (another server running?). Close it or run: node tools/serve.js <other port>` : e.message);
  process.exit(1);
});
server.listen(port, '0.0.0.0', () => {
  for (const line of startupLines({ port, root, hostname: os.hostname(), interfaces: os.networkInterfaces(), loc })) console.log(line);
});
