import { WebSocket } from 'ws';
import { Simulation, type SimHooks } from '@shared/sim/simulation.js';
import { serializePlayer } from '@shared/sim/serialize.js';
import { addItemToInventory, computeStats } from '@shared/sim/stats.js';
import { ENEMIES } from '@shared/content/enemies.js';
import { NPCS } from '@shared/content/npcs.js';
import { ITEMS } from '@shared/content/items.js';
import { RECIPES } from '@shared/content/recipes.js';
import { QUESTS } from '@shared/content/quests.js';
import { ABILITIES, ARCHETYPES } from '@shared/content/abilities.js';
import { INTEREST_RADIUS, SNAPSHOT_RATE, STARTING_ZONE, TICK_DT, TICK_RATE } from '@shared/constants.js';
import type {
  CharacterSummary,
  ClientMessage,
  CombatEvent,
  EnemySnapshot,
  PlayerSnapshot,
  ServerMessage,
  SimEvent,
  SnapshotEntity,
} from '@shared/protocol.js';
import { PROTOCOL_VERSION } from '@shared/protocol.js';
import type { ArchetypeId, EnemyRuntime, EntityId, PlayerAppearance, PlayerState, ZoneId } from '@shared/types.js';
import type { FileStorageAdapter } from './persistence.js';
import { characterIdFor, hashPassword, verifyPassword, type CharacterRecord } from './persistence.js';

interface Session {
  ws: WebSocket;
  account: string | null;
  characterId: string | null;
  playerId: EntityId | null;
  player: PlayerState | null;
  lastSnapshot: Map<EntityId, SnapshotEntity>;
  authenticated: boolean;
  muted: boolean;
  lastPong: number;
  ping: number;
  chatTimes: number[];
  knownEntities: Set<number>;
  chain: Promise<void>;
}

let nextPlayerId = 1;

export class GameServer {
  sim: Simulation;
  storage: FileStorageAdapter;
  sessions = new Set<Session>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private accumulator = 0;
  private lastTick = Date.now();
  private chatCounter = 0;

  constructor(storage: FileStorageAdapter) {
    this.storage = storage;
    this.sim = new Simulation(this.makeHooks());
  }

