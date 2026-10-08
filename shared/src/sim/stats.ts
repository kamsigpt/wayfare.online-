import { ARCHETYPES } from '../content/abilities.js';
import { ITEMS } from '../content/items.js';
import { XP_CURVE, SKILL_XP_CURVE } from '../constants.js';
import type { PlayerState, StatBlock, ItemInstance, EquipSlot, SkillId } from '../types.js';

export interface DerivedStats {
  maxHealth: number;
  maxMana: number;
  maxStamina: number;
  stats: StatBlock;
  armor: number;
  damageMin: number;
  damageMax: number;
  attackSpeed: number;
  attackRange: number;
  critChance: number;
  critDamage: number;
  moveSpeed: number;
  lifesteal: number;
  block: number;
  weaponType: string | null;
}

export function baseStatsFor(level: number, archetype: string): StatBlock {
  const def = ARCHETYPES[archetype as keyof typeof ARCHETYPES] ?? ARCHETYPES.wayfarer;
  const hpBonus = Math.floor((level - 1) * (def.health / 10));
  void hpBonus;
  const perLevel: StatBlock = { strength: 1, dexterity: 1, intelligence: 1, vitality: 1, spirit: 1 };
  const s: StatBlock = { ...def.stats };
  for (let i = 1; i < level; i++) {
    s.strength += perLevel.strength;
    s.dexterity += perLevel.dexterity;
    s.intelligence += perLevel.intelligence;
    s.vitality += perLevel.vitality;
    s.spirit += perLevel.spirit;
  }
  return s;
}

export function computeStats(
  level: number,
  archetype: string,
  equipment: Partial<Record<EquipSlot, ItemInstance>>,
  skillLevels: Record<SkillId, number>,
): DerivedStats {
  const def = ARCHETYPES[archetype as keyof typeof ARCHETYPES] ?? ARCHETYPES.wayfarer;
  const stats = baseStatsFor(level, archetype);
  let armor = 0;
  let damageMin = 2;
  let damageMax = 4;
  let attackSpeed = 1;
  let attackRange = 2.2;
  let critChance = 0.05;
  let critDamage = 1.5;
  let moveSpeed = 5;
  let lifesteal = 0;
  let block = 0;
  let weaponType: string | null = null;
  let maxHealthBonus = 0;
  let maxManaBonus = 0;

  for (const item of Object.values(equipment)) {
    if (!item) continue;
    const d = ITEMS[item.defId];
    if (!d) continue;
    if (d.stats) {
      stats.strength += d.stats.strength ?? 0;
      stats.dexterity += d.stats.dexterity ?? 0;
      stats.intelligence += d.stats.intelligence ?? 0;
      stats.vitality += d.stats.vitality ?? 0;
      stats.spirit += d.stats.spirit ?? 0;
    }
    if (d.armor) armor += d.armor;
    if (d.block) block += d.block;
    if (d.damage) {
      damageMin = d.damage.min;
      damageMax = d.damage.max;
      attackSpeed = d.attackSpeed ?? 1;
      attackRange = d.range ?? 2.2;
      weaponType = d.weaponType ?? null;
    }
    for (const m of item.modifiers ?? d.modifiers ?? []) {
      if (m.stat) {
        stats.strength += m.stat.strength ?? 0;
        stats.dexterity += m.stat.dexterity ?? 0;
        stats.intelligence += m.stat.intelligence ?? 0;
        stats.vitality += m.stat.vitality ?? 0;
        stats.spirit += m.stat.spirit ?? 0;
      }
      critChance += m.critChance ?? 0;
      critDamage += m.critDamage ?? 0;
      moveSpeed *= 1 + (m.moveSpeed ?? 0);
      attackSpeed *= 1 + (m.attackSpeed ?? 0);
      lifesteal += m.lifesteal ?? 0;
      armor += m.armorBonus ?? 0;
      maxHealthBonus += m.maxHealth ?? 0;
      maxManaBonus += m.maxMana ?? 0;
      damageMin += m.damageBonus ?? 0;
      damageMax += m.damageBonus ?? 0;
    }
  }

  const swordLvl = skillLevels.sword ?? 1;
  const bowLvl = skillLevels.bow ?? 1;
  const magicLvl = skillLevels.magic ?? 1;
  if (weaponType === 'sword' || weaponType === 'axe' || weaponType === 'hammer' || weaponType === 'dagger') {
    const bonus = 1 + (swordLvl - 1) * 0.02;
    damageMin = Math.round(damageMin * bonus);
    damageMax = Math.round(damageMax * bonus);
  } else if (weaponType === 'bow') {
    const bonus = 1 + (bowLvl - 1) * 0.02;
    damageMin = Math.round(damageMin * bonus);
    damageMax = Math.round(damageMax * bonus);
  } else if (weaponType === 'staff' || weaponType === 'wand') {
    const bonus = 1 + (magicLvl - 1) * 0.02;
    damageMin = Math.round(damageMin * bonus);
    damageMax = Math.round(damageMax * bonus);
  }

  armor += Math.floor(stats.vitality * 0.5);
  const maxHealth = Math.round(def.health + stats.vitality * 8 + (level - 1) * 10 + maxHealthBonus);
  const maxMana = Math.round(def.mana + stats.intelligence * 5 + stats.spirit * 3 + (level - 1) * 4 + maxManaBonus);
  const maxStamina = Math.round(def.stamina + stats.dexterity * 2 + (level - 1) * 2);

  return {
    maxHealth,
    maxMana,
    maxStamina,
    stats,
    armor,
    damageMin,
    damageMax,
    attackSpeed,
    attackRange,
    critChance: Math.min(0.6, critChance + stats.dexterity * 0.004),
    critDamage: 1.5 + critDamage - 1.5,
    moveSpeed,
    lifesteal,
    block: Math.min(0.6, block),
    weaponType,
  };
}

export function xpForLevel(level: number): number {
  return XP_CURVE(level);
}

export function skillXpForLevel(level: number): number {
  return SKILL_XP_CURVE(level);
}

export function addItemToInventory(player: PlayerState, item: ItemInstance): boolean {
  const def = ITEMS[item.defId];
  if (!def) return false;
  if (def.stackable) {
    const existing = player.inventory.find((s) => s && s.defId === item.defId && s.qty < def.maxStack);
    if (existing) {
      const space = def.maxStack - existing.qty;
      const add = Math.min(space, item.qty);
      existing.qty += add;
      item.qty -= add;
      if (item.qty <= 0) {
        player.dirty = true;
        return true;
      }
    }
  }
  const idx = player.inventory.findIndex((s) => s === null);
  if (idx === -1) return false;
  player.inventory[idx] = item;
  player.dirty = true;
  return true;
}

export function countItem(player: PlayerState, defId: string): number {
  let n = 0;
  for (const s of player.inventory) if (s && s.defId === defId) n += s.qty;
  return n;
}

export function removeItem(player: PlayerState, defId: string, qty: number): boolean {
  let remaining = qty;
  for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
    const s = player.inventory[i];
    if (s && s.defId === defId) {
      const take = Math.min(s.qty, remaining);
      s.qty -= take;
      remaining -= take;
      if (s.qty <= 0) player.inventory[i] = null;
    }
  }
  if (remaining > 0) return false;
  player.dirty = true;
  return true;
}

export function findItemUid(player: PlayerState, uid: string): { slot: number; item: ItemInstance } | null {
  for (let i = 0; i < player.inventory.length; i++) {
    const s = player.inventory[i];
    if (s && s.uid === uid) return { slot: i, item: s };
  }
  return null;
}
