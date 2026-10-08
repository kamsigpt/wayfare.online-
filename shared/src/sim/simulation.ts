import { ZoneWorld, allocEntityId, gatherYield, type HostCallbacks } from './world.js';
import { CollisionGrid } from './collision.js';
import { findPath } from './pathfinding.js';
import {
  computeDamage,
  damageMultiplier,
  isStunned,
  makeStatus,
  movementMultiplier,
  tickStatuses,
} from './combat.js';
import { ENEMIES } from '../content/enemies.js';
import { ITEMS } from '../content/items.js';
import { ABILITIES, ARCHETYPE_ABILITIES, ARCHETYPES } from '../content/abilities.js';
import { RECIPES, RESOURCE_NODES } from '../content/recipes.js';
import { NPCS } from '../content/npcs.js';
import { QUESTS } from '../content/quests.js';
import { addItemToInventory, computeStats, countItem, findItemUid, removeItem, skillXpForLevel, xpForLevel, type DerivedStats } from './stats.js';
import { Rng, angleTo, clamp, distXZ } from '../math.js';
import {
  DAY_LENGTH_SECONDS,
  INVENTORY_SIZE,
  MAX_CHAT_LEN,
  STARTING_POS,
  STARTING_ZONE,
} from '../constants.js';
import type {
  AbilityDef,
  ArchetypeId,
  EnemyRuntime,
  EntityId,
  EquipSlot,
  ItemInstance,
  PlayerState,
  QuestDef,
  QuestObjective,
  QuestState,
  SkillId,
  StatusId,
  ZoneId,
} from '../types.js';
import type { ChatChannel, ClientMessage, CombatEvent, SimEvent } from '../protocol.js';

export interface SimHooks {
  emitCombat(playerId: EntityId, event: CombatEvent): void;
  emitZone(playerId: EntityId, event: SimEvent): void;
  onInventoryChanged(player: PlayerState): void;
  onProgress(player: PlayerState): void;
  onQuestUpdate(player: PlayerState, accepted?: string, turnedIn?: string): void;
  onGatheringResult(player: PlayerState, nodeId: number, success: boolean, items: ItemInstance[], xp: number): void;
  onCraftResult(player: PlayerState, success: boolean, recipeId: string, items: ItemInstance[], xp: number): void;
  onDeath(player: PlayerState, respawnIn: number, xpLost: number): void;
  onRespawn(player: PlayerState): void;
  onWorldEvent(id: string, type: string, data: Record<string, unknown>, at: number): void;
  onDialogue(player: PlayerState, npcId: string, dialogueId: string): void;
  onChat(player: PlayerState, channel: ChatChannel, text: string): void;
  onGroundLoot(player: PlayerState): void;
  onAbilityUnlocked(player: PlayerState, ability: AbilityDef): void;
}

export class Simulation {
  worlds = new Map<ZoneId, ZoneWorld>();
  players = new Map<EntityId, PlayerState>();
  derived = new Map<EntityId, DerivedStats>();
  private rng = new Rng(12345);
  private hooks: SimHooks;
  private worldFlags: Record<string, number | string | boolean> = {};
  private worldEvents: { id: string; type: string; data: Record<string, unknown>; at: number }[] = [];
  startTime = Date.now();
  private chatRate = new Map<string, number[]>();

  constructor(hooks: SimHooks) {
    this.hooks = hooks;
  }

  get elapsed(): number {
    return Date.now() - this.startTime;
  }

  dayTime(): number {
    return (this.elapsed / 1000 / DAY_LENGTH_SECONDS) % 1;
  }

  getWorld(zoneId: ZoneId): ZoneWorld {
    let w = this.worlds.get(zoneId);
    if (!w) {
      const host: HostCallbacks = {
        onEnemyKilled: (world, enemy, killerId) => this.onEnemyKilled(world, enemy, killerId),
        onEnemyDamaged: () => {},
        onEnemyAttackPlayer: (world, enemy, player, amount, crit) => this.onEnemyAttackPlayer(world, enemy, player, amount, crit),
        onStatusTick: () => {},
      };
      w = new ZoneWorld(zoneId, host);
      this.worlds.set(zoneId, w);
    }
    return w;
  }

  // ---------------------------------------------------------------- players

  createPlayerState(id: EntityId, name: string, archetype: ArchetypeId, appearance: PlayerState['appearance'], account: string): PlayerState {
    const def = ARCHETYPES[archetype] ?? ARCHETYPES.wayfarer;
    const skillLevels = {} as Record<SkillId, number>;
    const skillXp = {} as Record<SkillId, number>;
    const allSkills: SkillId[] = [
      'sword', 'bow', 'magic', 'shield', 'dualwield', 'mining', 'herbalism', 'fishing', 'woodcutting',
      'blacksmithing', 'alchemy', 'enchanting', 'cooking', 'exploration', 'trading', 'survival',
    ];
    for (const s of allSkills) {
      skillLevels[s] = 1;
      skillXp[s] = 0;
    }
    const player: PlayerState = {
      id,
      account,
      name,
      zoneId: STARTING_ZONE,
      x: STARTING_POS.x,
      y: 0,
      z: STARTING_POS.z,
      heading: 0,
      moveX: 0,
      moveZ: 0,
      moving: false,
      combat: {
        health: def.health,
        maxHealth: def.health,
        mana: def.mana,
        maxMana: def.mana,
        stamina: def.stamina,
        maxStamina: def.stamina,
        momentum: { points: 0, max: 100, decaying: true },
        statuses: [],
        shield: 0,
        shieldUntil: 0,
        invulnerableUntil: 0,
        cooldowns: {},
        globalCooldownUntil: 0,
        comboIndex: 0,
        comboExpiresAt: 0,
        lastAttackAt: 0,
        dodgeUntil: 0,
        dodgeReadyAt: 0,
      },
      progress: {
        level: 1,
        xp: 0,
        skillXp,
        skillLevels,
        abilityPoints: 0,
        unlockedAbilities: [...ARCHETYPE_ABILITIES[archetype]],
        archetype,
        pendingPaths: [],
        gold: 100,
        veilsShards: 0,
      },
      appearance,
      inventory: new Array(INVENTORY_SIZE).fill(null),
      bank: new Array(60).fill(null),
      equipment: {},
      quests: [],
      reputation: {},
      inputSeq: 0,
      lastProcessedSeq: 0,
      ping: 0,
      deaths: 0,
      kills: 0,
      playSeconds: 0,
      createdAt: Date.now(),
      dirty: true,
      lastSavedAt: 0,
      pvpEnabled: false,
      stats: { ...def.stats },
    };
    player.inventory[0] = { uid: `start${id}`, defId: 'rustic_sword', qty: 1 };
    player.inventory[1] = { uid: `startp${id}`, defId: 'health_potion', qty: 3 };
    player.inventory[2] = { uid: `startm${id}`, defId: 'mining_pick', qty: 1 };
    player.inventory[3] = { uid: `startf${id}`, defId: 'fishing_rod', qty: 1 };
    this.recalc(player);
    return player;
  }

