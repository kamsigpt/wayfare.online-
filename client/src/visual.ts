/**
 * Central visual configuration for WAYFARE.ONLINE.
 *
 * This is the single source of truth for palette, camera, lighting, pixel
 * pipeline settings, quality presets and UI design tokens. Nothing visual
 * should hard-code colours or sizes elsewhere; import from here instead.
 *
 * The goal is a cohesive, colourful, retro-pixel fantasy look: low-poly
 * geometry, chunky nearest-neighbour pixels, warm lanterns, lush greens,
 * cool water and deep navy UI with thin blue borders.
 */

/* ------------------------------------------------------------------ palette */

/**
 * Core art-direction palette. Terrain/material colours live in the texture
 * generator; this covers characters, creatures, props, FX and interface.
 */
export const PALETTE = {
  // natural world
  grassLight: '#7bb661',
  grassMid: '#5a9247',
  grassDark: '#3c6b34',
  foliageLight: '#86c765',
  foliageMid: '#4f9440',
  foliageDeep: '#2f6b2c',
  barkLight: '#8a5a34',
  barkDark: '#4d3120',
  rockLight: '#9aa4b2',
  rockMid: '#6f7a89',
  rockDark: '#48505c',
  sand: '#dcc38a',
  snow: '#eef4ff',
  ice: '#a9d4ef',
  water: '#3f8fd0',
  waterDeep: '#22598c',
  waterShallow: '#6cc0e6',
  lava: '#ff7a2f',
  lavaBright: '#ffd24a',

  // build & town
  plaster: '#e6d3ac',
  plasterShade: '#c9b184',
  timber: '#6b4326',
  timberDark: '#432a18',
  roofRed: '#b5543f',
  roofBlue: '#3f5a8c',
  roofGreen: '#4a7a4f',
  roofSlate: '#556072',
  thatch: '#b9944f',
  stoneWall: '#9aa1ad',
  stoneShade: '#6d7480',
  windowGlow: '#ffcf7a',
  lantern: '#ffb44d',
  iron: '#5b6472',
  ironLight: '#8b95a6',
  gold: '#ffcc55',
  goldDeep: '#c9932e',

  // magic & rarity accents
  arcane: '#9b6bff',
  arcaneDeep: '#5b34b8',
  flame: '#ff7a3c',
  frost: '#79c7ff',
  nature: '#6fd06a',
  shadow: '#6b4a8c',
  holy: '#ffe9a8',
  poison: '#8fd44a',

  // interface
  uiInk: '#0a0e16',
  uiPanel: '#131a28',
  uiPanel2: '#0e1420',
  uiBorder: '#2f4d7a',
  uiBorderBright: '#4d7fc4',
  uiGold: '#ffcc66',
  uiText: '#d7e2f2',
  uiMuted: '#8896ad',
  uiGood: '#63d179',
  uiBad: '#e05b5b',
  uiHp: '#d64545',
  uiMp: '#3f7ed6',
  uiStamina: '#d9bb58',
  uiXp: '#9a6be6',
  uiMomentum: '#e8913c',
  rarityCommon: '#c2c8d4',
  rarityUncommon: '#5ddc7a',
  rarityRare: '#54a9ff',
  rarityEpic: '#c07bff',
  rarityLegendary: '#ffc24d',
} as const;

/* ------------------------------------------------------------------ pixels */

export const PIXEL = {
  /** Nearest-neighbour sampling for every generated texture. */
  sampling: 'nearest' as const,
  /** Base pixel texture resolution for tiles. */
  tileResolution: 32,
  /** Detail tiles (foliage, icons) render slightly larger. */
  detailResolution: 32,
  /** Default upscale factor for the low-res pixel pipeline. */
  defaultSize: 3,
  minSize: 1,
  maxSize: 8,
} as const;

/* ------------------------------------------------------------------ camera */

