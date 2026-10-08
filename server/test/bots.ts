import { WebSocket } from 'ws';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchServer } from '../src/launch.js';
import type { ServerMessage, ClientMessage } from '@shared/protocol.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Bot {
  ws: WebSocket;
  name: string;
  messages: ServerMessage[];
  ready: Promise<void>;
}

async function connectBot(
  port: number,
  name: string,
  account: string,
  password: string,
  mode: 'register' | 'login' = 'register',
): Promise<Bot> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const messages: ServerMessage[] = [];
  let readyResolve: () => void = () => {};
  const ready = new Promise<void>((r) => (readyResolve = r));

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as ServerMessage;
    messages.push(msg);
    if (msg.t === 'enter') readyResolve();
  });

  await new Promise((r) => ws.on('open', r));
  if (mode === 'register') {
    ws.send(JSON.stringify({ t: 'register', account, password, characterName: name, archetype: 'vanguard' } satisfies ClientMessage));
  } else {
    ws.send(JSON.stringify({ t: 'login', account, password } satisfies ClientMessage));
  }
  await sleep(500);
  ws.send(JSON.stringify({ t: 'enter_world' } satisfies ClientMessage));
  const bot: Bot = { ws, name, messages, ready };
  return bot;
}

function send(bot: Bot, msg: ClientMessage) {
  bot.ws.send(JSON.stringify(msg));
}

function last<T extends ServerMessage['t']>(bot: Bot, type: T): Extract<ServerMessage, { t: T }> | undefined {
  for (let i = bot.messages.length - 1; i >= 0; i--) {
    const m = bot.messages[i];
    if (m.t === type) return m as Extract<ServerMessage, { t: T }>;
  }
  return undefined;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'wftest-'));
  const launched = await launchServer({ port: 0, dataDir: dir, host: '127.0.0.1' });

  // Find the real port (0 means ephemeral)
  const actualPort = (launched.http.address() as { port: number }).port;

  const waitEnter = async (bot: Bot) => {
    let settled = false;
    bot.ready.then(() => (settled = true));
    for (let i = 0; i < 40 && !settled; i++) await sleep(200);
    if (!settled) {
      console.log(`[debug] ${bot.name} messages:`, bot.messages.map((m) => m.t));
      throw new Error(`timeout entering world for ${bot.name}`);
    }
  };
  const alice = await connectBot(actualPort, 'Alice', 'alice', 'password1');
  await waitEnter(alice);
  const bob = await connectBot(actualPort, 'Bob', 'bob', 'password123');
  await waitEnter(bob);

  let ok = true;
  const check = (cond: boolean, label: string) => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`);
    if (!cond) ok = false;
  };

  // Both players in world
  check(alice.messages.some((m) => m.t === 'enter'), 'alice entered world');
  check(bob.messages.some((m) => m.t === 'enter'), 'bob entered world');

  // Alice moves
  send(alice, { t: 'move', seq: 1, mx: 0, mz: -1, heading: 0 });
  await sleep(800);
  const snapAlice = last(alice, 'snapshot');
  check(snapAlice !== undefined, 'alice received snapshot');

  // Alice finds the training dummy, walks up to it, and attacks until it dies.
  let targetId: number | null = null;
  let moved = false;
  for (let i = 0; i < 80; i++) {
    await sleep(200);
    const snap = last(alice, 'snapshot');
    if (!snap) continue;
    const dummy = snap.entities.find((e) => e.kind === 'enemy' && (e as { defId?: string }).defId === 'training_dummy');
    if (!dummy) {
      if (!targetId) send(alice, { t: 'move_to', seq: i + 2, x: 4, z: -4 });
      continue;
    }
    targetId = dummy.id;
    if (!moved) {
      send(alice, { t: 'move_to', seq: i + 2, x: dummy.x, z: dummy.z });
      moved = true;
      await sleep(1200);
      continue;
    }
    send(alice, { t: 'attack', seq: i + 2, targetId: dummy.id });
    if (i % 4 === 0) send(alice, { t: 'dodge', seq: i + 1000 });
  }
  check(targetId !== null, 'found training dummy to attack');

  // Did combat damage happen? (a swing always emits a combat event)
  const combatMsgs = alice.messages.filter((m) => m.t === 'combat');
  check(combatMsgs.length > 0, 'combat events received');

  // Pickup nearest ground item, if any dropped.
  const snap = last(alice, 'snapshot');
  if (snap) {
    const g = snap.entities.find((e) => e.kind === 'ground');
    if (g) {
      send(alice, { t: 'move_to', seq: 100, x: g.x, z: g.z });
      await sleep(700);
      send(alice, { t: 'pickup_ground', groundId: g.id });
      await sleep(700);
      check(last(alice, 'inventory') !== undefined, 'pickup sent inventory update');
    }
  }

  // Alice chats world-wide; Bob should receive it
  send(alice, { t: 'chat', channel: 'world', text: 'Hello from Alice!' });
  await sleep(400);
  check(bob.messages.some((m) => m.t === 'chat' && m.text === 'Hello from Alice!'), 'world chat reaches bob');

  // Quest: accept first steps (no distance requirement server-side)
  send(alice, { t: 'accept_quest', questId: 'first_steps' });
  await sleep(300);
  const qUpdate = last(alice, 'quest_update');
  check(qUpdate !== undefined && qUpdate.quests.some((q) => q.questId === 'first_steps'), 'quest accepted');

  // Persistence: disconnect and reconnect
  alice.ws.close();
  await sleep(1200);
  const alice2 = await connectBot(actualPort, 'Alice', 'alice', 'password1', 'login');
  await waitEnter(alice2);
  const enter2 = alice2.messages.find((m) => m.t === 'enter') as Extract<ServerMessage, { t: 'enter' }> | undefined;
  check(
    enter2 !== undefined && enter2.player.quests.some((q) => q.questId === 'first_steps'),
    'player data persisted across relog',
  );

  bob.ws.close();
  await sleep(200);
  await launched.close();
  await sleep(500);
  rmSync(dir, { recursive: true, force: true });

  console.log(ok ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});