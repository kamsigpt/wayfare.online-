import type {
  AbilityDef,
  ArchetypeId,
  EnemyRuntime,
  EntityId,
  EquipSlot,
  GroundItem,
  ItemInstance,
  NPCDef,
  PlayerAppearance,
  PlayerState,
  QuestState,
  ResourceNodeInstance,
  SkillId,
  StatusEffect,
  ZoneId,
} from './types.js';

export type ClientMessage =
  | { t: 'hello'; protocol: number; name?: string }
  | { t: 'login'; account: string; password: string }
  | { t: 'register'; account: string; password: string; characterName: string; archetype: ArchetypeId }
  | { t: 'enter_world' }
  | { t: 'create_character'; name: string; archetype: ArchetypeId; appearance: PlayerAppearance }
  | { t: 'move'; seq: number; mx: number; mz: number; heading: number; dash?: boolean }
  | { t: 'move_to'; seq: number; x: number; z: number }
  | { t: 'stop'; seq: number }
  | { t: 'attack'; seq: number; targetId?: EntityId }
  | { t: 'ability'; seq: number; abilityId: string; targetId?: EntityId; aimX?: number; aimZ?: number }
  | { t: 'dodge'; seq: number; dirX?: number; dirZ?: number }
  | { t: 'interact'; targetId: number; kind: 'npc' | 'node' | 'ground' | 'chest' | 'portal' }
  | { t: 'equip'; uid: string; slot?: EquipSlot }
  | { t: 'unequip'; slot: EquipSlot }
  | { t: 'use_item'; uid: string }
  | { t: 'drop_item'; uid: string; qty: number }
  | { t: 'pickup_ground'; groundId: EntityId }
  | { t: 'chat'; channel: ChatChannel; text: string; target?: string }
  | { t: 'accept_quest'; questId: string }
  | { t: 'turn_in_quest'; questId: string }
  | { t: 'craft'; recipeId: string }
  | { t: 'gather'; nodeId: number }
  | { t: 'select_target'; targetId: EntityId | null }
  | { t: 'ping'; id: number }
  | { t: 'set_pvp'; enabled: boolean }
  | { t: 'respawn' }
  | { t: 'unload' };

export type ChatChannel = 'world' | 'local' | 'party' | 'guild' | 'system' | 'combat';

export interface SnapshotEntity {
  id: EntityId;
  kind: 'player' | 'enemy' | 'npc' | 'node' | 'ground' | 'chest' | 'portal';
  x: number;
  y: number;
  z: number;
  h: number;
  hp?: number;
  mhp?: number;
  state?: string;
  anim?: string;
  flash?: boolean;
}

export interface PlayerSnapshot extends SnapshotEntity {
  kind: 'player';
  name: string;
  level: number;
  archetype: ArchetypeId;
  moving: boolean;
  health: number;
  maxHealth: number;
  mana: number;
  stamina: number;
  momentum: number;
  pvp: boolean;
  colors: PlayerAppearance;
  statuses: { id: string; remaining: number }[];
}

export interface EnemySnapshot extends SnapshotEntity {
  kind: 'enemy';
  defId: string;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  state: string;
  elite?: boolean;
  boss?: boolean;
}

export interface ServerMessageBase {
  t: string;
}

export type ServerMessage =
  | { t: 'welcome'; protocol: number; serverTime: number; characters: CharacterSummary[] }
  | { t: 'login_ok'; account: string; characters: CharacterSummary[] }
  | { t: 'error'; code: string; message: string }
  | { t: 'enter'; player: SerializedPlayer; abilities: AbilityDef[]; serverTime: number; dayTime: number }
  | {
      t: 'snapshot';
      tick: number;
      time: number;
      you: SerializedPlayer;
      entities: SnapshotEntity[];
      removed: number[];
      dayTime: number;
      events: SimEvent[];
    }
  | { t: 'zone_change'; zoneId: ZoneId; x: number; z: number; you: SerializedPlayer }
  | { t: 'combat'; events: CombatEvent[] }
  | { t: 'loot'; ground: GroundItem[] }
  | { t: 'chat'; id: number; channel: ChatChannel; from: string; text: string; at: number }
  | { t: 'quest_update'; quests: QuestState[]; accepted?: string; turnedIn?: string }
  | { t: 'inventory'; inventory: (ItemInstance | null)[]; equipment: Partial<Record<EquipSlot, ItemInstance>>; bank?: (ItemInstance | null)[]; gold: number }
  | { t: 'progress'; xp: number; level: number; skillXp: Partial<Record<SkillId, number>>; skillLevels: Partial<Record<SkillId, number>>; unlocked?: string[]; gold: number }
  | { t: 'ability_unlocked'; ability: AbilityDef }
  | { t: 'gathering_result'; nodeId: number; success: boolean; items: ItemInstance[]; xp: number }
  | { t: 'craft_result'; success: boolean; recipeId: string; items: ItemInstance[]; xp: number }
  | { t: 'death'; respawnIn: number; xpLost: number }
  | { t: 'respawned'; you: SerializedPlayer }
  | { t: 'npc_dialogue'; npcId: string; npc: NPCDef; dialogueId: string; text: string; options: { text: string; next?: string; action?: string }[] }
  | { t: 'pvp_change'; enabled: boolean }
  | { t: 'pong'; id: number; serverTime: number }
  | { t: 'world_event'; id: string; type: string; data: Record<string, unknown>; at: number }
  | { t: 'player_joined'; name: string; level: number }
  | { t: 'player_left'; name: string }
  | { t: 'knockback'; id: EntityId; x: number; z: number };

export interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  archetype: ArchetypeId;
  zoneId: ZoneId;
  playSeconds: number;
}

export interface SerializedPlayer {
  id: EntityId;
  name: string;
  zoneId: ZoneId;
  x: number;
  y: number;
  z: number;
  heading: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  momentum: number;
  momentumMax: number;
  cooldowns: Record<string, number>;
  level: number;
  xp: number;
  xpToLevel: number;
  gold: number;
  inventory: (ItemInstance | null)[];
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  quests: QuestState[];
  abilities: string[];
  stats: Record<string, number>;
  skillLevels: Record<string, number>;
  skillXp: Record<string, number>;
  skillXpToLevel: Record<string, number>;
  reputation: Record<string, number>;
  pvpEnabled: boolean;
  dead: boolean;
  appearance: PlayerAppearance;
  archetype: ArchetypeId;
  statuses: StatusEffect[];
  inputSeq: number;
  inventorySize: number;
}

export interface CombatEvent {
  kind: 'damage' | 'heal' | 'miss' | 'crit' | 'dodge' | 'block' | 'death' | 'xp' | 'momentum' | 'status';
  sourceId: EntityId;
  targetId: EntityId;
  amount?: number;
  type?: string;
  label?: string;
  crit?: boolean;
  atX?: number;
  atY?: number;
  atZ?: number;
}

export interface SimEvent {
  kind: 'combat' | 'zone' | 'death' | 'spawn' | 'despawn' | 'loot' | 'quest' | 'world';
  data: Record<string, unknown>;
}

export interface WorldSnapshot {
  zoneId: ZoneId;
  enemies: EnemyRuntime[];
  nodes: ResourceNodeInstance[];
  ground: GroundItem[];
  dayTime: number;
}

export const PROTOCOL_VERSION = 1;
