import { Simulation, type SimHooks } from '@shared/sim/simulation.js';
import { serializePlayer } from '@shared/sim/serialize.js';
import { ENEMIES } from '@shared/content/enemies.js';
import { NPCS } from '@shared/content/npcs.js';
import { ABILITIES } from '@shared/content/abilities.js';
import { TICK_DT, SNAPSHOT_RATE, INTEREST_RADIUS } from '@shared/constants.js';
import type {
  ArchetypeId,
  EnemyRuntime,
  EntityId,
  PlayerAppearance,
  PlayerState,
  ZoneId,
} from '@shared/types.js';
import type { ClientMessage, ServerMessage, SnapshotEntity, PlayerSnapshot, EnemySnapshot } from '@shared/protocol.js';
import type { NetStatus, Transport } from './transport.js';
import { npcEntityId, nodeEntityId, portalEntityId, round } from './transport.js';

let nextPlayerId = 1;

/**
 * OfflineTransport runs the exact same shared Simulation that the server runs,
 * in the browser. It lets the game be played with no server (e.g. a static
 * GitHub Pages deployment) while keeping the identical gameplay rules.
 */
export class OfflineTransport implements Transport {
  readonly online = false;
  private messageCbs: ((msg: ServerMessage) => void)[] = [];
  private statusCbs: ((status: NetStatus, detail?: string) => void)[] = [];
  private sim = new Simulation(this.makeHooks());
  private player: PlayerState | null = null;
  private account = 'wanderer';
  private characterName = 'Wanderer';
  private archetype: ArchetypeId = 'vanguard';
  private knownEntities = new Set<number>();
  private tickTimer: number | null = null;
  private snapTimer: number | null = null;
  private accumulator = 0;
  private lastTime = performance.now();
  private tickCount = 0;
  private running = false;

  send(msg: ClientMessage) {
    switch (msg.t) {
      case 'hello':
        this.emit({ t: 'welcome', protocol: 1, serverTime: Date.now(), characters: [] });
        break;
      case 'register': {
        this.account = msg.account;
        this.characterName = msg.characterName || 'Wanderer';
        this.archetype = msg.archetype || 'vanguard';
        this.createPlayer();
        this.emit({ t: 'login_ok', account: this.account, characters: this.summary() });
        break;
      }
      case 'login': {
        this.account = msg.account || this.account;
        if (!this.player) this.createPlayer();
        this.emit({ t: 'login_ok', account: this.account, characters: this.summary() });
        break;
      }
      case 'create_character': {
        this.characterName = msg.name || 'Wanderer';
        this.archetype = msg.archetype || 'vanguard';
        this.createPlayer(msg.appearance);
        this.emit({ t: 'login_ok', account: this.account, characters: this.summary() });
        break;
      }
      case 'enter_world':
        this.enterWorld();
        break;
      case 'ping':
        this.emit({ t: 'pong', id: msg.id, serverTime: Date.now() });
        break;
      case 'chat':
        if (this.player) this.sim.handleMessage(this.player, msg);
        if (this.player) {
          this.emit({ t: 'chat', id: Date.now(), channel: msg.channel, from: this.player.name, text: msg.text, at: Date.now() });
        }
        break;
      case 'unload':
        this.stop();
        break;
      default:
        if (this.player) this.sim.handleMessage(this.player, msg);
        break;
    }
  }

  onMessage(cb: (msg: ServerMessage) => void) {
    this.messageCbs.push(cb);
  }

  onStatus(cb: (status: NetStatus, detail?: string) => void) {
    this.statusCbs.push(cb);
  }

  private createPlayer(appearance?: PlayerAppearance) {
    const app = appearance ?? { bodyColor: '#b0bec5', hairColor: '#3e2723', skinTone: '#e0ac69', height: 1, archetype: this.archetype };
    this.player = this.sim.createPlayerState(nextPlayerId++, this.characterName, this.archetype, app, this.account);
    this.player.zoneId = 'elaris';
  }

  private summary() {
    if (!this.player) return [];
    return [
      {
        id: 'offline',
        name: this.player.name,
        level: this.player.progress.level,
        archetype: this.player.progress.archetype,
        zoneId: this.player.zoneId,
        playSeconds: this.player.playSeconds,
      },
    ];
  }

  private enterWorld() {
    if (!this.player) this.createPlayer();
    const player = this.player!;
    player.zoneId = player.zoneId || 'elaris';
    if (!this.sim.players.has(player.id)) {
      this.sim.addPlayer(player);
    }
    this.knownEntities = new Set();
    this.emit({
      t: 'enter',
      player: serializePlayer(player),
      abilities: player.progress.unlockedAbilities.map((a) => ABILITIES[a]).filter(Boolean),
      serverTime: Date.now(),
      dayTime: this.sim.dayTime(),
    });
    this.start();
  }

  private start() {
    if (this.running) return;
    this.running = true;
    this.emitStatus('online');
    this.lastTime = performance.now();
    this.tickTimer = window.setInterval(() => this.tick(), 1000 / 20);
    this.snapTimer = window.setInterval(() => this.snapshot(), 1000 / SNAPSHOT_RATE);
  }

  private stop() {
    this.running = false;
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
    if (this.snapTimer !== null) window.clearInterval(this.snapTimer);
    this.tickTimer = null;
    this.snapTimer = null;
  }