  addPlayer(player: PlayerState) {
    player.zoneId = player.zoneId || STARTING_ZONE;
    if (!player.x && !player.z) {
      const sp = this.getWorld(player.zoneId).def.spawn;
      const c = this.getWorld(player.zoneId).grid.clampToZone(sp.x, sp.z);
      player.x = c.x;
      player.z = c.z;
    }
    this.players.set(player.id, player);
    this.recalc(player);
    if (player.combat.health <= 0) {
      player.combat.health = player.combat.maxHealth;
      player.combat.stamina = player.combat.maxStamina;
      player.combat.mana = player.combat.maxMana;
    }
  }

  removePlayer(id: EntityId) {
    const p = this.players.get(id);
    if (p?.partyId) {
      for (const other of this.players.values()) if (other.partyId === p.partyId) other.partyId = undefined;
    }
    this.players.delete(id);
    this.derived.delete(id);
  }

  recalc(player: PlayerState) {
    const d = computeStats(player.progress.level, player.progress.archetype, player.equipment, player.progress.skillLevels);
    this.derived.set(player.id, d);
    const ratio = player.combat.maxHealth > 0 ? player.combat.health / player.combat.maxHealth : 1;
    player.combat.maxHealth = d.maxHealth;
    player.combat.maxMana = d.maxMana;
    player.combat.maxStamina = d.maxStamina;
    player.combat.health = Math.max(1, Math.min(d.maxHealth, Math.round(ratio * d.maxHealth)));
    player.combat.mana = Math.min(player.combat.mana, d.maxMana);
    player.combat.stamina = Math.min(player.combat.stamina, d.maxStamina);
    player.stats = { ...d.stats };
  }

  private statsFor(id: EntityId): DerivedStats {
    return this.derived.get(id) ?? computeStats(1, 'wayfarer', {}, {} as Record<SkillId, number>);
  }

  playersInZone(zoneId: ZoneId): PlayerState[] {
    const out: PlayerState[] = [];
    for (const p of this.players.values()) if (p.zoneId === zoneId) out.push(p);
    return out;
  }

  // ---------------------------------------------------------------- tick

  tick(dt: number) {
    for (const p of this.players.values()) {
      this.tickPlayer(p, dt);
    }
    for (const world of this.worlds.values()) {
      world.tick(this.elapsed + this.startTime, dt, this.playersInZone(world.id), (id) => this.players.get(id));
    }
  }

  private tickPlayer(p: PlayerState, dt: number) {
    p.playSeconds += dt;
    const now = this.elapsed + this.startTime;
    if (p.combat.health <= 0) return;

    const moving = Math.abs(p.moveX) > 0.01 || Math.abs(p.moveZ) > 0.01;
    const dodging = p.combat.dodgeUntil > now;
    if (moving && !dodging) {
      const stats = this.statsFor(p.id);
      const slow = p.combat.statuses.some((s) => s.id === 'root' || s.id === 'stun');
      if (!slow) {
        const speed = stats.moveSpeed * movementMultiplier(p.combat.statuses) * 1.15;
        const len = Math.hypot(p.moveX, p.moveZ) || 1;
        const world = this.getWorld(p.zoneId);
        const res = world.grid.moveWithCollision(p.x, p.z, (p.moveX / len) * speed * dt, (p.moveZ / len) * speed * dt, 0.55);
        p.x = res.x;
        p.z = res.z;
        const c = world.grid.clampToZone(p.x, p.z);
        p.x = c.x;
        p.z = c.z;
        p.heading = angleTo(p.x, p.z, p.x + p.moveX, p.z + p.moveZ);
      }
      p.moving = true;
    } else if (dodging) {
      const dirX = p.combat.dodgeDirX ?? p.moveX;
      const dirZ = p.combat.dodgeDirZ ?? p.moveZ;
      const len = Math.hypot(dirX, dirZ) || 1;
      const world = this.getWorld(p.zoneId);
      const res = world.grid.moveWithCollision(p.x, p.z, (dirX / len) * 12 * dt, (dirZ / len) * 12 * dt, 0.55);
      p.x = res.x;
      p.z = res.z;
      p.heading = angleTo(p.x, p.z, p.x + dirX, p.z + dirZ);
      p.moving = true;
    } else {
      p.moving = false;
    }

    // follow path (tap-to-move)
    if (p.path && p.path.length > 0 && !moving && !dodging && p.combat.health > 0) {
      const wp = p.path[p.pathIndex ?? 0];
      if (!wp || distXZ(p.x, p.z, wp.x, wp.z) < 1.0) {
        p.pathIndex = (p.pathIndex ?? 0) + 1;
        if (p.pathIndex >= p.path.length) {
          p.path = undefined;
          p.pathIndex = 0;
        }
      } else {
        const dx = wp.x - p.x;
        const dz = wp.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const stats = this.statsFor(p.id);
        const world = this.getWorld(p.zoneId);
        const speed = stats.moveSpeed * movementMultiplier(p.combat.statuses) * 1.15;
        const res = world.grid.moveWithCollision(p.x, p.z, (dx / d) * speed * dt, (dz / d) * speed * dt, 0.55);
        p.x = res.x;
        p.z = res.z;
        p.heading = Math.atan2(dx, dz);
        p.moving = true;
      }
    }

    // statuses
    const before = p.combat.statuses.length;
    for (const s of p.combat.statuses) {
      if (['burn', 'poison', 'bleed'].includes(s.id)) {
        s.dotAccum = (s.dotAccum ?? 0) + Math.max(1, s.power * dt);
        if ((s.dotAccum ?? 0) >= 1) {
          const tickDmg = Math.floor(s.dotAccum!);
          s.dotAccum = s.dotAccum! - tickDmg;
          this.damagePlayer(p, undefined, tickDmg, false, s.id);
        }
      }
    }
    p.combat.statuses = tickStatuses(p.combat.statuses, dt);
    if (before !== p.combat.statuses.length && p.combat.statuses.length === 0) {
      p.dirty = true;
    }

    // regen
    const stats = this.statsFor(p.id);
    const inCombat = p.combat.lastAttackAt > this.elapsed + this.startTime - 5000;
    if (!inCombat) {
      p.combat.health = Math.min(p.combat.maxHealth, p.combat.health + p.combat.maxHealth * 0.02 * dt);
    }
    p.combat.stamina = Math.min(p.combat.maxStamina, p.combat.stamina + stats.maxStamina * 0.08 * dt);
    p.combat.mana = Math.min(p.combat.maxMana, p.combat.mana + p.combat.maxMana * 0.03 * dt);

    // momentum decay
    if (p.combat.momentum.points > 0) {
      const lastGain = p.combat.momentumLastGain ?? 0;
      if (now - lastGain > 6000) {
        p.combat.momentum.points = Math.max(0, p.combat.momentum.points - 12 * dt);
      }
    }

    if (p.combat.shieldUntil < now) p.combat.shield = 0;
  }

