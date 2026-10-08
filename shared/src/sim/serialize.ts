import { SKILL_XP_CURVE, XP_CURVE } from '../constants.js';
import { computeStats, skillXpForLevel, xpForLevel } from './stats.js';
import type { PlayerState, SkillId } from '../types.js';
import type { SerializedPlayer } from '../protocol.js';

export function serializePlayer(p: PlayerState): SerializedPlayer {
  const d = computeStats(p.progress.level, p.progress.archetype, p.equipment, p.progress.skillLevels);
  const skillXpToLevel: Record<string, number> = {};
  for (const [k, lvl] of Object.entries(p.progress.skillLevels)) {
    skillXpToLevel[k] = skillXpForLevel(lvl);
  }
  return {
    id: p.id,
    name: p.name,
    zoneId: p.zoneId,
    x: p.x,
    y: p.y,
    z: p.z,
    heading: p.heading,
    health: p.combat.health,
    maxHealth: d.maxHealth,
    mana: p.combat.mana,
    maxMana: d.maxMana,
    stamina: p.combat.stamina,
    maxStamina: d.maxStamina,
    momentum: p.combat.momentum.points,
    momentumMax: p.combat.momentum.max,
    cooldowns: { ...p.combat.cooldowns },
    level: p.progress.level,
    xp: p.progress.xp,
    xpToLevel: xpForLevel(p.progress.level),
    gold: p.progress.gold,
    inventory: p.inventory,
    equipment: p.equipment,
    quests: p.quests,
    abilities: p.progress.unlockedAbilities,
    stats: { ...p.stats },
    skillLevels: { ...p.progress.skillLevels },
    skillXp: { ...p.progress.skillXp },
    skillXpToLevel,
    reputation: { ...p.reputation },
    pvpEnabled: p.pvpEnabled,
    dead: p.combat.health <= 0,
    appearance: p.appearance,
    archetype: p.progress.archetype,
    statuses: p.combat.statuses,
    inputSeq: p.inputSeq,
    inventorySize: p.inventory.length,
  };
}

export { XP_CURVE, SKILL_XP_CURVE, skillXpForLevel, xpForLevel };
export type { SkillId };