export const CAMERA = {
  alpha: -Math.PI / 2.15,
  beta: 1.0,
  radius: 17,
  fov: 0.86,
  minZ: 0.12,
  lowerRadius: 6,
  upperRadius: 40,
  lowerBeta: 0.32,
  upperBeta: 1.32,
  wheelPrecision: 12,
  inertia: 0.55,
  followHeight: 1.25,
  followLerp: 8,
  shakeDecay: 3,
} as const;

/* ------------------------------------------------------------------ lighting */

export const LIGHTING = {
  hemiDir: { x: 0.25, y: 1, z: 0.15 },
  hemiBoost: 0.15,
  sunDir: { x: -0.55, y: -0.9, z: -0.35 },
  ambientBoost: 0.12,
  specular: 0.02,
} as const;

/* ------------------------------------------------------------------ quality */

export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  foliage: number;
  clouds: number;
  treeScale: number;
  maxZ: number;
  fogMul: number;
  pixel: number;
  fireflies: number;
  /** Minutes of simulated day folded into horizon colour. */
  shadows: boolean;
  groundSubdivCap: number;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { foliage: 140, clouds: 8, treeScale: 0.5, maxZ: 260, fogMul: 1.6, pixel: 5, fireflies: 0, shadows: false, groundSubdivCap: 70 },
  medium: { foliage: 520, clouds: 16, treeScale: 1, maxZ: 440, fogMul: 1.0, pixel: 3, fireflies: 24, shadows: false, groundSubdivCap: 110 },
  high: { foliage: 1100, clouds: 26, treeScale: 1, maxZ: 660, fogMul: 0.72, pixel: 2, fireflies: 44, shadows: true, groundSubdivCap: 150 },
};

export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

/* ------------------------------------------------------------------ sky */

export const SKY = {
  followRadius: 950,
  cloudSpanPad: 460,
  cloudMinY: 74,
  cloudMaxY: 190,
} as const;

/* ------------------------------------------------------------------ UI tokens */

/**
 * Interface design tokens, mirrored into CSS custom properties at boot so the
 * DOM HUD and any canvas UI share one style language.
 */
export const UI = {
  fontBody: "'Segoe UI', system-ui, sans-serif",
  fontDisplay: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  panelRadius: 6,
  slotRadius: 5,
  border: 2,
  panelOpacity: 0.94,
  icon: 44,
  gap: 8,
} as const;

export function applyUiTokens(root: HTMLElement = document.documentElement): void {
  const s = root.style;
  s.setProperty('--p-ink', PALETTE.uiInk);
  s.setProperty('--p-panel', PALETTE.uiPanel);
  s.setProperty('--p-panel2', PALETTE.uiPanel2);
  s.setProperty('--p-border', PALETTE.uiBorder);
  s.setProperty('--p-border-bright', PALETTE.uiBorderBright);
  s.setProperty('--p-gold', PALETTE.uiGold);
  s.setProperty('--p-text', PALETTE.uiText);
  s.setProperty('--p-muted', PALETTE.uiMuted);
  s.setProperty('--p-good', PALETTE.uiGood);
  s.setProperty('--p-bad', PALETTE.uiBad);
  s.setProperty('--p-hp', PALETTE.uiHp);
  s.setProperty('--p-mp', PALETTE.uiMp);
  s.setProperty('--p-sp', PALETTE.uiStamina);
  s.setProperty('--p-xp', PALETTE.uiXp);
  s.setProperty('--p-mom', PALETTE.uiMomentum);
  s.setProperty('--font-body', UI.fontBody);
  s.setProperty('--font-display', UI.fontDisplay);
  s.setProperty('--radius', `${UI.panelRadius}px`);
  s.setProperty('--slot-radius', `${UI.slotRadius}px`);
  s.setProperty('--border', `${UI.border}px`);
  s.setProperty('--icon', `${UI.icon}px`);
  s.setProperty('--gap', `${UI.gap}px`);
}

/* ------------------------------------------------------------------ helpers */

/** Deterministic 32-bit LCG, shared by world dressing and texture noise. */
export function makeRng(seed = 987654321): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