  private tick() {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.25) dt = 0.25;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= TICK_DT && steps < 5) {
      this.sim.tick(TICK_DT);
      this.accumulator -= TICK_DT;
      this.tickCount++;
      steps++;
    }
  }

  private snapshot() {
    if (!this.player) return;
    const player = this.player;
    const world = this.sim.getWorld(player.zoneId);
    const entities: SnapshotEntity[] = [];
    const currentIds = new Set<number>();

    for (const other of this.sim.playersInZone(player.zoneId)) {
      if (other.id === player.id) continue;
      if (this.dist(other.x, other.z, player) > INTEREST_RADIUS) continue;
      currentIds.add(other.id);
      entities.push(this.playerSnapshot(other));
    }
    for (const enemy of world.enemies.values()) {
      if (enemy.dead) continue;
      if (this.dist(enemy.x, enemy.z, player) > INTEREST_RADIUS) continue;
      currentIds.add(enemy.id);
      entities.push(this.enemySnapshot(enemy));
    }
    for (const n of world.def.npcs) {
      const def = NPCS[n.npcId];
      if (!def) continue;
      const pos = world.npcPositions.get(def.id) ?? { x: def.x, z: def.z };
      if (this.dist(pos.x, pos.z, player) > INTEREST_RADIUS) continue;
      const id = npcEntityId(def.id);
      currentIds.add(id);
      entities.push({ id, kind: 'npc', x: pos.x, y: 0, z: pos.z, h: 0, state: def.role });
    }
    for (const node of world.nodes) {
      if (this.dist(node.x, node.z, player) > INTEREST_RADIUS) continue;
      const id = nodeEntityId(world.id, node.id);
      currentIds.add(id);
      entities.push({ id, kind: 'node', x: node.x, y: 0, z: node.z, h: 0, state: node.defId });
    }
    for (const g of world.ground) {
      if (this.dist(g.x, g.z, player) > INTEREST_RADIUS) continue;
      currentIds.add(g.id);
      entities.push({ id: g.id, kind: 'ground', x: g.x, y: 0.4, z: g.z, h: 0, state: g.gold > 0 ? 'gold' : 'item' });
    }
    for (const p of world.def.portals) {
      const id = portalEntityId(world.id, p.id);
      currentIds.add(id);
      entities.push({ id, kind: 'portal', x: p.x, y: 0, z: p.z, h: 0, state: p.label });
    }

    const removed: number[] = [];
    for (const id of this.knownEntities) if (!currentIds.has(id)) removed.push(id);
    this.knownEntities = currentIds;

    this.emit({
      t: 'snapshot',
      tick: this.tickCount,
      time: Date.now(),
      you: serializePlayer(player),
      entities,
      removed,
      dayTime: this.sim.dayTime(),
      events: [],
    });
  }

  private dist(x: number, z: number, player: PlayerState) {
    return Math.hypot(x - player.x, z - player.z);
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
      y: 0,
      z: round(e.z),
      h: round(e.heading, 2),
      hp: Math.round(e.health),
      mhp: Math.round(e.maxHealth),
      state: e.state,
      anim: e.animation,
      defId: e.defId,
      name: def?.name ?? e.defId,
      level: e.level,
      health: Math.round(e.health),
      maxHealth: Math.round(e.maxHealth),
      elite: def?.elite,
      boss: def?.boss,
      flash: e.hitFlashUntil > Date.now(),
    };
  }

  private makeHooks(): SimHooks {
    return {
      emitCombat: (_playerId, event) => this.emit({ t: 'combat', events: [event] }),
      emitZone: (_playerId, event) =>
        this.emit({ t: 'world_event', id: '', type: event.kind, data: event.data as Record<string, unknown>, at: Date.now() }),
      onInventoryChanged: (player) =>
        this.emit({ t: 'inventory', inventory: player.inventory, equipment: player.equipment, gold: player.progress.gold }),
      onProgress: (player) =>
        this.emit({
          t: 'progress',
          xp: player.progress.xp,
          level: player.progress.level,
          skillXp: player.progress.skillXp,
          skillLevels: player.progress.skillLevels,
          gold: player.progress.gold,
        }),
      onQuestUpdate: (player, accepted, turnedIn) => this.emit({ t: 'quest_update', quests: player.quests, accepted, turnedIn }),
      onGatheringResult: (player, nodeId, success, items, xp) => this.emit({ t: 'gathering_result', nodeId, success, items, xp }),
      onCraftResult: (player, success, recipeId, items, xp) => this.emit({ t: 'craft_result', success, recipeId, items, xp }),
      onDeath: (player, respawnIn, xpLost) => this.emit({ t: 'death', respawnIn, xpLost }),
      onRespawn: (player) => this.emit({ t: 'respawned', you: serializePlayer(player) }),
      onWorldEvent: (id, type, data, at) => this.emit({ t: 'world_event', id, type, data, at }),
      onDialogue: (player, npcId, dialogueId) => {
        const npc = NPCS[npcId];
        if (!npc) return;
        const node = npc.dialogue.find((d) => d.id === dialogueId) ?? npc.dialogue[0];
        this.emit({
          t: 'npc_dialogue',
          npcId,
          npc,
          dialogueId: node.id,
          text: node.text,
          options: node.options.map((o) => ({ text: o.text, next: o.next, action: o.action ? JSON.stringify(o.action) : undefined })),
        });
      },
      onChat: (_player, channel, text) => this.emit({ t: 'chat', id: Date.now(), channel, from: this.player?.name ?? 'system', text, at: Date.now() }),
      onGroundLoot: (player) => this.emit({ t: 'loot', ground: this.sim.getWorld(player.zoneId).ground }),
      onAbilityUnlocked: (_player, ability) => this.emit({ t: 'ability_unlocked', ability }),
    };
  }

  private emit(msg: ServerMessage) {
    for (const cb of this.messageCbs) cb(msg);
  }

  private emitStatus(status: NetStatus, detail?: string) {
    for (const cb of this.statusCbs) cb(status, detail);
  }

  dispose() {
    this.stop();
  }
}

export type { EntityId, ZoneId };
