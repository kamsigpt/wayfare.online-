import type { SpawnPoint } from '../types.js';

export interface Obstacle {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  kind: 'wall' | 'rock' | 'tree' | 'building' | 'fence' | 'ruin' | 'pillar' | 'water' | 'pit';
  color: string;
}

export interface PortalDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  targetZone: string;
  targetX: number;
  targetZ: number;
  label: string;
  levelReq?: number;
}

export interface NPCSpawn {
  npcId: string;
}

export interface ResourceSpawn {
  nodeId: string;
  x: number;
  z: number;
}

export interface GroundProp {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  kind: 'road' | 'grass' | 'dirt' | 'stone' | 'lava';
}

export interface ZoneDef {
  id: string;
  name: string;
  subtitle: string;
  size: number;
  groundColor: string;
  fogColor: string;
  fogDensity: number;
  ambient: number;
  ambientColor: string;
  sunIntensity: number;
  sunColor: string;
  sunDir: { x: number; y: number; z: number };
  spawn: { x: number; z: number };
  safe: boolean;
  pvp: boolean;
  recommendedLevel: [number, number];
  obstacles: Obstacle[];
  spawns: SpawnPoint[];
  resources: ResourceSpawn[];
  npcs: NPCSpawn[];
  portals: PortalDef[];
  props: GroundProp[];
  ambientParticles: 'none' | 'fireflies' | 'dust' | 'embers' | 'mist';
  music: string;
}

const tree = (x: number, z: number, color = '#33691e'): Obstacle => ({
  x,
  z,
  w: 1.4,
  d: 1.4,
  h: 5,
  kind: 'tree',
  color,
});

const rock = (x: number, z: number, s = 2.5, color = '#616161'): Obstacle => ({
  x,
  z,
  w: s,
  d: s,
  h: s * 0.8,
  kind: 'rock',
  color,
});

const building = (x: number, z: number, w: number, d: number, h: number, color: string): Obstacle => ({
  x,
  z,
  w,
  d,
  h,
  kind: 'building',
  color,
});

