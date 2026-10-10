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
  // natural world — vivid arcade saturation, reads as flat 2D pixel art
  grassLight: '#9ee06a',
  grassMid: '#63c043',
  grassDark: '#3f8f2e',
  foliageLight: '#9fe070',
  foliageMid: '#5cb83f',
  foliageDeep: '#2f7d29',
  barkLight: '#a76b3a',
  barkDark: '#5c3a22',
  rockLight: '#b3bdcc',
  rockMid: '#828fa0',
  rockDark: '#565f6d',
  sand: '#f0d488',
  snow: '#f4f9ff',
  ice: '#b7e2ff',
  water: '#3fa0e8',
  waterDeep: '#1f66a8',
  waterShallow: '#7fdcff',
  lava: '#ff7a2f',
  lavaBright: '#ffd24a',

  // build & town — bright storybook houses
  plaster: '#f6e4b8',
  plasterShade: '#d8bf8c',
  timber: '#7a4c2a',
  timberDark: '#4a2e1a',
  roofRed: '#e85c43',
  roofBlue: '#4f7fd6',
  roofGreen: '#5fae54',
  roofSlate: '#68788f',
  thatch: '#e0b45a',
  stoneWall: '#adb5c2',
  stoneShade: '#7b838f',
  windowGlow: '#ffd27a',
  lantern: '#ffc04d',
  iron: '#5b6472',
  ironLight: '#a4aec0',
  gold: '#ffd25e',
  goldDeep: '#d09a2e',
  // extra house accents
  wallCream: '#f7e6bd',
  wallPeach: '#f3c79a',
  wallBlue: '#bcd8f2',
  wallMint: '#c4e8b8',
  roofGold: '#ffc95e',
  roofPlum: '#b05fb0',

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

/**
 * MOBA / isometric camera. The world is viewed through a fixed-angle
 * orthographic projection (League-of-Legends style) so it reads as flat 2D
 * pixel art rather than a perspective 3D scene. Arrow keys pan the view away
 * from the hero; Y/Home snap it back.
 */
export const CAMERA = {
  /** Fixed yaw: looking down the -Z axis with no rotation drift. */
  yaw: -Math.PI / 2,
  /** Fixed pitch angle in radians (~56°, the classic MOBA tilt). */
  pitch: 0.98,
  lowerPitch: 0.42,
  upperPitch: 1.28,
  /** Orthographic half-height; bigger = further out. */
  zoom: 15,
  zoomMin: 9,
  zoomMax: 30,
  zoomStep: 1.6,
  /** Distance of the (orthographic) eye — only affects clipping. */
  distance: 140,
  minZ: 1,
  maxZ: 620,
  /** How far (world units) the arrow keys may drag the view off the hero. */
  panLimit: 15,
  panSpeed: 20,
  panLerp: 9,
  followHeight: 1.2,
  followLerp: 8,
  shakeDecay: 3,
} as const;

/* ------------------------------------------------------------------ render */

/**
 * Flat-2D rendering flags. When `cartoonOutlines` is on, characters, creatures,
 * houses and props get a dark ink outline (the classic sprite look). `flatLight`
 * keeps lighting soft and bright so surfaces read as solid colour instead of
 * shaded 3D volumes.
 */
export const RENDER = {
  cartoonOutlines: true,
  outlineColor: '#101625',
  outlineWidth: 0.035,
  flatLight: true,
  /** Multiplier applied to the directional sun when flatLight is on. */
  sunFlat: 0.45,
  /** Multiplier applied to ambient/hemispheric light when flatLight is on. */
  ambientFlat: 1.25,
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
  fontBody: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  fontDisplay: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  /** Sharp corners + heavy ink borders give the chunky 2D-arcade HUD look. */
  panelRadius: 3,
  slotRadius: 2,
  border: 3,
  panelOpacity: 0.96,
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