  async start() {
    const world = await this.storage.loadWorld();
    this.sim.setFlags(world.flags as Record<string, number | string | boolean>);
    this.sim.setWorldEvents(world.events);
    // ensure worlds exist for spawn
    for (const zone of ['elaris', 'greenreach', 'hollow']) this.sim.getWorld(zone);
    this.tickTimer = setInterval(() => this.tick(), 1000 / TICK_RATE);
    this.snapshotTimer = setInterval(() => this.broadcastSnapshots(), 1000 / SNAPSHOT_RATE);
    this.saveTimer = setInterval(() => this.persistAll(), 30_000);
    console.log(`[server] simulation started (${TICK_RATE} tick, ${SNAPSHOT_RATE} snapshots/sec)`);
  }

  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
  }

  // --------------------------------------------------------------- hooks

  private makeHooks(): SimHooks {
    return {
      emitCombat: (playerId, event) => this.sendCombat(playerId, event),
      emitZone: (playerId, event) => this.sendToPlayer(playerId, { t: 'world_event', id: '', type: event.kind, data: event.data as Record<string, unknown>, at: Date.now() }),
      onInventoryChanged: (player) => {
        this.sendToPlayer(player.id, {
          t: 'inventory',
          inventory: player.inventory,
          equipment: player.equipment,
          gold: player.progress.gold,
        });
      },
      onProgress: (player) => {
        this.sendToPlayer(player.id, {
          t: 'progress',
          xp: player.progress.xp,
          level: player.progress.level,
          skillXp: player.progress.skillXp,
          skillLevels: player.progress.skillLevels,
          gold: player.progress.gold,
        });
        player.dirty = true;
      },
      onQuestUpdate: (player, accepted, turnedIn) => {
        this.sendToPlayer(player.id, { t: 'quest_update', quests: player.quests, accepted, turnedIn });
      },
      onGatheringResult: (player, nodeId, success, items, xp) => {
        this.sendToPlayer(player.id, { t: 'gathering_result', nodeId, success, items, xp });
      },
      onCraftResult: (player, success, recipeId, items, xp) => {
        this.sendToPlayer(player.id, { t: 'craft_result', success, recipeId, items, xp });
      },
      onDeath: (player, respawnIn, xpLost) => {
        this.sendToPlayer(player.id, { t: 'death', respawnIn, xpLost });
      },
      onRespawn: (player) => {
        this.sendToPlayer(player.id, { t: 'respawned', you: serializePlayer(player) });
      },
      onWorldEvent: (id, type, data, at) => {
        this.broadcast({ t: 'world_event', id, type, data, at });
        void this.persistWorld().catch((err) => console.error('[server] persist world failed:', err));
      },
      onDialogue: (player, npcId, dialogueId) => {
        const npc = NPCS[npcId];
        if (!npc) return;
        const node = npc.dialogue.find((d) => d.id === dialogueId) ?? npc.dialogue[0];
        this.sendToPlayer(player.id, {
          t: 'npc_dialogue',
          npcId,
          npc,
          dialogueId: node.id,
          text: node.text,
          options: node.options.map((o) => ({ text: o.text, next: o.next, action: o.action ? JSON.stringify(o.action) : undefined })),
        });
      },
      onChat: (player, channel, text) => {
        this.handleChat(player, channel, text);
      },
      onGroundLoot: (player) => {
        const world = this.sim.getWorld(player.zoneId);
        this.sendToPlayer(player.id, { t: 'loot', ground: world.ground });
      },
      onAbilityUnlocked: (player, ability) => {
        this.sendToPlayer(player.id, { t: 'ability_unlocked', ability });
      },
    };
  }

  // --------------------------------------------------------------- tick

  private tick() {
    const now = Date.now();
    let frame = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (frame > 0.25) frame = 0.25;
    this.accumulator += frame;
    while (this.accumulator >= TICK_DT) {
      this.sim.tick(TICK_DT);
      this.tickCount++;
      this.accumulator -= TICK_DT;
      for (const s of this.sessions) {
        if (s.player && s.playerId !== null) {
          s.player.lastProcessedSeq = s.player.inputSeq;
          s.player.ping = s.ping;
        }
      }
    }
  }

  // --------------------------------------------------------------- snapshots

  private broadcastSnapshots() {
    const dayTime = this.sim.dayTime();
    const now = Date.now();
    for (const session of this.sessions) {
      if (!session.player || session.playerId === null) continue;
      const player = session.player;
      if (player.zoneId !== session.player.zoneId) session.player.zoneId = player.zoneId;
      const zoneId = player.zoneId;
      const world = this.sim.getWorld(zoneId);
      const entities: SnapshotEntity[] = [];
      const currentIds = new Set<number>();

      // players
      for (const other of this.sim.playersInZone(zoneId)) {
        if (other.id === player.id) continue;
        const d = Math.hypot(other.x - player.x, other.z - player.z);
        if (d > INTEREST_RADIUS) continue;
        currentIds.add(other.id);
        entities.push(this.playerSnapshot(other));
      }
      // enemies
      for (const enemy of world.enemies.values()) {
        if (enemy.dead) continue;
        const d = Math.hypot(enemy.x - player.x, enemy.z - player.z);
        if (d > INTEREST_RADIUS) continue;
        currentIds.add(enemy.id);
        entities.push(this.enemySnapshot(enemy));
      }
      // npcs
      for (const n of world.def.npcs) {
        const def = NPCS[n.npcId];
        if (!def) continue;
        const pos = world.npcPositions.get(def.id) ?? { x: def.x, z: def.z };
        const id = npcEntityId(def.id);
        const d = Math.hypot(pos.x - player.x, pos.z - player.z);
        if (d > INTEREST_RADIUS) continue;
        currentIds.add(id);
        entities.push({ id, kind: 'npc', x: pos.x, y: 0, z: pos.z, h: 0, state: def.role });
      }
      // nodes
      for (const node of world.nodes) {
        const d = Math.hypot(node.x - player.x, node.z - player.z);
        if (d > INTEREST_RADIUS) continue;
        const id = nodeEntityId(world.id, node.id);
        currentIds.add(id);
        entities.push({ id, kind: 'node', x: node.x, y: 0, z: node.z, h: 0, state: node.defId });
      }
      // ground
      for (const g of world.ground) {
        const d = Math.hypot(g.x - player.x, g.z - player.z);
        if (d > INTEREST_RADIUS) continue;
        currentIds.add(g.id);
        entities.push({ id: g.id, kind: 'ground', x: g.x, y: 0.4, z: g.z, h: 0, state: g.gold > 0 ? 'gold' : 'item' });
      }
      // portals
      for (const p of world.def.portals) {
        const id = portalEntityId(world.id, p.id);
        currentIds.add(id);
        entities.push({ id, kind: 'portal', x: p.x, y: 0, z: p.z, h: 0, state: p.label });
      }

      const removed: number[] = [];
      for (const id of session.knownEntities) {
        if (!currentIds.has(id)) removed.push(id);
      }
      session.knownEntities = currentIds;

      const msg: ServerMessage = {
        t: 'snapshot',
        tick: this.tickCount,
        time: now,
        you: serializePlayer(player),
        entities,
        removed,
        dayTime,
        events: [],
      };
      this.sendRaw(session, msg);
    }
  }

  private playerSnapshot(p: PlayerState): PlayerSnapshot {
    return {
      id: p.id,
      kind: 'player',
      x: round(p.x),
      y: 0,
      z: round(p.z),
      h: round(p.heading, 2),
      name: p.name,
      level: p.progress.level,
      archetype: p.progress.archetype,
      moving: p.moving,
      health: Math.round(p.combat.health),
      maxHealth: Math.round(p.combat.maxHealth),
      mana: Math.round(p.combat.mana),
      stamina: Math.round(p.combat.stamina),
      momentum: Math.round(p.combat.momentum.points),
      pvp: p.pvpEnabled,
      colors: p.appearance,
      statuses: p.combat.statuses.map((s) => ({ id: s.id, remaining: s.remaining })),
      state: p.combat.health <= 0 ? 'dead' : 'alive',
    };
  }

  private enemySnapshot(e: EnemyRuntime): EnemySnapshot {
    const def = ENEMIES[e.defId];
    return {
      id: e.id,
      kind: 'enemy',
      x: round(e.x),
      y: round(e.y),
      z: round(e.z),
      h: round(e.heading, 2),
      defId: e.defId,
      name: def?.name ?? e.defId,
      level: e.level,
      health: Math.round(e.health),
      maxHealth: Math.round(e.maxHealth),
      state: e.state,
      elite: def?.elite,
      boss: def?.boss,
      anim: e.animation,
      flash: e.hitFlashUntil > Date.now(),
    };
  }

  // --------------------------------------------------------------- messaging

  private sendRaw(session: Session, msg: ServerMessage) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(msg));
    }
  }

  sendToPlayer(playerId: EntityId, msg: ServerMessage) {
    for (const s of this.sessions) {
      if (s.playerId === playerId) this.sendRaw(s, msg);
    }
  }

  broadcast(msg: ServerMessage, exceptAccount?: string) {
    for (const s of this.sessions) {
      if (exceptAccount && s.account === exceptAccount) continue;
      this.sendRaw(s, msg);
    }
  }

  private sendCombat(playerId: EntityId, event: CombatEvent) {
    this.sendToPlayer(playerId, { t: 'combat', events: [event] });
  }

  private handleChat(player: PlayerState, channel: string, text: string) {
    const id = ++this.chatCounter;
    const payload: ServerMessage = {
      t: 'chat',
      id,
      channel: channel as never,
      from: player.name,
      text,
      at: Date.now(),
    };
    if (channel === 'world') {
      this.broadcast(payload);
    } else if (channel === 'local') {
      for (const s of this.sessions) {
        if (s.player && s.player.zoneId === player.zoneId) this.sendRaw(s, payload);
      }
    } else if (channel === 'party' || channel === 'guild') {
      for (const s of this.sessions) {
        if (s.player && s.player.partyId && s.player.partyId === player.partyId) this.sendRaw(s, payload);
      }
    } else {
      this.sendToPlayer(player.id, payload);
    }
  }

  // --------------------------------------------------------------- connection handling

  addSession(ws: WebSocket) {
    const session: Session = {
      ws,
      account: null,
      characterId: null,
      playerId: null,
      player: null,
      lastSnapshot: new Map(),
      authenticated: false,
      muted: false,
      lastPong: Date.now(),
      ping: 0,
      chatTimes: [],
      knownEntities: new Set(),
      chain: Promise.resolve(),
    };
    this.sessions.add(session);
    this.sendRaw(session, { t: 'welcome', protocol: PROTOCOL_VERSION, serverTime: Date.now(), characters: [] });
  }

  /** Serialize per-session message processing so async auth/enter cannot race. */
  queueMessage(ws: WebSocket, raw: string) {
    for (const s of this.sessions) {
      if (s.ws !== ws) continue;
      s.chain = s.chain.then(() => this.handleMessage(ws, raw)).catch((err) => console.error('[server] msg error:', err));
      return;
    }
  }

  removeSession(ws: WebSocket) {
    for (const s of this.sessions) {
      if (s.ws !== ws) continue;
      if (s.player) {
        void this.persistCharacter(s).catch((err) => console.error('[server] persist on disconnect failed:', err));
        this.sim.removePlayer(s.player.id);
        this.broadcast({ t: 'player_left', name: s.player.name });
      }
      this.sessions.delete(s);
      break;
    }
  }

  async handleMessage(ws: WebSocket, raw: string) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    const session = this.findSession(ws);
    if (!session) return;
    switch (msg.t) {
      case 'login':
        await this.handleLogin(session, msg.account, msg.password, false);
        break;
      case 'register':
        await this.handleLogin(session, msg.account, msg.password, true, msg.characterName, msg.archetype);
        break;
      case 'enter_world':
        await this.handleEnterWorld(session);
        break;
      case 'create_character':
        await this.handleCreateCharacter(session, msg.name, msg.archetype, msg.appearance);
        break;
      case 'ping':
        session.ping = 0;
        this.sendRaw(session, { t: 'pong', id: msg.id, serverTime: Date.now() });
        break;
      default:
        if (!session.player) return;
        this.sim.handleMessage(session.player, msg);
        break;
    }
  }

  private findSession(ws: WebSocket): Session | undefined {
    for (const s of this.sessions) if (s.ws === ws) return s;
    return undefined;
  }

  private async handleLogin(session: Session, account: string, password: string, register: boolean, characterName?: string, archetype?: ArchetypeId) {
    if (!account || account.length < 3 || account.length > 24) {
      this.sendRaw(session, { t: 'error', code: 'bad_account', message: 'Account name must be 3-24 characters.' });
      return;
    }
    if (!password || password.length < 3) {
      this.sendRaw(session, { t: 'error', code: 'bad_password', message: 'Password must be at least 3 characters.' });
      return;
    }
    let record = await this.storage.getAccount(account);
    if (register) {
      if (record) {
        this.sendRaw(session, { t: 'error', code: 'account_exists', message: 'That account already exists.' });
        return;
      }
      const { hash, salt } = hashPassword(password);
      record = { account, passwordHash: hash, salt, createdAt: Date.now(), lastLogin: Date.now() };
      await this.storage.saveAccount(record);
    } else {
      if (!record || !verifyPassword(password, record)) {
        this.sendRaw(session, { t: 'error', code: 'bad_login', message: 'Incorrect account or password.' });
        return;
      }
      record.lastLogin = Date.now();
      await this.storage.saveAccount(record);
    }
    session.account = record.account;
    session.authenticated = true;
    const chars = await this.storage.getCharacters(record.account);
    this.sendRaw(session, {
      t: 'login_ok',
      account: record.account,
      characters: chars.map((c) => this.summaryOf(c)),
    });
    if (register && characterName && archetype) {
      await this.handleCreateCharacter(session, characterName, archetype, defaultAppearance(archetype));
    }
  }

  private summaryOf(c: CharacterRecord): CharacterSummary {
    return {
      id: c.id,
      name: c.state.name,
      level: c.state.progress.level,
      archetype: c.state.progress.archetype,
      zoneId: c.state.zoneId,
      playSeconds: c.state.playSeconds,
    };
  }

  private async handleCreateCharacter(session: Session, name: string, archetype: ArchetypeId, appearance: PlayerAppearance) {
    if (!session.account) return;
    const clean = name.trim().slice(0, 16).replace(/[^a-zA-Z0-9 _-]/g, '');
    if (clean.length < 2) {
      this.sendRaw(session, { t: 'error', code: 'bad_name', message: 'Character name must be at least 2 characters.' });
      return;
    }
    if (!ARCHETYPES[archetype]) {
      this.sendRaw(session, { t: 'error', code: 'bad_archetype', message: 'Unknown archetype.' });
      return;
    }
    const existing = await this.storage.getCharacters(session.account);
    if (existing.some((c) => c.state.name.toLowerCase() === clean.toLowerCase())) {
      this.sendRaw(session, { t: 'error', code: 'name_taken', message: 'That character name is taken.' });
      return;
    }
    const id = characterIdFor(session.account, clean);
    const player = this.sim.createPlayerState(nextPlayerId++, clean, archetype, appearance ?? defaultAppearance(archetype), session.account);
    const record: CharacterRecord = { id, account: session.account, name: clean, state: player, createdAt: Date.now(), lastSeen: Date.now() };
    await this.storage.saveCharacter(record);
    const chars = await this.storage.getCharacters(session.account);
    this.sendRaw(session, { t: 'login_ok', account: session.account, characters: chars.map((c) => this.summaryOf(c)) });
  }

  private async handleEnterWorld(session: Session) {
    if (!session.account) return;
    const chars = await this.storage.getCharacters(session.account);
    if (chars.length === 0) {
      this.sendRaw(session, { t: 'error', code: 'no_character', message: 'Create a character first.' });
      return;
    }
    const record = chars[0];
    const player = record.state;
    if (!player.zoneId) player.zoneId = STARTING_ZONE;
    // remap entity id from server counter to keep uniqueness
    player.id = nextPlayerId++;
    // ensure runtime maps (loaded from JSON)
    player.combat.momentum = player.combat.momentum ?? { points: 0, max: 100, decaying: true };
    player.combat.statuses = player.combat.statuses ?? [];
    player.combat.cooldowns = player.combat.cooldowns ?? {};
    player.quests = player.quests ?? [];
    player.reputation = player.reputation ?? {};
    session.player = player;
    session.playerId = player.id;
    session.characterId = record.id;
    session.knownEntities = new Set();
    this.sim.addPlayer(player);
    this.sendRaw(session, {
      t: 'enter',
      player: serializePlayer(player),
      abilities: player.progress.unlockedAbilities.map((a) => ABILITIES[a]).filter(Boolean) as never,
      serverTime: Date.now(),
      dayTime: this.sim.dayTime(),
    });
    this.broadcast({ t: 'player_joined', name: player.name, level: player.progress.level }, session.account ?? undefined);
  }

  // --------------------------------------------------------------- persistence

  private async persistCharacter(session: Session) {
    if (!session.player || !session.characterId || !session.account) return;
    const record: CharacterRecord = {
      id: session.characterId,
      account: session.account,
      name: session.player.name,
      state: session.player,
      createdAt: session.player.createdAt,
      lastSeen: Date.now(),
    };
    session.player.lastSavedAt = Date.now();
    session.player.dirty = false;
    await this.storage.saveCharacter(record);
  }

  private async persistAll() {
    for (const s of this.sessions) {
      if (s.player && s.player.dirty) {
        try {
          await this.persistCharacter(s);
        } catch (err) {
          console.error('[server] periodic persist failed:', err);
        }
      }
    }
  }

  private async persistWorld() {
    await this.storage.saveWorld({ flags: this.sim.getFlags() as Record<string, number | string | boolean>, events: this.sim.getWorldEvents() });
  }

  getPlayerCount(): number {
    let n = 0;
    for (const s of this.sessions) if (s.player) n++;
    return n;
  }

  lookupRecipe(id: string) {
    return RECIPES[id];
  }

  lookupQuest(id: string) {
    return QUESTS[id];
  }

  lookupItem(id: string) {
    return ITEMS[id];
  }
}

function round(v: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export function npcEntityId(npcId: string): number {
  let h = 2_000_000;
  for (let i = 0; i < npcId.length; i++) h = (h * 31 + npcId.charCodeAt(i)) >>> 0;
  return h % 1_000_000 + 2_000_000;
}

export function nodeEntityId(_zone: ZoneId, nodeId: number): number {
  return 4_000_000 + nodeId;
}

export function portalEntityId(_zone: ZoneId, portalId: string): number {
  let h = 5_000_000;
  for (let i = 0; i < portalId.length; i++) h = (h * 31 + portalId.charCodeAt(i)) >>> 0;
  return (h % 500_000) + 5_000_000;
}

export function defaultAppearance(archetype: ArchetypeId): PlayerAppearance {
  const color = ARCHETYPES[archetype]?.color ?? '#9e9e9e';
  return { bodyColor: color, hairColor: '#3e2723', skinTone: '#e0ac69', height: 1, archetype };
}

// local ability index re-export to avoid deep import paths in consumers
export { computeStats, addItemToInventory, ENEMIES, NPCS, ITEMS, RECIPES, QUESTS, ARCHETYPES, ABILITIES, hashPassword };
export type { SimEvent };
