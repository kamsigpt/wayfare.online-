import { ITEMS } from '../content/items.js';
import { Rng } from '../math.js';
import type { Rarity } from '../constants.js';
import type { EnemyDef, ItemInstance, ItemModifier } from '../types.js';

let uidCounter = 1;
export function nextUid(): string {
  return `i${(uidCounter++).toString(36)}${Date.now().toString(36).slice(-4)}`;
}

export function makeItem(defId: string, qty = 1): ItemInstance {
  return { uid: nextUid(), defId, qty };
}

const MODIFIER_POOL: { key: keyof ItemModifier; roll: (r: Rng, tier: number) => Partial<ItemModifier> }[] = [
  { key: 'critChance', roll: (r) => ({ critChance: r.range(0.03, 0.09) }) },
  { key: 'critDamage', roll: (r) => ({ critDamage: r.range(0.15, 0.45) }) },
  { key: 'moveSpeed', roll: (r) => ({ moveSpeed: r.range(0.03, 0.1) }) },
  { key: 'attackSpeed', roll: (r) => ({ attackSpeed: r.range(0.04, 0.12) }) },
  { key: 'lifesteal', roll: (r) => ({ lifesteal: r.range(0.02, 0.06) }) },
  { key: 'armorBonus', roll: (r) => ({ armorBonus: Math.round(r.range(2, 8)) }) },
  { key: 'maxHealth', roll: (r) => ({ maxHealth: Math.round(r.range(15, 45)) }) },
  { key: 'maxMana', roll: (r) => ({ maxMana: Math.round(r.range(10, 30)) }) },
  { key: 'damageBonus', roll: (r) => ({ damageBonus: Math.round(r.range(1, 4)) }) },
  {
    key: 'stat',
    roll: (r) => {
      const stat = r.pick(['strength', 'dexterity', 'intelligence', 'vitality', 'spirit'] as const);
      return { stat: { [stat]: r.int(1, 3) } };
    },
  },
  {
    key: 'proc',
    roll: (r) => ({
      proc: {
        effect: r.pick(['burn', 'slow', 'poison', 'bleed', 'chain']),
        chance: r.range(0.08, 0.25),
        power: Math.round(r.range(3, 9)),
      },
    }),
  },
];

const RARITY_MOD_COUNT: Record<Rarity, [number, number]> = {
  common: [0, 0],
  uncommon: [1, 1],
  rare: [1, 2],
  epic: [2, 3],
  legendary: [3, 4],
};

export function rollModifiers(rarity: Rarity, rng: Rng): ItemModifier[] {
  const [lo, hi] = RARITY_MOD_COUNT[rarity] ?? [0, 0];
  const count = rng.int(lo, hi);
  const mods: ItemModifier[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const entry = rng.pick(MODIFIER_POOL);
    if (entry.key === 'stat') {
      mods.push(entry.roll(rng, 0));
      continue;
    }
    if (used.has(entry.key)) continue;
    used.add(entry.key);
    mods.push(entry.roll(rng, 0));
  }
  return mods;
}

const RARITY_WEIGHTS: { rarity: Rarity; weight: number }[] = [
  { rarity: 'common', weight: 100 },
  { rarity: 'uncommon', weight: 45 },
  { rarity: 'rare', weight: 18 },
  { rarity: 'epic', weight: 5 },
  { rarity: 'legendary', weight: 1 },
];

export function rollRarity(luckBonus: number, forced?: Rarity): Rarity {
  if (forced) return forced;
  const rng = new Rng((Math.random() * 0xffffffff) >>> 0);
  const weights = RARITY_WEIGHTS.map((w) => ({ rarity: w.rarity, weight: w.weight * (w.rarity === 'common' ? 1 : 1 + luckBonus) }));
  return rng.weighted(weights).rarity;
}

export interface LootRoll {
  items: ItemInstance[];
  gold: number;
}

export function generateLoot(def: EnemyDef, rng: Rng, luckBonus = 0): LootRoll {
  const items: ItemInstance[] = [];
  let gold = rng.int(def.gold.min, def.gold.max);
  for (const entry of def.lootTable) {
    const chance = Math.min(1, entry.chance * (1 + luckBonus * 0.5));
    if (entry.itemId === 'gold') {
      const qty = rng.int(entry.qtyMin ?? 1, entry.qtyMax ?? entry.qtyMin ?? 1);
      gold += qty;
      continue;
    }
    const idef = ITEMS[entry.itemId];
    if (!idef) continue;
    if (!rng.chance(chance)) continue;
    const qty = rng.int(entry.qtyMin ?? 1, entry.qtyMax ?? entry.qtyMin ?? 1);
    const item = makeItem(entry.itemId, qty);
    if (entry.rarityOverride) {
      item.rarity = entry.rarityOverride;
      item.modifiers = rollModifiers(entry.rarityOverride, rng);
    } else if ((def.boss || def.elite) && idef.kind === 'weapon') {
      item.rarity = 'rare';
      item.modifiers = rollModifiers('rare', rng);
    } else if ((def.boss || def.elite) && Math.random() < 0.25) {
      item.rarity = rollRarity(luckBonus);
      if (item.rarity !== 'common') item.modifiers = rollModifiers(item.rarity, rng);
    }
    items.push(item);
  }
  return { items, gold };
}

export function itemTotalValue(item: ItemInstance): number {
  const def = ITEMS[item.defId];
  if (!def) return 0;
  let v = def.value * item.qty;
  if (item.rarity && item.rarity !== 'common') {
    const mult: Record<Rarity, number> = { common: 1, uncommon: 1.6, rare: 2.8, epic: 5, legendary: 9 };
    v *= mult[item.rarity];
  }
  v += (item.modifiers?.length ?? 0) * def.value * 0.8;
  return Math.round(v);
}
