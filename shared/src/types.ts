import type { Rarity } from './constants.js';

export type ZoneId = string;
export type EntityId = number;

export type ArchetypeId = 'wayfarer' | 'vanguard' | 'strider' | 'arcanist' | 'warden' | 'reaver';

export type WeaponType =
  | 'sword'
  | 'greatsword'
  | 'dagger'
  | 'bow'
  | 'staff'
  | 'wand'
  | 'shield'
  | 'axe'
  | 'hammer';

export type DamageType = 'physical' | 'fire' | 'frost' | 'arcane' | 'nature' | 'shadow';

export type ItemKind =
  | 'weapon'
  | 'armor'
  | 'shield'
  | 'consumable'
  | 'material'
  | 'quest'
  | 'currency'
  | 'tool'
  | 'cosmetic';

export type EquipSlot = 'weapon' | 'offhand' | 'head' | 'chest' | 'legs' | 'feet' | 'trinket';

export type SkillId =
  | 'sword'
  | 'bow'
  | 'magic'
  | 'shield'
  | 'dualwield'
  | 'mining'
  | 'herbalism'
  | 'fishing'
  | 'woodcutting'
  | 'blacksmithing'
  | 'alchemy'
  | 'enchanting'
  | 'cooking'
  | 'exploration'
  | 'trading'
  | 'survival';

export type GatheringSkill = 'mining' | 'herbalism' | 'fishing' | 'woodcutting';

export interface StatBlock {
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  spirit: number;
}

export interface ItemModifier {
  stat?: Partial<StatBlock>;
  damageBonus?: number;
  critChance?: number;
  critDamage?: number;
  moveSpeed?: number;
  attackSpeed?: number;
  lifesteal?: number;
  armorBonus?: number;
  maxHealth?: number;
  maxMana?: number;
  resist?: Partial<Record<DamageType, number>>;
  proc?: { effect: string; chance: number; power: number };
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  weaponType?: WeaponType;
  equipSlot?: EquipSlot;
  damage?: { min: number; max: number; type: DamageType };
  attackSpeed?: number;
  armor?: number;
  block?: number;
  range?: number;
  stats?: Partial<StatBlock>;
  modifiers?: ItemModifier[];
  stackable: boolean;
  maxStack: number;
  value: number;
  weight: number;
  levelReq?: number;
  skillReq?: { skill: SkillId; level: number };
  consumable?: { effects: ConsumableEffect[]; cooldown: number };
  tool?: { skill: GatheringSkill; level: number; power: number };
  questTag?: string;
  description: string;
  icon: string;
  tags?: string[];
}

export interface ConsumableEffect {
  type: 'heal' | 'mana' | 'stamina' | 'buff' | 'cure' | 'teleport';
  amount?: number;
  buff?: { stat: keyof StatBlock | 'damage' | 'armor' | 'speed'; amount: number; duration: number };
  target?: ZoneId;
  position?: { x: number; y: number; z: number };
}

export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
  modifiers?: ItemModifier[];
  rarity?: Rarity;
  bound?: boolean;
  durability?: number;
  charged?: boolean;
}

export interface AbilityDef {
  id: string;
  name: string;
  archetypes: ArchetypeId[];
  levelReq: number;
  cooldown: number;
  resourceCost: { stamina?: number; mana?: number };
  range: number;
  radius?: number;
  castTime: number;
  windup: number;
  damage?: { min: number; max: number; type: DamageType; scaling: keyof StatBlock | 'none' };
  effects: AbilityEffect[];
  icon: string;
  description: string;
  animation: 'slash' | 'thrust' | 'shoot' | 'cast' | 'slam' | 'buff' | 'dash';
  momentumGain?: number;
}

export type AbilityEffect =
  | { type: 'damage'; min: number; max: number; damageType: DamageType; scaling: keyof StatBlock | 'none' }
  | { type: 'heal'; min: number; max: number; scaling: keyof StatBlock | 'none' }
  | { type: 'dot'; dps: number; duration: number; damageType: DamageType; name: string }
  | { type: 'hot'; hps: number; duration: number; name: string }
  | { type: 'status'; status: StatusId; duration: number; chance: number; power?: number }
  | { type: 'dash'; distance: number }
  | { type: 'shield'; amount: number; duration: number }
  | { type: 'taunt'; radius: number; duration: number }
  | { type: 'pull'; distance: number }
  | { type: 'knockback'; force: number }
  | { type: 'buff'; stat: keyof StatBlock | 'damage' | 'armor' | 'speed' | 'crit'; amount: number; duration: number }
  | { type: 'summon'; enemyId: string; count: number; duration: number };

