import { Rng } from '../math.js';
import type { DamageType, StatusEffect, StatusId } from '../types.js';

export interface DamageInput {
  baseMin: number;
  baseMax: number;
  damageType: DamageType;
  critChance: number;
  critDamage: number;
  armor: number;
  block?: number;
  attackerLevel: number;
  defenderLevel: number;
  rng: Rng;
  bonus?: number;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
  blocked: boolean;
  type: DamageType;
}

export function computeDamage(input: DamageInput): DamageResult {
  const { rng } = input;
  const roll = rng.range(input.baseMin, input.baseMax) + (input.bonus ?? 0);
  const levelFactor = 1; // deterministic scaling hook
  let amount = roll * levelFactor;
  const crit = rng.chance(Math.min(0.75, input.critChance));
  if (crit) amount *= input.critDamage;
  const mitigation = 100 / (100 + Math.max(0, input.armor) * 2.2);
  amount *= mitigation;
  let blocked = false;
  if (input.block && input.block > 0 && rng.chance(input.block)) {
    amount *= 0.4;
    blocked = true;
  }
  amount = Math.max(1, Math.round(amount));
  return { amount, crit, blocked, type: input.damageType };
}

export const STATUS_DEFS: Record<StatusId, { name: string; color: string; detrimental: boolean }> = {
  stun: { name: 'Stunned', color: '#ffd54f', detrimental: true },
  slow: { name: 'Slowed', color: '#90caf9', detrimental: true },
  root: { name: 'Rooted', color: '#b0bec5', detrimental: true },
  burn: { name: 'Burning', color: '#ff7043', detrimental: true },
  poison: { name: 'Poisoned', color: '#8bc34a', detrimental: true },
  bleed: { name: 'Bleeding', color: '#e57373', detrimental: true },
  frozen: { name: 'Frozen', color: '#81d4fa', detrimental: true },
  haste: { name: 'Hastened', color: '#fff176', detrimental: false },
  weaken: { name: 'Weakened', color: '#a1887f', detrimental: true },
  invulnerable: { name: 'Invulnerable', color: '#e1bee7', detrimental: false },
  stealth: { name: 'Stealthed', color: '#b39ddb', detrimental: false },
};

export function makeStatus(id: StatusId, duration: number, power = 1, sourceId?: number): StatusEffect {
  return { id, name: STATUS_DEFS[id].name, duration, remaining: duration, power, sourceId };
}

export function tickStatuses(statuses: StatusEffect[], dt: number): StatusEffect[] {
  for (const s of statuses) s.remaining -= dt;
  return statuses.filter((s) => s.remaining > 0);
}

export function movementMultiplier(statuses: StatusEffect[]): number {
  let m = 1;
  for (const s of statuses) {
    if (s.id === 'slow') m *= 1 - Math.min(0.7, s.power);
    if (s.id === 'root' || s.id === 'stun' || s.id === 'frozen') return 0;
    if (s.id === 'haste') m *= 1 + s.power;
  }
  return m;
}

export function damageMultiplier(statuses: StatusEffect[]): number {
  let m = 1;
  for (const s of statuses) {
    if (s.id === 'weaken') m *= 1 - Math.min(0.5, s.power);
  }
  return m;
}

export function isStunned(statuses: StatusEffect[]): boolean {
  return statuses.some((s) => s.id === 'stun' || s.id === 'frozen');
}
