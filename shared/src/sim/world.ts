import { CollisionGrid } from './collision.js';
import { findPath } from './pathfinding.js';
import { computeDamage, damageMultiplier, isStunned, makeStatus, movementMultiplier, tickStatuses } from './combat.js';
import { generateLoot } from './loot.js';
import { ENEMIES } from '../content/enemies.js';
import { RESOURCE_NODES } from '../content/recipes.js';
import { NPCS } from '../content/npcs.js';
import { getZone, type ZoneDef } from '../content/zones.js';
import { makeItem } from './loot.js';
import { Rng, angleTo, distXZ } from '../math.js';
import type {
  EnemyRuntime,
  EntityId,
  GroundItem,
  ItemInstance,
  PlayerState,
  ResourceNodeInstance,
  StatusEffect,
  ZoneId,
} from '../types.js';

export interface HostCallbacks {
  onEnemyKilled(world: ZoneWorld, enemy: EnemyRuntime, killerId?: EntityId): void;
  onEnemyDamaged(world: ZoneWorld, enemy: EnemyRuntime, attackerId: EntityId, amount: number, crit: boolean): void;
  onEnemyAttackPlayer(world: ZoneWorld, enemy: EnemyRuntime, player: PlayerState, amount: number, crit: boolean): void;
  onStatusTick(world: ZoneWorld, target: 'enemy' | 'player', id: EntityId, kind: string, amount: number): void;
}

let nextEntityId = 1_000_000;
export function allocEntityId(): number {
  return nextEntityId++;
}

export function resetEntityIds(v = 1_000_000) {
  nextEntityId = v;
}

export class ZoneWorld {
  readonly def: ZoneDef;
  readonly id: ZoneId;
  readonly grid: CollisionGrid;
  enemies = new Map<EntityId, EnemyRuntime>();
  nodes: ResourceNodeInstance[] = [];
  ground: GroundItem[] = [];
  npcPositions = new Map<string, { x: number; z: number }>();
  private rng = new Rng(Date.now() & 0xffffffff);
  private spawnIndex = 0;
  private host: HostCallbacks;

  constructor(zoneId: string, host: HostCallbacks) {
    this.id = zoneId;
    this.def = getZone(zoneId);
    this.grid = new CollisionGrid(zoneId);
    this.host = host;
    this.initResources();
    this.initSpawns();
    this.initNpcs();
  }

  private initResources() {
    for (const r of this.def.resources) {
      const instance: ResourceNodeInstance = { id: this.nodes.length + 1, defId: r.nodeId, x: r.x, z: r.z, depletedUntil: 0 };
      this.nodes.push(instance);
    }
  }

  private initSpawns() {
    for (let si = 0; si < this.def.spawns.length; si++) {
      const sp = this.def.spawns[si];
      for (let i = 0; i < sp.count; i++) {
        this.spawnEnemy(sp.enemyId, sp.x, sp.z, sp.radius, si);
      }
    }
  }

  private initNpcs() {
    for (const n of this.def.npcs) {
      const def = NPCS[n.npcId];
      if (!def) continue;
      this.npcPositions.set(def.id, { x: def.x, z: def.z });
    }
  }

  spawnEnemy(defId: string, x: number, z: number, radius: number, spawnId: number, levelVariance = 0): EnemyRuntime | null {
    const def = ENEMIES[defId];
    if (!def) return null;
    const angle = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(0, radius);
    let px = x + Math.cos(angle) * r;
    let pz = z + Math.sin(angle) * r;
    if (this.grid.circleHits(px, pz, 0.7)) {
      const c = this.grid.clampToZone(x, z);
      px = c.x;
      pz = c.z;
    }
    const level = Math.max(1, def.level + Math.round(this.rng.range(-levelVariance, levelVariance)));
    const scale = 1 + (level - def.level) * 0.1;
    const enemy: EnemyRuntime = {
      id: allocEntityId(),
      defId,
      x: px,
      y: 0,
      z: pz,
      heading: this.rng.range(0, Math.PI * 2),
      health: Math.round(def.health * scale),
      maxHealth: Math.round(def.health * scale),
      state: 'idle',
      stateTimer: 0,
      attackCooldown: 0,
      specialCooldown: def.behavior.specialInterval ?? 999,
      homeX: px,
      homeZ: pz,
      path: [],
      pathIndex: 0,
      statuses: [],
      shield: 0,
      shieldUntil: 0,
      spawnId,
      dead: false,
      respawnAt: 0,
      threat: new Map(),
      loot: [],
      gold: 0,
      level,
      animation: 'idle',
      animUntil: 0,
      hitFlashUntil: 0,
    };
    this.enemies.set(enemy.id, enemy);
    return enemy;
  }