  // ---------------------------------------------------------------- messages

  handleMessage(player: PlayerState, msg: ClientMessage): void {
    switch (msg.t) {
      case 'move': {
        player.inputSeq = msg.seq;
        player.moveX = clamp(msg.mx, -1, 1);
        player.moveZ = clamp(msg.mz, -1, 1);
        player.heading = msg.heading;
        player.path = undefined;
        break;
      }
      case 'move_to': {
        player.inputSeq = msg.seq;
        const world = this.getWorld(player.zoneId);
        const path = findPath(world.grid, player.x, player.z, msg.x, msg.z, 2200);
        player.path = path.length > 1 ? path : undefined;
        player.pathIndex = 1;
        break;
      }
      case 'stop': {
        player.moveX = 0;
        player.moveZ = 0;
        player.path = undefined;
        break;
      }
      case 'attack':
        this.playerAttack(player, msg.targetId);
        break;
      case 'ability':
        this.playerAbility(player, msg.abilityId, msg.targetId, msg.aimX, msg.aimZ);
        break;
      case 'dodge':
        this.playerDodge(player, msg.dirX, msg.dirZ);
        break;
      case 'interact':
        this.playerInteract(player, msg.targetId, msg.kind);
        break;
      case 'equip':
        this.equip(player, msg.uid);
        break;
      case 'unequip':
        this.unequip(player, msg.slot);
        break;
      case 'use_item':
        this.useItem(player, msg.uid);
        break;
      case 'drop_item':
        this.dropItem(player, msg.uid, msg.qty);
        break;
      case 'pickup_ground':
        this.pickupGround(player, msg.groundId);
        break;
      case 'chat':
        this.chat(player, msg.channel, msg.text, msg.target);
        break;
      case 'accept_quest':
        this.acceptQuest(player, msg.questId);
        break;
      case 'turn_in_quest':
        this.turnInQuest(player, msg.questId);
        break;
      case 'craft':
        this.craft(player, msg.recipeId);
        break;
      case 'gather':
        this.gather(player, msg.nodeId);
        break;
      case 'set_pvp':
        player.pvpEnabled = msg.enabled;
        break;
      case 'respawn':
        this.respawn(player);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- combat helpers

  private playerAttack(player: PlayerState, targetId?: EntityId) {
    const now = this.elapsed + this.startTime;
    if (player.combat.health <= 0) return;
    if (isStunned(player.combat.statuses)) return;
    const stats = this.statsFor(player.id);
    const cooldown = 1000 / (stats.attackSpeed * 1.6);
    if (now - player.combat.lastAttackAt < cooldown) return;
    player.combat.lastAttackAt = now;
    player.combat.comboIndex = now < player.combat.comboExpiresAt ? player.combat.comboIndex + 1 : 0;
    player.combat.comboExpiresAt = now + 1500;

    const world = this.getWorld(player.zoneId);
    let target: EnemyRuntime | null = null;
    if (targetId !== undefined) {
      const e = world.enemies.get(targetId);
      if (e && !e.dead && distXZ(player.x, player.z, e.x, e.z) <= stats.attackRange + 0.6) target = e;
    }
    if (!target) {
      let best: EnemyRuntime | null = null;
      let bestD = stats.attackRange + 0.6;
      for (const e of world.enemies.values()) {
        if (e.dead) continue;
        const d = distXZ(player.x, player.z, e.x, e.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      target = best;
    }

    // swing animation event
    this.hooks.emitCombat(player.id, { kind: 'damage', sourceId: player.id, targetId: target?.id ?? 0, label: 'swing', atX: player.x, atY: 0, atZ: player.z });

    if (!target) return;

    player.heading = angleTo(player.x, player.z, target.x, target.z);
    const combo = 1 + Math.min(2, player.combat.comboIndex) * 0.12;
    const dmg = computeDamage({
      baseMin: stats.damageMin * combo,
      baseMax: stats.damageMax * combo,
      damageType: 'physical',
      critChance: stats.critChance,
      critDamage: stats.critDamage,
      armor: ENEMIES[target.defId]?.armor ?? 0,
      attackerLevel: player.progress.level,
      defenderLevel: target.level,
      rng: this.rng,
      bonus: 0,
    });
    const dealt = dmg.amount;
    this.applyEnemyDamage(target, player.id, dealt, dmg.crit, now);
    this.gainMomentum(player, 6);
    if (stats.lifesteal > 0) this.healPlayer(player, Math.round(dealt * stats.lifesteal), 'lifesteal');
    this.trainSkill(player, stats.weaponType === 'bow' ? 'bow' : stats.weaponType === 'staff' || stats.weaponType === 'wand' ? 'magic' : 'sword', 4);
  }

  private applyEnemyDamage(enemy: EnemyRuntime, attackerId: EntityId, amount: number, crit: boolean, now: number) {
    const world = this.getWorld(this.players.get(attackerId)?.zoneId ?? STARTING_ZONE);
    const died = world.damageEnemy(enemy, attackerId, amount, crit, now);
    this.hooks.emitCombat(attackerId, {
      kind: crit ? 'crit' : 'damage',
      sourceId: attackerId,
      targetId: enemy.id,
      amount,
      crit,
      atX: enemy.x,
      atY: 1.2,
      atZ: enemy.z,
    });
    return died;
  }

  private playerAbility(player: PlayerState, abilityId: string, targetId?: EntityId, aimX?: number, aimZ?: number) {
    const now = this.elapsed + this.startTime;
    if (player.combat.health <= 0) return;
    if (isStunned(player.combat.statuses)) return;
    const ability = ABILITIES[abilityId];
    if (!ability) return;
    if (!player.progress.unlockedAbilities.includes(abilityId)) return;
    if (player.progress.level < ability.levelReq) return;
    const cdEnd = player.combat.cooldowns[abilityId] ?? 0;
    if (now < cdEnd) return;
    if (now < player.combat.globalCooldownUntil) return;
    if (ability.resourceCost.stamina && player.combat.stamina < ability.resourceCost.stamina) return;
    if (ability.resourceCost.mana && player.combat.mana < ability.resourceCost.mana) return;

    if (ability.resourceCost.stamina) player.combat.stamina -= ability.resourceCost.stamina;
    if (ability.resourceCost.mana) player.combat.mana -= ability.resourceCost.mana;
    player.combat.cooldowns[abilityId] = now + ability.cooldown * 1000;
    player.combat.globalCooldownUntil = now + 400;
    player.combat.lastAttackAt = now;

    const world = this.getWorld(player.zoneId);
    const stats = this.statsFor(player.id);
    const scalingValue = (key: keyof typeof stats.stats | 'none'): number => {
      if (key === 'none') return 0;
      return stats.stats[key as keyof typeof stats.stats] ?? 0;
    };

    let target: EnemyRuntime | null = null;
    if (targetId !== undefined) {
      const e = world.enemies.get(targetId);
      if (e && !e.dead) target = e;
    }
    if (!target && ability.range > 0) {
      target = world.nearestEnemy(player.x, player.z, ability.range);
    }

    this.hooks.emitCombat(player.id, {
      kind: 'damage',
      sourceId: player.id,
      targetId: target?.id ?? 0,
      label: ability.animation,
      atX: player.x,
      atY: 0,
      atZ: player.z,
    });

    let didSomething = false;
    for (const effect of ability.effects) {
      switch (effect.type) {
        case 'damage': {
          const targets = this.abilityTargets(player, ability, target, aimX, aimZ);
          for (const e of targets) {
            const base = this.rng.range(effect.min, effect.max) + scalingValue(effect.scaling) * 0.6;
            const dmg = computeDamage({
              baseMin: base * damageMultiplier(player.combat.statuses),
              baseMax: base * damageMultiplier(player.combat.statuses),
              damageType: effect.damageType,
              critChance: stats.critChance,
              critDamage: stats.critDamage,
              armor: ENEMIES[e.defId]?.armor ?? 0,
              attackerLevel: player.progress.level,
              defenderLevel: e.level,
              rng: this.rng,
            });
            this.applyEnemyDamage(e, player.id, dmg.amount, dmg.crit, now);
            didSomething = true;
          }
          break;
        }
        case 'heal': {
          const amount = Math.round(this.rng.range(effect.min, effect.max) + scalingValue(effect.scaling) * 0.5);
          const healTarget = this.resolveHealTarget(player, target);
          this.healPlayer(healTarget, amount, ability.name);
          didSomething = true;
          break;
        }
        case 'dot': {
          const targets = this.abilityTargets(player, ability, target, aimX, aimZ);
          for (const e of targets) {
            const statusId: StatusId =
              effect.damageType === 'fire' ? 'burn' : effect.damageType === 'nature' ? 'poison' : effect.damageType === 'shadow' ? 'bleed' : 'burn';
            e.statuses.push(makeStatus(statusId, effect.duration, effect.dps, player.id));
          }
          didSomething = true;
          break;
        }
        case 'hot': {
          const healTarget = this.resolveHealTarget(player, target);
          const total = effect.hps * effect.duration;
          healTarget.combat.health = Math.min(healTarget.combat.maxHealth, healTarget.combat.health + total);
          this.hooks.onInventoryChanged(healTarget);
          didSomething = true;
          break;
        }
        case 'status': {
          const targets = this.abilityTargets(player, ability, target, aimX, aimZ);
          for (const e of targets) {
            if (this.rng.chance(effect.chance)) e.statuses.push(makeStatus(effect.status, effect.duration, effect.power ?? 0.4, player.id));
          }
          didSomething = true;
          break;
        }
        case 'dash': {
          const dirX = aimX !== undefined ? aimX - player.x : Math.sin(player.heading);
          const dirZ = aimZ !== undefined ? aimZ - player.z : Math.cos(player.heading);
          const len = Math.hypot(dirX, dirZ) || 1;
          const res = world.grid.moveWithCollision(player.x, player.z, (dirX / len) * effect.distance, (dirZ / len) * effect.distance, 0.55);
          player.x = res.x;
          player.z = res.z;
          player.heading = Math.atan2(dirX, dirZ);
          didSomething = true;
          break;
        }
        case 'shield': {
          player.combat.shield = (player.combat.shield ?? 0) + effect.amount;
          player.combat.shieldUntil = now + effect.duration * 1000;
          didSomething = true;
          break;
        }
        case 'taunt': {
          const targets = world.enemiesInRadius(player.x, player.z, effect.radius);
          for (const e of targets) {
            e.threat.set(player.id, (e.threat.get(player.id) ?? 0) + 100);
            e.state = 'chase';
            e.targetId = player.id;
          }
          didSomething = true;
          break;
        }
        case 'knockback': {
          const targets = this.abilityTargets(player, ability, target, aimX, aimZ);
          for (const e of targets) {
            const dx = e.x - player.x;
            const dz = e.z - player.z;
            const len = Math.hypot(dx, dz) || 1;
            const res = world.grid.moveWithCollision(e.x, e.z, (dx / len) * effect.force, (dz / len) * effect.force, 0.6);
            e.x = res.x;
            e.z = res.z;
          }
          didSomething = true;
          break;
        }
        default:
          break;
      }
    }

    if (didSomething || ability.effects.length === 0) {
      this.gainMomentum(player, ability.momentumGain ?? 8);
    }
    this.trainSkill(player, this.skillForAbility(player), 6);
  }

  private skillForAbility(player: PlayerState): SkillId {
    const stats = this.statsFor(player.id);
    if (stats.weaponType === 'bow') return 'bow';
    if (stats.weaponType === 'staff' || stats.weaponType === 'wand') return 'magic';
    if (player.progress.archetype === 'warden') return 'magic';
    return 'sword';
  }

  private resolveHealTarget(player: PlayerState, _target: EnemyRuntime | null): PlayerState {
    const party = player.partyId;
    if (party) {
      let lowest = player;
      const ratio = player.combat.health / player.combat.maxHealth;
      for (const p of this.players.values()) {
        if (p.partyId === party && p.zoneId === player.zoneId) {
          const r = p.combat.health / p.combat.maxHealth;
          if (r < ratio) {
            lowest = p;
          }
        }
      }
      return lowest;
    }
    return player;
  }

  private abilityTargets(player: PlayerState, ability: AbilityDef, target: EnemyRuntime | null, aimX?: number, aimZ?: number): EnemyRuntime[] {
    const world = this.getWorld(player.zoneId);
    if (ability.radius && ability.radius > 0) {
      const cx = aimX ?? target?.x ?? (player.x + Math.sin(player.heading) * 3);
      const cz = aimZ ?? target?.z ?? (player.z + Math.cos(player.heading) * 3);
      return world.enemiesInRadius(cx, cz, ability.radius);
    }
    if (target) return [target];
    return [];
  }

  private playerDodge(player: PlayerState, dirX?: number, dirZ?: number) {
    const now = this.elapsed + this.startTime;
    if (player.combat.health <= 0) return;
    if (now < player.combat.dodgeReadyAt) return;
    if (player.combat.stamina < 20) return;
    player.combat.stamina -= 20;
    player.combat.dodgeReadyAt = now + 900;
    player.combat.dodgeUntil = now + 260;
    player.combat.dodgeDirX = dirX ?? player.moveX;
    player.combat.dodgeDirZ = dirZ ?? player.moveZ;
    player.combat.invulnerableUntil = now + 300;
    const hasDir = Math.abs(player.combat.dodgeDirX ?? 0) > 0.01 || Math.abs(player.combat.dodgeDirZ ?? 0) > 0.01;
    if (!hasDir) {
      player.combat.dodgeDirX = Math.sin(player.heading);
      player.combat.dodgeDirZ = Math.cos(player.heading);
    }
    this.hooks.emitCombat(player.id, { kind: 'dodge', sourceId: player.id, targetId: player.id, label: 'dodge' });
    this.trainSkill(player, 'survival', 2);
  }

  private gainMomentum(player: PlayerState, amount: number) {
    const before = player.combat.momentum.points;
    player.combat.momentum.points = Math.min(player.combat.momentum.max, player.combat.momentum.points + amount * (1 + player.progress.level * 0.02));
    player.combat.momentumLastGain = this.elapsed + this.startTime;
    if (Math.floor(before / 25) !== Math.floor(player.combat.momentum.points / 25)) {
      this.hooks.emitCombat(player.id, { kind: 'momentum', sourceId: player.id, targetId: player.id, amount: Math.round(player.combat.momentum.points) });
    }
    if (player.combat.momentum.points >= player.combat.momentum.max) {
      player.combat.momentum.points = 0;
      this.hooks.emitCombat(player.id, { kind: 'momentum', sourceId: player.id, targetId: player.id, label: 'momentum_burst' });
    }
  }

  private healPlayer(player: PlayerState, amount: number, label: string) {
    if (amount <= 0) return;
    player.combat.health = Math.min(player.combat.maxHealth, player.combat.health + amount);
    this.hooks.emitCombat(player.id, { kind: 'heal', sourceId: player.id, targetId: player.id, amount, label, atX: player.x, atY: 1.4, atZ: player.z });
  }

  damagePlayer(target: PlayerState, sourceId: EntityId | undefined, amount: number, crit: boolean, label?: string, statusKind?: string): boolean {
    const now = this.elapsed + this.startTime;
    if (target.combat.health <= 0) return false;
    if (now < target.combat.invulnerableUntil) {
      this.hooks.emitCombat(target.id, { kind: 'dodge', sourceId: sourceId ?? 0, targetId: target.id, label: 'dodged' });
      if (sourceId !== undefined) {
        const src = this.players.get(sourceId);
        if (src) this.gainMomentum(src, 10);
      }
      return false;
    }
    if (target.combat.shield > 0) {
      const absorbed = Math.min(target.combat.shield, amount);
      target.combat.shield -= absorbed;
      amount -= absorbed;
      if (amount <= 0) {
        this.hooks.emitCombat(target.id, { kind: 'block', sourceId: sourceId ?? 0, targetId: target.id, amount: absorbed });
        return false;
      }
    }
    target.combat.health -= amount;
    target.combat.momentum.points = Math.max(0, target.combat.momentum.points - amount * 0.4);
    this.hooks.emitCombat(target.id, {
      kind: crit ? 'crit' : 'damage',
      sourceId: sourceId ?? 0,
      targetId: target.id,
      amount,
      label,
      atX: target.x,
      atY: 1.4,
      atZ: target.z,
    });
    if (target.combat.health <= 0) {
      this.killPlayer(target, sourceId);
      return true;
    }
    void statusKind;
    return false;
  }

  private killPlayer(target: PlayerState, sourceId?: EntityId) {
    target.combat.health = 0;
    target.deaths++;
    target.moveX = 0;
    target.moveZ = 0;
    target.path = undefined;
    const xpLost = Math.round(target.progress.xp * 0.05);
    target.progress.xp = Math.max(0, target.progress.xp - xpLost);
    target.dirty = true;
    if (sourceId !== undefined) {
      const killer = this.players.get(sourceId);
      if (killer) killer.kills++;
    }
    this.hooks.emitCombat(target.id, { kind: 'death', sourceId: sourceId ?? 0, targetId: target.id });
    this.hooks.onDeath(target, 5, xpLost);
  }

  respawn(player: PlayerState) {
    const world = this.getWorld(player.zoneId);
    const spawn = world.def.spawn;
    const c = world.grid.clampToZone(spawn.x, spawn.z);
    player.x = c.x;
    player.z = c.z;
    player.combat.health = player.combat.maxHealth;
    player.combat.mana = player.combat.maxMana;
    player.combat.stamina = player.combat.maxStamina;
    player.combat.statuses = [];
    player.combat.momentum.points = 0;
    player.combat.invulnerableUntil = this.elapsed + this.startTime + 3000;
    player.dirty = true;
    this.hooks.onRespawn(player);
  }

  onEnemyAttackPlayer(world: ZoneWorld, enemy: EnemyRuntime, player: PlayerState, amount: number, crit: boolean) {
    if (player.combat.health <= 0) return;
    this.damagePlayer(player, enemy.id, amount, crit, ENEMIES[enemy.defId]?.name);
  }

  onEnemyKilled(world: ZoneWorld, enemy: EnemyRuntime, killerId?: EntityId) {
    const def = ENEMIES[enemy.defId];
    if (!def) return;
    if (killerId !== undefined) {
      const killer = this.players.get(killerId);
      if (killer) {
        killer.kills++;
        this.awardXp(killer, Math.round(def.xp * (1 + enemy.level * 0.02)));
        killer.progress.gold += enemy.gold;
        this.checkQuestKill(killer, enemy.defId);
        killer.dirty = true;
        this.hooks.onGroundLoot(killer);
      }
      // party xp share
      const killerP = this.players.get(killerId);
      if (killerP?.partyId) {
        for (const p of this.players.values()) {
          if (p.id !== killerId && p.partyId === killerP.partyId && p.zoneId === killerP.zoneId && distXZ(p.x, p.z, enemy.x, enemy.z) < 40) {
            this.awardXp(p, Math.round(def.xp * 0.5));
          }
        }
      }
    }
    // world-first boss defeat -> world event
    if (def.boss) {
      const flagKey = `boss_${def.id}_slain`;
      if (!this.worldFlags[flagKey]) {
        this.worldFlags[flagKey] = true;
        const slayer = killerId !== undefined ? this.players.get(killerId)?.name ?? 'a Wayfarer' : 'a Wayfarer';
        const event = {
          id: `evt_${Date.now()}`,
          type: 'boss_slain',
          data: { enemyId: def.id, name: def.name, player: slayer, zone: world.id },
          at: Date.now(),
        };
        this.worldEvents.push(event);
        this.hooks.onWorldEvent(event.id, event.type, event.data, event.at);
      }
    }
  }

  // ---------------------------------------------------------------- progression

  awardXp(player: PlayerState, amount: number) {
    player.progress.xp += amount;
    player.combat.momentum.points = Math.min(player.combat.momentum.max, player.combat.momentum.points + 3);
    let leveled = false;
    while (player.progress.xp >= xpForLevel(player.progress.level)) {
      player.progress.xp -= xpForLevel(player.progress.level);
      player.progress.level++;
      player.progress.abilityPoints++;
      leveled = true;
      for (const [skill, abl] of Object.entries(ABILITIES)) {
        if (abl.levelReq === player.progress.level && abl.archetypes.includes(player.progress.archetype) && !player.progress.unlockedAbilities.includes(skill)) {
          player.progress.unlockedAbilities.push(skill);
          this.hooks.onAbilityUnlocked(player, abl);
        }
      }
    }
    if (leveled) {
      this.recalc(player);
      player.combat.health = player.combat.maxHealth;
      player.dirty = true;
    }
    this.hooks.onProgress(player);
  }

  trainSkill(player: PlayerState, skill: SkillId, xp: number) {
    player.progress.skillXp[skill] = (player.progress.skillXp[skill] ?? 0) + xp;
    let leveled = false;
    while (player.progress.skillXp[skill] >= skillXpForLevel(player.progress.skillLevels[skill])) {
      player.progress.skillXp[skill] -= skillXpForLevel(player.progress.skillLevels[skill]);
      player.progress.skillLevels[skill]++;
      leveled = true;
    }
    if (leveled) {
      this.hooks.onProgress(player);
      player.dirty = true;
    }
  }

  // ---------------------------------------------------------------- items

  private equip(player: PlayerState, uid: string) {
    const found = findItemUid(player, uid);
    if (!found) return;
    const def = ITEMS[found.item.defId];
    if (!def || !def.equipSlot) return;
    if (def.levelReq && player.progress.level < def.levelReq) return;
    if (def.skillReq && player.progress.skillLevels[def.skillReq.skill] < def.skillReq.level) return;
    const slot = def.equipSlot;
    const prev = player.equipment[slot];
    player.inventory[found.slot] = null;
    player.equipment[slot] = found.item;
    if (prev) addItemToInventory(player, prev);
    this.recalc(player);
    this.hooks.onInventoryChanged(player);
    player.dirty = true;
  }

  private unequip(player: PlayerState, slot: EquipSlot) {
    const item = player.equipment[slot];
    if (!item) return;
    if (!addItemToInventory(player, item)) return;
    player.equipment[slot] = undefined;
    this.recalc(player);
    this.hooks.onInventoryChanged(player);
    player.dirty = true;
  }

  private useItem(player: PlayerState, uid: string) {
    const now = this.elapsed + this.startTime;
    const found = findItemUid(player, uid);
    if (!found) return;
    const def = ITEMS[found.item.defId];
    if (!def || !def.consumable) return;
    const cdKey = `consumable`;
    if ((player.combat.cooldowns[cdKey] ?? 0) > now) return;
    for (const eff of def.consumable.effects) {
      if (eff.type === 'heal') player.combat.health = Math.min(player.combat.maxHealth, player.combat.health + (eff.amount ?? 0));
      if (eff.type === 'mana') player.combat.mana = Math.min(player.combat.maxMana, player.combat.mana + (eff.amount ?? 0));
      if (eff.type === 'stamina') player.combat.stamina = Math.min(player.combat.maxStamina, player.combat.stamina + (eff.amount ?? 0));
    }
    player.combat.cooldowns[cdKey] = now + def.consumable.cooldown * 1000;
    found.item.qty--;
    if (found.item.qty <= 0) player.inventory[found.slot] = null;
    this.hooks.onInventoryChanged(player);
    this.hooks.emitCombat(player.id, { kind: 'heal', sourceId: player.id, targetId: player.id, amount: 0, label: def.name });
    player.dirty = true;
  }

  private dropItem(player: PlayerState, uid: string, qty: number) {
    const found = findItemUid(player, uid);
    if (!found) return;
    const dropQty = Math.min(found.item.qty, Math.max(1, qty));
    const world = this.getWorld(player.zoneId);
    world.dropGround([{ ...found.item, qty: dropQty }], 0, player.x, player.z, this.elapsed + this.startTime, player.account);
    found.item.qty -= dropQty;
    if (found.item.qty <= 0) player.inventory[found.slot] = null;
    this.hooks.onInventoryChanged(player);
    this.hooks.onGroundLoot(player);
    player.dirty = true;
  }

  private pickupGround(player: PlayerState, groundId: EntityId) {
    const world = this.getWorld(player.zoneId);
    const idx = world.ground.findIndex((g) => g.id === groundId);
    if (idx === -1) return;
    const g = world.ground[idx];
    if (distXZ(player.x, player.z, g.x, g.z) > 4) return;
    const collected: ItemInstance[] = [];
    for (const item of g.items) {
      if (addItemToInventory(player, item)) collected.push(item);
    }
    if (g.gold > 0) {
      player.progress.gold += g.gold;
      this.hooks.onProgress(player);
    }
    world.ground.splice(idx, 1);
    this.hooks.onInventoryChanged(player);
    this.hooks.onGroundLoot(player);
    if (collected.length > 0) {
      this.checkQuestCollect(player);
      for (const c of collected) this.hooks.emitCombat(player.id, { kind: 'xp', sourceId: player.id, targetId: player.id, label: `+${c.qty} ${ITEMS[c.defId]?.name ?? c.defId}` });
    }
    if (g.gold > 0) this.hooks.emitCombat(player.id, { kind: 'xp', sourceId: player.id, targetId: player.id, label: `+${g.gold} gold` });
    player.dirty = true;
  }

  // ---------------------------------------------------------------- interaction

  private playerInteract(player: PlayerState, targetId: number, kind: 'npc' | 'node' | 'ground' | 'chest' | 'portal') {
    const world = this.getWorld(player.zoneId);
    const now = this.elapsed + this.startTime;
    if (kind === 'npc') {
      for (const n of world.def.npcs) {
        const def = NPCS[n.npcId];
        if (!def) continue;
        const pos = world.npcPositions.get(def.id) ?? { x: def.x, z: def.z };
        if (distXZ(player.x, player.z, pos.x, pos.z) < 6) {
          this.talkToNpc(player, def.id);
          return;
        }
      }
      return;
    }
    if (kind === 'ground') {
      this.pickupGround(player, targetId);
      return;
    }
    if (kind === 'portal') {
      for (const portal of world.def.portals) {
        if (distXZ(player.x, player.z, portal.x, portal.z) < portal.radius + 1.5) {
          if (portal.levelReq && player.progress.level < portal.levelReq) {
            this.hooks.emitCombat(player.id, { kind: 'xp', sourceId: player.id, targetId: player.id, label: `Requires level ${portal.levelReq}` });
            return;
          }
          this.changeZone(player, portal.targetZone, portal.targetX, portal.targetZ);
          return;
        }
      }
      return;
    }
    void now;
  }

  changeZone(player: PlayerState, zoneId: ZoneId, x: number, z: number) {
    const world = this.getWorld(zoneId);
    const c = world.grid.clampToZone(x, z);
    player.zoneId = zoneId;
    player.x = c.x;
    player.z = c.z;
    player.path = undefined;
    this.trainSkill(player, 'exploration', 10);
    this.checkQuestReach(player);
    player.dirty = true;
  }

  private talkToNpc(player: PlayerState, npcId: string) {
    const def = NPCS[npcId];
    if (!def) return;
    this.trainSkill(player, 'trading', 0);
    this.checkQuestTalk(player, npcId);
    this.hooks.onDialogue(player, npcId, def.dialogue[0]?.id ?? 'greet');
  }

  // ---------------------------------------------------------------- gathering

  private gather(player: PlayerState, nodeId: number) {
    const now = this.elapsed + this.startTime;
    const world = this.getWorld(player.zoneId);
    const node = world.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.depletedUntil > now) return;
    const def = RESOURCE_NODES[node.defId];
    if (!def) return;
    if (distXZ(player.x, player.z, node.x, node.z) > 4.5) return;
    const skill = player.progress.skillLevels[def.skill];
    if (skill < def.levelReq) {
      this.hooks.onGatheringResult(player, nodeId, false, [], 0);
      return;
    }
    // require the right tool for mining
    if (def.skill === 'mining' && !this.hasTool(player, 'mining')) {
      this.hooks.onGatheringResult(player, nodeId, false, [], 0);
      return;
    }
    const result = gatherYield(node.defId, skill, this.rng);
    if (result.items.length === 0) {
      this.hooks.onGatheringResult(player, nodeId, false, [], 0);
      return;
    }
    for (const item of result.items) addItemToInventory(player, item);
    node.depletedUntil = now + def.respawnSeconds * 1000;
    this.trainSkill(player, def.skill, result.xp);
    this.trainSkill(player, 'survival', 2);
    this.checkQuestCollect(player);
    this.checkQuestGather(player, def.skill);
    this.hooks.onGatheringResult(player, nodeId, true, result.items, result.xp);
    this.hooks.onInventoryChanged(player);
    player.dirty = true;
  }

  private hasTool(player: PlayerState, skill: 'mining' | 'woodcutting' | 'fishing'): boolean {
    for (const slot of player.inventory) {
      if (!slot) continue;
      const def = ITEMS[slot.defId];
      if (def?.tool?.skill === skill) return true;
    }
    for (const eq of Object.values(player.equipment)) {
      if (!eq) continue;
      const def = ITEMS[eq.defId];
      if (def?.tool?.skill === skill) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- crafting

  private craft(player: PlayerState, recipeId: string) {
    const recipe = RECIPES[recipeId];
    if (!recipe) return;
    const skillLevel = player.progress.skillLevels[recipe.skill];
    if (skillLevel < recipe.skillLevel) {
      this.hooks.onCraftResult(player, false, recipeId, [], 0);
      return;
    }
    for (const input of recipe.inputs) {
      if (countItem(player, input.itemId) < input.qty) {
        this.hooks.onCraftResult(player, false, recipeId, [], 0);
        return;
      }
    }
    for (const input of recipe.inputs) removeItem(player, input.itemId, input.qty);
    const outputs: ItemInstance[] = [];
    for (const out of recipe.outputs) {
      const item: ItemInstance = { uid: `c${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`, defId: out.itemId, qty: out.qty };
      addItemToInventory(player, item);
      outputs.push(item);
    }
    this.trainSkill(player, recipe.skill, recipe.xp);
    this.checkQuestCraft(player, recipeId);
    this.hooks.onCraftResult(player, true, recipeId, outputs, recipe.xp);
    this.hooks.onInventoryChanged(player);
    player.dirty = true;
  }

  // ---------------------------------------------------------------- chat

  private chat(player: PlayerState, channel: ChatChannel, text: string, _target?: string) {
    const clean = text.slice(0, MAX_CHAT_LEN).replace(/[<>]/g, '');
    if (!clean.trim()) return;
    const now = Date.now();
    const times = this.chatRate.get(player.account) ?? [];
    const recent = times.filter((t) => now - t < 5000);
    if (recent.length >= 6) return;
    recent.push(now);
    this.chatRate.set(player.account, recent);
    this.hooks.onChat(player, channel, clean);
    void _target;
  }

  // ---------------------------------------------------------------- quests

  acceptQuest(player: PlayerState, questId: string) {
    const def = QUESTS[questId];
    if (!def) return;
    if (player.progress.level < def.levelReq) return;
    const existing = player.quests.find((q) => q.questId === questId);
    if (existing && existing.status === 'active') return;
    if (existing && existing.status === 'turned_in' && !def.repeatable) return;
    for (const pre of def.prerequisites) {
      const p = player.quests.find((q) => q.questId === pre);
      if (!p || p.status !== 'turned_in') return;
    }
    const state: QuestState = { questId, stage: 0, progress: def.stages[0].objectives.map(() => 0), status: 'active' };
    const idx = player.quests.findIndex((q) => q.questId === questId);
    if (idx >= 0) player.quests[idx] = state;
    else player.quests.push(state);
    this.hooks.onQuestUpdate(player, questId);
    player.dirty = true;
  }

  turnInQuest(player: PlayerState, questId: string) {
    const def = QUESTS[questId];
    const state = player.quests.find((q) => q.questId === questId);
    if (!def || !state || state.status !== 'active') return;
    const stage = def.stages[state.stage];
    if (!this.stageComplete(player, state, stage.objectives)) return;
    // consume collect/deliver items
    for (const obj of stage.objectives) {
      if (obj.type === 'collect' && obj.consume !== false) removeItem(player, obj.itemId, obj.count);
      if (obj.type === 'deliver') removeItem(player, obj.itemId, obj.count);
    }
    if (state.stage < def.stages.length - 1) {
      state.stage++;
      state.progress = def.stages[state.stage].objectives.map(() => 0);
      this.hooks.onQuestUpdate(player);
      player.dirty = true;
      return;
    }
    state.status = 'turned_in';
    this.awardXp(player, def.rewards.xp);
    player.progress.gold += def.rewards.gold;
    for (const item of def.rewards.items ?? []) {
      addItemToInventory(player, { uid: `q${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`, defId: item.itemId, qty: item.qty });
    }
    for (const rep of def.rewards.reputation ?? []) {
      player.reputation[rep.faction] = (player.reputation[rep.faction] ?? 0) + rep.amount;
    }
    this.hooks.onQuestUpdate(player, undefined, questId);
    this.hooks.onInventoryChanged(player);
    this.hooks.onProgress(player);
    player.dirty = true;
  }

  private stageComplete(player: PlayerState, state: QuestState, objectives: QuestObjective[]): boolean {
    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i];
      const progress = state.progress[i] ?? 0;
      switch (obj.type) {
        case 'collect':
        case 'deliver':
          if (countItem(player, obj.itemId) < obj.count) return false;
          break;
        case 'kill':
        case 'gather':
        case 'craft':
          if (progress < obj.count) return false;
          break;
        case 'talk':
          if (progress < 1) return false;
          break;
        case 'reach':
          break;
      }
    }
    return true;
  }

  private advanceQuest(player: PlayerState, quest: QuestState, defs: QuestDef, stageIdx: number, objectiveIdx: number, amount = 1, absolute = false) {
    const stage = defs.stages[stageIdx];
    if (!stage) return;
    const obj = stage.objectives[objectiveIdx];
    if (!obj) return;
    if (absolute) quest.progress[objectiveIdx] = Math.max(quest.progress[objectiveIdx] ?? 0, amount);
    else quest.progress[objectiveIdx] = (quest.progress[objectiveIdx] ?? 0) + amount;
    this.hooks.onQuestUpdate(player);
    player.dirty = true;
  }

  private checkQuestKill(player: PlayerState, enemyId: string) {
    for (const quest of player.quests) {
      if (quest.status !== 'active') continue;
      const def = QUESTS[quest.questId];
      if (!def) continue;
      const stage = def.stages[quest.stage];
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'kill' && obj.enemyId === enemyId) this.advanceQuest(player, quest, def, quest.stage, i, 1);
      });
    }
  }