export type StatusId =
  | 'stun'
  | 'slow'
  | 'root'
  | 'burn'
  | 'poison'
  | 'bleed'
  | 'frozen'
  | 'haste'
  | 'weaken'
  | 'invulnerable'
  | 'stealth';

export interface StatusEffect {
  id: StatusId;
  name: string;
  duration: number;
  remaining: number;
  power: number;
  sourceId?: EntityId;
  dotAccum?: number;
}

export interface MomentumState {
  points: number;
  max: number;
  decaying: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  archetype: 'brute' | 'hunter' | 'swarm' | 'assassin' | 'guardian' | 'caster';
  level: number;
  health: number;
  damage: { min: number; max: number; type: DamageType };
  armor: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  xp: number;
  gold: { min: number; max: number };
  lootTable: LootEntry[];
  abilities?: string[];
  behavior: EnemyBehavior;
  scale: number;
  color: string;
  boss?: boolean;
  elite?: boolean;
  tags?: string[];
}

export interface EnemyBehavior {
  leash: number;
  wanderRadius: number;
  fleeThreshold?: number;
  packRange?: number;
  specialInterval?: number;
  strafeChance?: number;
  teleportAtHealth?: number;
}

export interface LootEntry {
  itemId: string;
  chance: number;
  qtyMin?: number;
  qtyMax?: number;
  rarityOverride?: Rarity;
  modifierCount?: number;
}

export interface SpawnPoint {
  enemyId: string;
  x: number;
  z: number;
  radius: number;
  count: number;
  respawnSeconds: number;
  levelVariance?: number;
}

export interface ResourceNodeDef {
  id: string;
  name: string;
  skill: GatheringSkill;
  levelReq: number;
  hardness: number;
  gatherTime: number;
  yields: { itemId: string; chance: number; qtyMin?: number; qtyMax?: number }[];
  respawnSeconds: number;
  color: string;
  shape: 'rock' | 'tree' | 'bush' | 'water' | 'crystal';
}

export interface ResourceNodeInstance {
  id: number;
  defId: string;
  x: number;
  z: number;
  depletedUntil: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  skill: 'blacksmithing' | 'alchemy' | 'cooking' | 'enchanting';
  skillLevel: number;
  inputs: { itemId: string; qty: number }[];
  outputs: { itemId: string; qty: number }[];
  station?: 'forge' | 'alchemy_table' | 'campfire' | 'enchant_table';
  craftTime: number;
  xp: number;
  description: string;
}

export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  levelReq: number;
  prerequisites: string[];
  type: 'main' | 'side' | 'faction' | 'repeatable';
  stages: QuestStage[];
  rewards: { xp: number; gold: number; items?: { itemId: string; qty: number }[]; reputation?: { faction: string; amount: number }[] };
  description: string;
  repeatable?: boolean;
}

export interface QuestStage {
  description: string;
  objectives: QuestObjective[];
  onComplete?: string;
  branch?: { text: string; nextStage: number; reputation?: { faction: string; amount: number } }[];
}

export type QuestObjective =
  | { type: 'kill'; enemyId: string; count: number }
  | { type: 'collect'; itemId: string; count: number; consume?: boolean }
  | { type: 'talk'; npcId: string }
  | { type: 'reach'; zoneId: ZoneId; x: number; z: number; radius: number }
  | { type: 'gather'; skill: GatheringSkill; count: number }
  | { type: 'craft'; recipeId: string; count: number }
  | { type: 'deliver'; npcId: string; itemId: string; count: number };

export interface QuestState {
  questId: string;
  stage: number;
  progress: number[];
  status: 'active' | 'complete' | 'turned_in' | 'failed';
}

export interface FactionDef {
  id: string;
  name: string;
  description: string;
  color: string;
  homeZone: ZoneId;
}