  private respawnDead(now: number) {
    for (const enemy of this.enemies.values()) {
      if (!enemy.dead) continue;
      const sp = this.def.spawns[enemy.spawnId];
      if (!sp) continue;
      if (now - enemy.respawnAt > sp.respawnSeconds) {
        this.spawnEnemy(sp.enemyId, sp.x, sp.z, sp.radius, enemy.spawnId, sp.levelVariance ?? 0);
        this.enemies.delete(enemy.id);
      }
    }
  }

  respawnAll() {
    for (const sp of this.def.spawns) {
      for (let i = 0; i < sp.count; i++) this.spawnEnemy(sp.enemyId, sp.x, sp.z, sp.radius, this.def.spawns.indexOf(sp));
    }
  }

  nearestEnemy(x: number, z: number, range: number, excludeDead = true): EnemyRuntime | null {
    let best: EnemyRuntime | null = null;
    let bestD = range;
    for (const e of this.enemies.values()) {
      if (excludeDead && e.dead) continue;
      const d = distXZ(x, z, e.x, e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  enemiesInRadius(x: number, z: number, radius: number): EnemyRuntime[] {
    const out: EnemyRuntime[] = [];
    for (const e of this.enemies.values()) {
      if (e.dead) continue;
      if (distXZ(x, z, e.x, e.z) <= radius) out.push(e);
    }
    return out;
  }

  dropGround(items: ItemInstance[], gold: number, x: number, z: number, now: number, owner?: string): GroundItem {
    const g: GroundItem = { id: allocEntityId(), items, gold, x, z, expiresAt: now + 120_000, owner };
    if (this.ground.length > 80) this.ground.shift();
    this.ground.push(g);
    return g;
  }

  tick(now: number, dt: number, players: PlayerState[], getPlayer: (id: EntityId) => PlayerState | undefined) {
    this.respawnDead(now);
    for (const e of this.enemies.values()) {
      if (e.dead) continue;
      this.updateEnemy(e, now, dt, players, getPlayer);
    }
    for (let i = this.ground.length - 1; i >= 0; i--) {
      if (this.ground[i].expiresAt < now) this.ground.splice(i, 1);
    }
    this.updateNpcSchedules(now);
  }

  private updateNpcSchedules(now: number) {
    const hours = ((now % 86400000) / 3_600_000) % 24;
    for (const n of this.def.npcs) {
      const def = NPCS[n.npcId];
      if (!def || !def.schedule || def.schedule.length === 0) continue;
      let target = def.schedule[0];
      for (const s of def.schedule) if (hours >= s.hour) target = s;
      const pos = this.npcPositions.get(def.id)!;
      const desiredX = def.x + (target.x - def.x);
      const desiredZ = def.z + (target.z - def.z);
      const dx = desiredX - pos.x;
      const dz = desiredZ - pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.05) {
        const step = Math.min(d, 1.2 * 0.016);
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
      }
    }
  }

  private updateEnemy(e: EnemyRuntime, now: number, dt: number, players: PlayerState[], getPlayer: (id: EntityId) => PlayerState | undefined) {
    const def = ENEMIES[e.defId];
    if (!def) return;

    const wasStunned = isStunned(e.statuses);
    for (const s of e.statuses) {
      if (['burn', 'poison', 'bleed'].includes(s.id)) {
        const dmg = Math.max(1, Math.round(s.power * dt));
        s.dotAccum = (s.dotAccum ?? 0) + dmg;
        if ((s.dotAccum ?? 0) >= 1) {
          const tickDmg = Math.floor(s.dotAccum!);
          s.dotAccum = s.dotAccum! - tickDmg;
          this.damageEnemy(e, undefined, tickDmg, false, now, s.id);
        }
      }
    }
    e.statuses = tickStatuses(e.statuses, dt);

    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.specialCooldown = Math.max(0, e.specialCooldown - dt);
    e.stateTimer -= dt;
    if (e.shieldUntil < now) e.shield = 0;
    if (e.animUntil < now) e.animation = e.state === 'attack' ? 'idle' : e.animation;

    if (def.aggroRange <= 0 || wasStunned) {
      if (wasStunned) return;
    }

    const target = this.selectTarget(e, players, def, getPlayer);

    switch (e.state) {
      case 'idle':
      case 'patrol': {
        if (target) {
          e.state = 'detect';
          e.stateTimer = 0.4;
          e.targetId = target;
          e.threat.set(target, 10);
        } else if (e.state === 'idle' && e.stateTimer <= 0 && def.behavior.wanderRadius > 0) {
          e.state = 'patrol';
          e.wanderTarget = this.randomWander(e, def.behavior.wanderRadius);
          e.path = findPath(this.grid, e.x, e.z, e.wanderTarget.x, e.wanderTarget.z, 900);
          e.pathIndex = 0;
          e.stateTimer = this.rng.range(3, 7);
        } else if (e.state === 'patrol') {
          this.followPath(e, 1.6 * movementMultiplier(e.statuses), dt);
          if (!e.path || e.pathIndex >= e.path.length) {
            e.state = 'idle';
            e.stateTimer = this.rng.range(1.5, 4);
          }
        }
        break;
      }
      case 'detect': {
        if (e.stateTimer <= 0) e.state = 'chase';
        break;
      }
      case 'chase': {
        if (!target) {
          e.state = 'return';
          e.targetId = undefined;
        } else {
          e.targetId = target;
          const tp = getPlayer(target);
          if (tp) {
            const d = distXZ(e.x, e.z, tp.x, tp.z);
            if (d <= def.attackRange) {
              e.state = 'attack';
            } else {
              if ((!e.path || e.pathIndex >= e.path.length || e.pathTimer === undefined || now > e.pathTimer) && d < def.aggroRange * 3) {
                e.path = findPath(this.grid, e.x, e.z, tp.x, tp.z, 1600);
                e.pathIndex = 0;
                e.pathTimer = now + 500;
              }
              const speed = def.speed * movementMultiplier(e.statuses);
              if (!this.followPath(e, speed, dt)) {
                const dx = tp.x - e.x;
                const dz = tp.z - e.z;
                const len = Math.hypot(dx, dz) || 1;
                this.moveEnemy(e, (dx / len) * speed * dt, (dz / len) * speed * dt);
              }
              e.heading = angleTo(e.x, e.z, tp.x, tp.z);
            }
          }
        }
        const homeDist = distXZ(e.x, e.z, e.homeX, e.homeZ);
        if (homeDist > def.behavior.leash) {
          e.state = 'return';
          e.targetId = undefined;
        }
        break;
      }
      case 'attack': {
        const tp = e.targetId !== undefined ? getPlayer(e.targetId) : undefined;
        if (!tp) {
          e.state = 'chase';
          break;
        }
        const d = distXZ(e.x, e.z, tp.x, tp.z);
        e.heading = angleTo(e.x, e.z, tp.x, tp.z);
        if (d > def.attackRange + 1) {
          e.state = 'chase';
          break;
        }
        if (e.attackCooldown <= 0 && def.damage.max > 0) {
          e.attackCooldown = def.attackCooldown;
          e.animation = 'attack';
          e.animUntil = now + 400;
          const result = computeDamage({
            baseMin: def.damage.min,
            baseMax: def.damage.max,
            damageType: def.damage.type,
            critChance: 0.05,
            critDamage: 1.5,
            armor: 0,
            attackerLevel: e.level,
            defenderLevel: tp.progress.level,
            rng: this.rng,
          });
          this.host.onEnemyAttackPlayer(this, e, tp, result.amount, result.crit);
        }
        if (def.behavior.strafeChance && e.attackCooldown > def.attackCooldown * 0.5 && this.rng.chance(def.behavior.strafeChance)) {
          const side = this.rng.chance(0.5) ? 1 : -1;
          const mx = -Math.sin(e.heading) * side;
          const mz = Math.cos(e.heading) * side;
          this.moveEnemy(e, mx * def.speed * 0.4 * dt, mz * def.speed * 0.4 * dt);
        }
        if (def.behavior.specialInterval && e.specialCooldown <= 0) {
          this.performSpecial(e, def, tp, now);
        }
        break;
      }
      case 'return': {
        const d = distXZ(e.x, e.z, e.homeX, e.homeZ);
        if (d < 2) {
          e.state = 'idle';
          e.health = Math.min(e.maxHealth, e.health + e.maxHealth * 0.3);
          break;
        }
        if (!e.path || e.pathIndex >= e.path.length || now > (e.pathTimer ?? 0)) {
          e.path = findPath(this.grid, e.x, e.z, e.homeX, e.homeZ, 1200);
          e.pathIndex = 0;
          e.pathTimer = now + 1500;
        }
        this.followPath(e, def.speed * 1.2 * movementMultiplier(e.statuses), dt);
        break;
      }
      case 'hurt': {
        if (e.stateTimer <= 0) e.state = e.targetId ? 'chase' : 'idle';
        break;
      }
      case 'flee': {
        const tp = e.targetId !== undefined ? getPlayer(e.targetId) : undefined;
        if (!tp || e.health > e.maxHealth * 0.5) {
          e.state = 'chase';
          break;
        }
        const dx = e.x - tp.x;
        const dz = e.z - tp.z;
        const len = Math.hypot(dx, dz) || 1;
        this.moveEnemy(e, (dx / len) * def.speed * dt, (dz / len) * def.speed * dt);
        break;
      }
      case 'dead':
        break;
    }

    if (def.behavior.fleeThreshold && e.health <= e.maxHealth * def.behavior.fleeThreshold && e.state !== 'flee' && e.state !== 'dead') {
      e.state = 'flee';
      e.stateTimer = 2;
    }
  }

  private performSpecial(e: EnemyRuntime, def: (typeof ENEMIES)[string], _tp: PlayerState, now: number) {
    e.specialCooldown = def.behavior.specialInterval ?? 999;
    if (e.defId === 'veil_wisp' || e.defId === 'rift_guardian') {
      e.statuses.push(makeStatus('haste', 2, 0.4));
    } else if (def.behavior.teleportAtHealth && e.health <= e.maxHealth * def.behavior.teleportAtHealth) {
      const angle = this.rng.range(0, Math.PI * 2);
      const nx = e.x + Math.cos(angle) * 12;
      const nz = e.z + Math.sin(angle) * 12;
      if (!this.grid.circleHits(nx, nz, 1)) {
        e.x = nx;
        e.z = nz;
        e.statuses.push(makeStatus('haste', 3, 0.5));
      }
    } else if (def.behavior.packRange) {
      // summon reinforcement for swarm
      const angle = this.rng.range(0, Math.PI * 2);
      this.spawnEnemy(e.defId, e.x + Math.cos(angle) * 3, e.z + Math.sin(angle) * 3, 0, e.spawnId);
    } else {
      e.statuses.push(makeStatus('haste', 2, 0.5));
    }
    void now;
  }

  private selectTarget(e: EnemyRuntime, players: PlayerState[], def: (typeof ENEMIES)[string], getPlayer: (id: EntityId) => PlayerState | undefined): EntityId | undefined {
    if (e.targetId !== undefined) {
      const p = getPlayer(e.targetId);
      if (p && p.zoneId === this.id && p.combat.health > 0 && !p.combat.statuses.some((s) => s.id === 'stealth')) {
        const d = distXZ(e.x, e.z, p.x, p.z);
        if (d <= def.aggroRange * 2.5) return e.targetId;
      }
      e.targetId = undefined;
    }
    let best: EntityId | undefined;
    let bestScore = Infinity;
    for (const p of players) {
      if (p.zoneId !== this.id || p.combat.health <= 0) continue;
      if (p.combat.statuses.some((s) => s.id === 'stealth')) continue;
      const d = distXZ(e.x, e.z, p.x, p.z);
      if (d <= def.aggroRange) {
        const threat = e.threat.get(p.id) ?? 0;
        const score = d - threat * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = p.id;
        }
      }
    }
    return best;
  }

  private randomWander(e: EnemyRuntime, radius: number): { x: number; z: number } {
    for (let i = 0; i < 6; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(radius * 0.3, radius);
      const x = e.homeX + Math.cos(a) * r;
      const z = e.homeZ + Math.sin(a) * r;
      if (!this.grid.circleHits(x, z, 0.8)) return { x, z };
    }
    return { x: e.homeX, z: e.homeZ };
  }

  private followPath(e: EnemyRuntime, speed: number, dt: number): boolean {
    if (!e.path || e.pathIndex >= e.path.length) return false;
    const wp = e.path[e.pathIndex];
    const dx = wp.x - e.x;
    const dz = wp.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.0) {
      e.pathIndex++;
      return e.pathIndex < e.path.length;
    }
    const step = speed * dt;
    this.moveEnemy(e, (dx / d) * step, (dz / d) * step);
    e.heading = Math.atan2(dx, dz);
    return true;
  }

