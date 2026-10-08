import { join } from 'node:path';
import { launchServer } from './launch.js';

const PORT = Number(process.env.PORT ?? 8081);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'server', 'data');

async function main() {
  const launched = await launchServer({ port: PORT, host: HOST, dataDir: DATA_DIR });
  console.log(`[server] WAYFARE.ONLINE listening on http://${HOST}:${PORT} (ws: /ws)`);
  console.log(`[server] data directory: ${DATA_DIR}`);

  const shutdown = () => {
    console.log('\n[server] shutting down...');
    void launched.close();
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