  private checkQuestCollect(player: PlayerState) {
    for (const quest of player.quests) {
      if (quest.status !== 'active') continue;
      const def = QUESTS[quest.questId];
      if (!def) continue;
      const stage = def.stages[quest.stage];
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'collect') this.advanceQuest(player, quest, def, quest.stage, i, countItem(player, obj.itemId), true);
      });
    }
  }

  private checkQuestTalk(player: PlayerState, npcId: string) {
    for (const quest of player.quests) {
      if (quest.status !== 'active') continue;
      const def = QUESTS[quest.questId];
      if (!def) continue;
      const stage = def.stages[quest.stage];
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'talk' && obj.npcId === npcId) this.advanceQuest(player, quest, def, quest.stage, i, 1);
      });
    }
  }

  private checkQuestReach(player: PlayerState) {
    for (const quest of player.quests) {
      if (quest.status !== 'active') continue;
      const def = QUESTS[quest.questId];
      if (!def) continue;
      const stage = def.stages[quest.stage];
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'reach' && obj.zoneId === player.zoneId && distXZ(player.x, player.z, obj.x, obj.z) <= obj.radius) {
          this.advanceQuest(player, quest, def, quest.stage, i, 1);
        }
      });
    }
  }

  private checkQuestGather(player: PlayerState, skill: SkillId) {
    for (const quest of player.quests) {
      if (quest.status !== 'active') continue;
      const def = QUESTS[quest.questId];
      if (!def) continue;
      const stage = def.stages[quest.stage];
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'gather' && obj.skill === skill) this.advanceQuest(player, quest, def, quest.stage, i, 1);
      });
    }
  }

  private checkQuestCraft(player: PlayerState, recipeId: string) {
    for (const quest of player.quests) {
      if (quest.status !== 'active') continue;
      const def = QUESTS[quest.questId];
      if (!def) continue;
      const stage = def.stages[quest.stage];
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'craft' && obj.recipeId === recipeId) this.advanceQuest(player, quest, def, quest.stage, i, 1);
      });
    }
  }

  // ---------------------------------------------------------------- helpers

  registerGroundPickupCheck(player: PlayerState) {
    void player;
  }

  getFlags() {
    return this.worldFlags;
  }

  getWorldEvents() {
    return this.worldEvents;
  }

  setFlags(flags: Record<string, number | string | boolean>) {
    this.worldFlags = flags;
  }

  setWorldEvents(events: { id: string; type: string; data: Record<string, unknown>; at: number }[]) {
    this.worldEvents = events;
  }
}
