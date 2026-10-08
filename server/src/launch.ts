import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GameServer } from './gameServer.js';
import { FileStorageAdapter } from './persistence.js';
import { mkdirSync } from 'node:fs';

export interface LaunchResult {
  game: GameServer;
  http: Server;
  wss: WebSocketServer;
  port: number;
  close(): Promise<void>;
}

export async function launchServer(options: { port?: number; dataDir: string; host?: string }): Promise<LaunchResult> {
  const port = options.port ?? Number(process.env.PORT ?? 8081);
  const host = options.host ?? '0.0.0.0';
  mkdirSync(options.dataDir, { recursive: true });
  const storage = new FileStorageAdapter(options.dataDir);
  await storage.init();
  const game = new GameServer(storage);
  await game.start();

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, players: game.getPlayerCount(), uptime: process.uptime() }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (ws) => {
    (ws as unknown as { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => {
      (ws as unknown as { isAlive?: boolean }).isAlive = true;
    });
    game.addSession(ws);
    ws.on('message', (data) => {
      game.queueMessage(ws, data.toString());
    });
    ws.on('close', () => game.removeSession(ws));
    ws.on('error', () => game.removeSession(ws));
  });

  return new Promise<LaunchResult>((resolve) => {
    http.listen(port, host, () => {
      console.log(`[test-server] listening on ${host}:${port}`);
      resolve({
        game,
        http,
        wss,
        port,
        close: async () => {
          game.stop();
          for (const c of wss.clients) c.close();
          wss.close();
          http.close();
        },
      });
    });
  });
}

export type { WebSocket };