  private moveEnemy(e: EnemyRuntime, dx: number, dz: number) {
    const res = this.grid.moveWithCollision(e.x, e.z, dx, dz, 0.6);
    e.x = res.x;
    e.z = res.z;
  }

  damageEnemy(e: EnemyRuntime, attackerId: EntityId | undefined, amount: number, crit: boolean, now: number, statusKind?: string): boolean {
    if (e.dead) return false;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
    }
    e.health -= amount;
    e.hitFlashUntil = now + 120;
    if (attackerId !== undefined) {
      e.threat.set(attackerId, (e.threat.get(attackerId) ?? 0) + amount);
      e.lastDamagedBy = attackerId;
    }
    if (e.health <= 0) {
      e.health = 0;
      e.dead = true;
      e.state = 'dead';
      e.animation = 'death';
      const def = ENEMIES[e.defId];
      const roll = generateLoot(def, this.rng);
      this.dropGround(roll.items, roll.gold, e.x, e.z, now);
      this.host.onEnemyKilled(this, e, attackerId);
      e.deadAt = now;
      return true;
    }
    if (!statusKind) {
      this.host.onEnemyDamaged(this, e, attackerId ?? 0, amount, crit);
    }
    if (e.state === 'idle' || e.state === 'patrol' || e.state === 'return') {
      e.state = 'chase';
      e.stateTimer = 0;
    }
    const fleeThreshold = ENEMIES[e.defId]?.behavior.fleeThreshold;
    if (fleeThreshold && e.health <= e.maxHealth * fleeThreshold) {
      e.state = 'flee';
      e.stateTimer = 2;
    }
    return false;
  }
}

export function makeGroundItemFromLoot(items: ItemInstance[], gold: number, x: number, z: number, now: number, owner?: string): GroundItem {
  return { id: allocEntityId(), items, gold, x, z, expiresAt: now + 120_000, owner };
}

export function gatherYield(defId: string, skillLevel: number, rng: Rng): { items: ItemInstance[]; xp: number } {
  const node = RESOURCE_NODES[defId];
  if (!node) return { items: [], xp: 0 };
  const items: ItemInstance[] = [];
  for (const y of node.yields) {
    const bonus = skillLevel > node.levelReq ? 0.1 : 0;
    if (rng.chance(Math.min(1, y.chance + bonus))) {
      const qty = rng.int(y.qtyMin ?? 1, y.qtyMax ?? y.qtyMin ?? 1);
      items.push(makeItem(y.itemId, qty));
    }
  }
  return { items, xp: Math.round(5 + node.levelReq * 3) };
}

export type { StatusEffect };