export interface NPCDef {
  id: string;
  name: string;
  title?: string;
  faction?: string;
  x: number;
  z: number;
  zoneId: ZoneId;
  role: 'quest' | 'merchant' | 'bank' | 'trainer' | 'innkeeper' | 'guard' | 'flavor' | 'crafting';
  dialogue: DialogueNode[];
  shop?: { itemId: string; priceMultiplier?: number }[];
  quests?: string[];
  trainAbility?: string;
  schedule?: NPCScheduleEntry[];
  color: string;
}

export interface DialogueNode {
  id: string;
  text: string;
  options: { text: string; next?: string; action?: DialogueAction }[];
}

export type DialogueAction =
  | { type: 'open_shop' }
  | { type: 'open_bank' }
  | { type: 'accept_quest'; questId: string }
  | { type: 'turn_in_quest'; questId: string }
  | { type: 'train'; abilityId: string; cost: number }
  | { type: 'close' };

export interface NPCScheduleEntry {
  hour: number;
  x: number;
  z: number;
  action?: 'work' | 'idle' | 'sleep' | 'social';
}

export type EnemyState =
  | 'idle'
  | 'patrol'
  | 'detect'
  | 'chase'
  | 'attack'
  | 'hurt'
  | 'flee'
  | 'dead'
  | 'return';

export interface EnemyRuntime {
  id: EntityId;
  defId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  health: number;
  maxHealth: number;
  state: EnemyState;
  targetId?: EntityId;
  stateTimer: number;
  attackCooldown: number;
  specialCooldown: number;
  homeX: number;
  homeZ: number;
  path: { x: number; z: number }[];
  pathIndex: number;
  statuses: StatusEffect[];
  shield: number;
  shieldUntil: number;
  spawnId: number;
  dead: boolean;
  respawnAt: number;
  lastDamagedBy?: EntityId;
  threat: Map<EntityId, number>;
  wanderTarget?: { x: number; z: number };
  loot: ItemInstance[];
  gold: number;
  level: number;
  animation: string;
  animUntil: number;
  hitFlashUntil: number;
  deadAt?: number;
  pathTimer?: number;
}

export interface PlayerCombatState {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  momentum: MomentumState;
  momentumLastGain?: number;
  statuses: StatusEffect[];
  shield: number;
  shieldUntil: number;
  invulnerableUntil: number;
  cooldowns: Record<string, number>;
  globalCooldownUntil: number;
  castEndsAt?: number;
  castAbility?: string;
  comboIndex: number;
  comboExpiresAt: number;
  lastAttackAt: number;
  dodgeUntil: number;
  dodgeReadyAt: number;
  dodgeDirX?: number;
  dodgeDirZ?: number;
}

export interface PlayerProgress {
  level: number;
  xp: number;
  skillXp: Record<SkillId, number>;
  skillLevels: Record<SkillId, number>;
  abilityPoints: number;
  unlockedAbilities: string[];
  archetype: ArchetypeId;
  pendingPaths: ArchetypeId[];
  gold: number;
  veilsShards: number;
}

export interface PlayerAppearance {
  bodyColor: string;
  hairColor: string;
  skinTone: string;
  height: number;
  archetype: ArchetypeId;
}

export interface PlayerState {
  id: EntityId;
  account: string;
  name: string;
  zoneId: ZoneId;
  x: number;
  y: number;
  z: number;
  heading: number;
  moveX: number;
  moveZ: number;
  moving: boolean;
  combat: PlayerCombatState;
  progress: PlayerProgress;
  appearance: PlayerAppearance;
  inventory: (ItemInstance | null)[];
  bank: (ItemInstance | null)[];
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  quests: QuestState[];
  reputation: Record<string, number>;
  inputSeq: number;
  lastProcessedSeq: number;
  path?: { x: number; z: number }[];
  pathIndex?: number;
  ping: number;
  deaths: number;
  kills: number;
  playSeconds: number;
  createdAt: number;
  dirty: boolean;
  lastSavedAt: number;
  guildId?: string;
  partyId?: string;
  pvpEnabled: boolean;
  safeZoneUntil?: number;
  stats: StatBlock;
}

export interface GroundItem {
  id: EntityId;
  items: ItemInstance[];
  gold: number;
  x: number;
  z: number;
  expiresAt: number;
  owner?: string;
}

export interface WorldEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  at: number;
}

export interface WorldFlags {
  [key: string]: number | string | boolean;
}