export const ZONES: Record<string, ZoneDef> = {
  elaris: {
    id: 'elaris',
    name: 'Elaris',
    subtitle: 'Sanctuary of the Compact',
    size: 90,
    groundColor: '#5d7a4a',
    fogColor: '#a8c4d8',
    fogDensity: 0.006,
    ambient: 0.55,
    ambientColor: '#cfe4f5',
    sunIntensity: 0.85,
    sunColor: '#fff3d6',
    sunDir: { x: -0.5, y: 0.8, z: 0.35 },
    spawn: { x: 0, z: 4 },
    safe: true,
    pvp: false,
    recommendedLevel: [1, 6],
    ambientParticles: 'dust',
    music: 'elaris',
    obstacles: [
      building(-6, -12, 14, 10, 7, '#8d6e63'),
      building(12, -14, 10, 12, 8, '#795548'),
      building(-14, 14, 12, 10, 6, '#a1887f'),
      building(14, 12, 16, 9, 7, '#8d6e63'),
      building(0, -22, 20, 8, 9, '#6d4c41'),
      building(-24, -2, 9, 14, 7, '#795548'),
      building(26, -4, 10, 10, 6, '#a1887f'),
      building(-20, 26, 12, 8, 5, '#8d6e63'),
      building(22, 24, 10, 10, 6, '#795548'),
      building(2, 30, 14, 8, 5, '#a1887f'),
      { x: 0, z: -40, w: 70, d: 3, h: 6, kind: 'wall', color: '#78909c' },
      { x: 40, z: 0, w: 3, d: 84, h: 6, kind: 'wall', color: '#78909c' },
      { x: -40, z: 0, w: 3, d: 84, h: 6, kind: 'wall', color: '#78909c' },
      { x: 0, z: 42, w: 70, d: 3, h: 6, kind: 'wall', color: '#78909c' },
      { x: 32, z: 42, w: 8, d: 4, h: 7, kind: 'pillar', color: '#546e7a' },
      { x: -32, z: 42, w: 8, d: 4, h: 7, kind: 'pillar', color: '#546e7a' },
      tree(-32, -30),
      tree(-28, -34),
      tree(30, -32),
      tree(34, -28),
      tree(-34, 34),
      tree(32, 34),
      rock(-30, 6, 3),
      rock(30, 14, 3.5),
      rock(-16, -28, 2.5),
      rock(20, -30, 3),
      { x: 6, z: 6, w: 6, d: 4, h: 2.5, kind: 'fence', color: '#8d6e63' },
      { x: -8, z: 4, w: 5, d: 3, h: 2, kind: 'fence', color: '#8d6e63' },
    ],
    spawns: [{ enemyId: 'training_dummy', x: 4, z: -4, radius: 3, count: 3, respawnSeconds: 20 }],
    resources: [],
    npcs: [
      { npcId: 'quartermaster_ilya' },
      { npcId: 'captain_bren' },
      { npcId: 'merchant_dax' },
      { npcId: 'smith_bran' },
      { npcId: 'healer_mira' },
      { npcId: 'innkeeper_sela' },
      { npcId: 'archivist_pell' },
      { npcId: 'trainer_omar' },
      { npcId: 'guard_tobin' },
    ],
    portals: [{ id: 'to_greenreach', x: 0, z: 39, radius: 3.5, targetZone: 'greenreach', targetX: 0, targetZ: -36, label: 'Greenreach' }],
    props: [
      { x: 0, z: 0, w: 34, d: 76, color: '#8a9a7b', kind: 'road' },
      { x: 0, z: -4, w: 60, d: 24, color: '#93a585', kind: 'stone' },
    ],
  },

  greenreach: {
    id: 'greenreach',
    name: 'Greenreach',
    subtitle: 'Starter Wilderness',
    size: 220,
    groundColor: '#41662f',
    fogColor: '#7d9b6a',
    fogDensity: 0.01,
    ambient: 0.45,
    ambientColor: '#b8d4a8',
    sunIntensity: 0.75,
    sunColor: '#ffefc4',
    sunDir: { x: -0.45, y: 0.75, z: 0.45 },
    spawn: { x: 0, z: -36 },
    safe: false,
    pvp: false,
    recommendedLevel: [1, 10],
    ambientParticles: 'fireflies',
    music: 'greenreach',
    obstacles: [
      ...Array.from({ length: 90 }, (_, i) => {
        const a = (i * 137.508 * Math.PI) / 180;
        const r = 20 + (i * 7.7) % 90;
        return tree(Math.cos(a) * r, Math.sin(a) * r - 10, i % 3 === 0 ? '#2e5d23' : '#33691e');
      }),
      ...Array.from({ length: 26 }, (_, i) => {
        const a = (i * 99.5 * Math.PI) / 180;
        const r = 30 + (i * 11.3) % 80;
        return rock(Math.cos(a) * r, Math.sin(a) * r + 6, 2 + (i % 4), i % 2 ? '#5c6bc0' : '#616161');
      }),
      { x: -60, z: 40, w: 30, d: 24, h: 4, kind: 'ruin', color: '#9e9e9e' },
      { x: 64, z: -50, w: 22, d: 20, h: 5, kind: 'ruin', color: '#8d8d8d' },
      { x: 40, z: -40, w: 10, d: 8, h: 3, kind: 'ruin', color: '#a0a0a0' },
      { x: -80, z: -60, w: 16, d: 30, h: 4, kind: 'ruin', color: '#909090' },
      { x: 30, z: 60, w: 40, d: 8, h: 3, kind: 'water', color: '#1976d2' },
      { x: 70, z: 70, w: 30, d: 26, h: 3, kind: 'water', color: '#1976d2' },
      { x: -46, z: -20, w: 6, d: 5, h: 6, kind: 'pillar', color: '#546e7a' },
      { x: 24, z: -70, w: 26, d: 6, h: 6, kind: 'wall', color: '#607d8b' },
      { x: 36, z: -74, w: 6, d: 12, h: 7, kind: 'pillar', color: '#455a64' },
    ],
    spawns: [
      { enemyId: 'grove_wolf', x: -20, z: -10, radius: 16, count: 5, respawnSeconds: 30 },
      { enemyId: 'grove_wolf', x: 24, z: 6, radius: 14, count: 4, respawnSeconds: 30 },
      { enemyId: 'grove_wolf', x: -44, z: 24, radius: 14, count: 4, respawnSeconds: 30 },
      { enemyId: 'thorn_boar', x: 40, z: -20, radius: 14, count: 4, respawnSeconds: 40 },
      { enemyId: 'thorn_boar', x: -30, z: -44, radius: 12, count: 3, respawnSeconds: 40 },
      { enemyId: 'marsh_stalker', x: 44, z: -42, radius: 10, count: 3, respawnSeconds: 45 },
      { enemyId: 'marsh_stalker', x: -60, z: 40, radius: 12, count: 3, respawnSeconds: 45 },
      { enemyId: 'veil_wisp', x: 12, z: 44, radius: 14, count: 4, respawnSeconds: 50 },
      { enemyId: 'veil_wisp', x: -70, z: -30, radius: 14, count: 3, respawnSeconds: 50 },
      { enemyId: 'moss_golem', x: -60, z: 44, radius: 8, count: 2, respawnSeconds: 70 },
      { enemyId: 'bandit_cutthroat', x: 62, z: -52, radius: 12, count: 4, respawnSeconds: 50 },
      { enemyId: 'bandit_brute', x: 66, z: -46, radius: 8, count: 2, respawnSeconds: 60 },
      { enemyId: 'bandit_cutthroat', x: -80, z: -58, radius: 10, count: 3, respawnSeconds: 50 },
    ],
    resources: [
      { nodeId: 'copper_vein', x: -36, z: -30 },
      { nodeId: 'copper_vein', x: -42, z: -24 },
      { nodeId: 'copper_vein', x: 54, z: -18 },
      { nodeId: 'iron_vein', x: -74, z: -56 },
      { nodeId: 'iron_vein', x: 62, z: -64 },
      { nodeId: 'iron_vein', x: 66, z: -60 },
      { nodeId: 'veil_crystal', x: 26, z: -72 },
      { nodeId: 'veil_crystal', x: -84, z: -64 },
      { nodeId: 'oak_tree', x: -14, z: 18 },
      { nodeId: 'oak_tree', x: 18, z: 24 },
      { nodeId: 'oak_tree', x: -50, z: 4 },
      { nodeId: 'oak_tree', x: 46, z: 30 },
      { nodeId: 'ironwood_tree', x: -88, z: 10 },
      { nodeId: 'ironwood_tree', x: 84, z: 4 },
      { nodeId: 'moonleaf_patch', x: 8, z: -18 },
      { nodeId: 'moonleaf_patch', x: -24, z: 34 },
      { nodeId: 'moonleaf_patch', x: 34, z: 46 },
      { nodeId: 'moonleaf_patch', x: -54, z: -8 },
      { nodeId: 'emberbloom_patch', x: 24, z: -66 },
      { nodeId: 'emberbloom_patch', x: -78, z: -50 },
      { nodeId: 'fishing_spot', x: 30, z: 56 },
      { nodeId: 'fishing_spot', x: 74, z: 66 },
    ],
    npcs: [{ npcId: 'ranger_cass' }, { npcId: 'hermit_vae' }],
    portals: [
      { id: 'to_elaris', x: 0, z: -40, radius: 3.5, targetZone: 'elaris', targetX: 0, targetZ: 36, label: 'Elaris' },
      { id: 'to_hollow', x: 36, z: -76, radius: 3.5, targetZone: 'hollow', targetX: 0, targetZ: 14, label: 'The Hollow', levelReq: 4 },
    ],
    props: [
      { x: 0, z: -30, w: 8, d: 24, color: '#6b5b45', kind: 'road' },
      { x: 20, z: -56, w: 44, d: 7, color: '#6b5b45', kind: 'road' },
      { x: -30, z: 12, w: 40, d: 6, color: '#5a6e45', kind: 'grass' },
      { x: 62, z: -54, w: 26, d: 22, color: '#5c5346', kind: 'dirt' },
    ],
  },

  hollow: {
    id: 'hollow',
    name: 'The Hollow',
    subtitle: 'Dungeon — 1 to 5 Wayfarers',
    size: 120,
    groundColor: '#2b2440',
    fogColor: '#171226',
    fogDensity: 0.028,
    ambient: 0.3,
    ambientColor: '#4a3f6b',
    sunIntensity: 0.35,
    sunColor: '#8c7bc0',
    sunDir: { x: 0.2, y: 0.9, z: -0.2 },
    spawn: { x: 0, z: 14 },
    safe: false,
    pvp: false,
    recommendedLevel: [5, 12],
    ambientParticles: 'embers',
    music: 'hollow',
    obstacles: [
      { x: 0, z: 44, w: 60, d: 4, h: 10, kind: 'wall', color: '#3d3554' },
      { x: 0, z: -46, w: 60, d: 4, h: 10, kind: 'wall', color: '#3d3554' },
      { x: -42, z: 0, w: 4, d: 92, h: 10, kind: 'wall', color: '#3d3554' },
      { x: 42, z: 0, w: 4, d: 92, h: 10, kind: 'wall', color: '#3d3554' },
      { x: -20, z: 30, w: 4, d: 26, h: 8, kind: 'wall', color: '#453c60' },
      { x: 20, z: 30, w: 4, d: 26, h: 8, kind: 'wall', color: '#453c60' },
      { x: -20, z: 6, w: 4, d: 22, h: 8, kind: 'wall', color: '#453c60' },
      { x: 20, z: 6, w: 4, d: 22, h: 8, kind: 'wall', color: '#453c60' },
      { x: -30, z: -18, w: 4, d: 30, h: 8, kind: 'wall', color: '#453c60' },
      { x: 30, z: -18, w: 4, d: 30, h: 8, kind: 'wall', color: '#453c60' },
      { x: -8, z: -30, w: 4, d: 24, h: 8, kind: 'wall', color: '#453c60' },
      { x: 8, z: -30, w: 4, d: 24, h: 8, kind: 'wall', color: '#453c60' },
      { x: -14, z: 20, w: 3, d: 3, h: 7, kind: 'pillar', color: '#546e7a' },
      { x: 14, z: 20, w: 3, d: 3, h: 7, kind: 'pillar', color: '#546e7a' },
      { x: -14, z: -8, w: 3, d: 3, h: 7, kind: 'pillar', color: '#546e7a' },
      { x: 14, z: -8, w: 3, d: 3, h: 7, kind: 'pillar', color: '#546e7a' },
      { x: 0, z: -38, w: 5, d: 5, h: 9, kind: 'pillar', color: '#5e5394' },
      { x: -24, z: 36, w: 2.5, d: 2.5, h: 6, kind: 'pillar', color: '#546e7a' },
      { x: 24, z: 36, w: 2.5, d: 2.5, h: 6, kind: 'pillar', color: '#546e7a' },
      rock(-34, 34, 4, '#4a4266'),
      rock(34, 34, 4, '#4a4266'),
      rock(-36, -40, 3.5, '#4a4266'),
      rock(36, -40, 3.5, '#4a4266'),
      { x: 0, z: -22, w: 26, d: 2, h: 5, kind: 'ruin', color: '#4a4266' },
    ],
    spawns: [
      { enemyId: 'hollow_ghoul', x: 0, z: 2, radius: 10, count: 4, respawnSeconds: 40 },
      { enemyId: 'hollow_ghoul', x: -26, z: 24, radius: 8, count: 3, respawnSeconds: 40 },
      { enemyId: 'hollow_ghoul', x: 26, z: 24, radius: 8, count: 3, respawnSeconds: 40 },
      { enemyId: 'hollow_lurker', x: -24, z: -8, radius: 10, count: 3, respawnSeconds: 55 },
      { enemyId: 'hollow_lurker', x: 24, z: -8, radius: 10, count: 3, respawnSeconds: 55 },
      { enemyId: 'veil_wisp', x: 0, z: -14, radius: 12, count: 4, respawnSeconds: 50 },
      { enemyId: 'rift_guardian', x: 0, z: -34, radius: 6, count: 2, respawnSeconds: 90 },
      { enemyId: 'hollow_warden', x: 0, z: -40, radius: 2, count: 1, respawnSeconds: 300 },
    ],
    resources: [
      { nodeId: 'veil_crystal', x: -34, z: 8 },
      { nodeId: 'veil_crystal', x: 34, z: 8 },
      { nodeId: 'veil_crystal', x: 0, z: -44 },
      { nodeId: 'iron_vein', x: -36, z: -30 },
      { nodeId: 'iron_vein', x: 36, z: -30 },
    ],
    npcs: [],
    portals: [{ id: 'to_greenreach', x: 0, z: 40, radius: 3.5, targetZone: 'greenreach', targetX: 34, targetZ: -70, label: 'Greenreach' }],
    props: [
      { x: 0, z: 0, w: 60, d: 80, color: '#322b4a', kind: 'stone' },
      { x: 0, z: -40, w: 36, d: 14, color: '#3a2f5c', kind: 'lava' },
    ],
  },
};

export function getZone(id: string): ZoneDef {
  return ZONES[id] ?? ZONES.elaris;
}

export function collidersFor(zone: ZoneDef): Obstacle[] {
  return zone.obstacles.filter((o) => o.kind !== 'water' || zone.id !== 'greenreach' ? true : true);
}
