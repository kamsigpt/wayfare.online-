export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 10;
export const INTEREST_RADIUS = 80;
export const MAX_CHAT_LEN = 200;
export const CHAT_RATE_PER_5S = 5;
export const MAX_PLAYERS_PER_ZONE = 40;
export const INVENTORY_SIZE = 30;
export const BANK_SIZE = 60;
export const STARTING_ZONE = 'elaris';
export const STARTING_POS = { x: 0, y: 0, z: 4 };
export const DAY_LENGTH_SECONDS = 1200;
export const VIEW_DISTANCE_LOW = 45;
export const VIEW_DISTANCE_MEDIUM = 70;
export const VIEW_DISTANCE_HIGH = 110;
export const PVP_SAFE_ZONES = new Set(['elaris']);
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export type Rarity = (typeof RARITY_ORDER)[number];

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#b8b8b8',
  uncommon: '#4caf50',
  rare: '#42a5f5',
  epic: '#ab47bc',
  legendary: '#ffb300',
};

export const XP_CURVE = (level: number): number => Math.floor(120 * Math.pow(level, 1.55));

export const SKILL_XP_CURVE = (level: number): number => Math.floor(60 * Math.pow(level, 1.4));
