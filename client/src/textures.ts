/**
 * Procedural pixel-art texture library.
 *
 * Every texture is generated at runtime as a tiny RGBA buffer with
 * nearest-neighbour sampling and no mipmaps, so it stays crisp at any distance
 * and needs zero downloads. Patterns tile seamlessly where it matters (terrain,
 * water, walls) via periodic lattice noise.
 *
 * `generateIcon()` produces small DOM-canvas icons for the interface using the
 * exact same palette, so items, abilities and buttons match the world.
 */

import { RawTexture, Scene, Texture } from 'babylonjs';
import { PIXEL } from './visual.js';

type RGB = [number, number, number];

/* ------------------------------------------------------------------ colour */

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

function shade(c: RGB, f: number): RGB {
  return [clampI(c[0] * f), clampI(c[1] * f), clampI(c[2] * f)];
}

function clampI(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function css(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* ------------------------------------------------------------------ noise */

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/** Periodic value noise: sampling x,y over [0,period) wraps seamlessly. */
function pnoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(wrap(x0, period), wrap(y0, period), seed);
  const b = hash(wrap(x0 + 1, period), wrap(y0, period), seed);
  const c = hash(wrap(x0, period), wrap(y0 + 1, period), seed);
  const d = hash(wrap(x0 + 1, period), wrap(y0 + 1, period), seed);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

function pfbm(x: number, y: number, period: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += pnoise(fx, fy, p, seed + i * 131) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
    p *= 2;
  }
  return sum / norm;
}

function makeRGBA(size: number, fn: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (x + y * size) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

/* ------------------------------------------------------------------ tile kinds */

type PixelFn = (x: number, y: number, size: number) => [number, number, number, number];

interface Tile {
  size: number;
  fn: PixelFn;
  alpha?: boolean;
}

/** A seamless mottled surface from a palette ramp. */
function mottle(palette: RGB[], opts: { period?: number; seed?: number; bands?: number } = {}): PixelFn {
  const period = opts.period ?? 4;
  const seed = opts.seed ?? 1337;
  const bands = opts.bands ?? palette.length;
  return (x, y, size) => {
    const n = pfbm((x / size) * period, (y / size) * period, period, seed, 3);
    const speck = hash(x, y, seed + 17);
    const v = Math.min(0.999, Math.max(0, n * 0.82 + speck * 0.18));
    const c = palette[Math.floor(v * bands)] ?? palette[palette.length - 1];
    return [c[0], c[1], c[2], 255];
  };
}

function grass(light: string, mid: string, dark: string, blade: string): PixelFn {
  const l = hex(light), m = hex(mid), d = hex(dark), bl = hex(blade);
  return (x, y, size) => {
    const n = pfbm((x / size) * 5, (y / size) * 5, 5, 21, 3);
    let c = n > 0.62 ? l : n > 0.34 ? m : d;
    if (hash(x, y, 91) > 0.86) c = bl;
    if (hash(x, y, 55) < 0.05) c = shade(c, 0.72);
    return [c[0], c[1], c[2], 255];
  };
}

/* ------------------------------------------------------------------ registry */

const ROCK_LIGHT = hex('#a7b0bd');
const ROCK_MID = hex('#79838f');
const ROCK_DARK = hex('#4f5865');

const TILES: Record<string, Tile> = {
  /* ------------------------------------------------- terrain */
  grass: { size: 32, fn: grass('#9ee06a', '#63c043', '#3f8f2e', '#c8f28e') },
  grass_dark: { size: 32, fn: grass('#74c24f', '#4f9e39', '#377f2a', '#9adf6a') },
  grass_light: { size: 32, fn: grass('#b6ee86', '#8ad65e', '#66bf45', '#e0ffb0') },
  moss: { size: 32, fn: mottle([hex('#6ba043'), hex('#5a8c38'), hex('#48722c'), hex('#7fb852')], { seed: 7 }) },
  dirt: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm((x / size) * 4, (y / size) * 4, 4, 5, 3);
      let c = mix(hex('#6b4f36'), hex('#8a6a48'), n);
      if (hash(x, y, 31) > 0.9) c = shade(c, 0.7);
      if (hash(x, y, 41) > 0.94) c = hex('#9c7d57');
      return [c[0], c[1], c[2], 255];
    },
  },
  road: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm((x / size) * 5, (y / size) * 5, 5, 88, 3);
      let c = mix(hex('#7a6a52'), hex('#9a8a6c'), n);
      const grit = hash(x, y, 12);
      if (grit > 0.9) c = shade(c, 0.78);
      else if (grit > 0.82) c = shade(c, 1.12);
      return [c[0], c[1], c[2], 255];
    },
  },
  sand: { size: 32, fn: mottle([hex('#d9c186'), hex('#e6d199'), hex('#cbb075'), hex('#efdcab')], { seed: 3 }) },
  snow: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm((x / size) * 4, (y / size) * 4, 4, 61, 3);
      const c = mix(hex('#dbe8ff'), hex('#ffffff'), n);
      return [c[0], c[1], c[2], 255];
    },
  },
  ice: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm((x / size) * 6, (y / size) * 6, 6, 77, 3);
      let c = mix(hex('#8fc4ea'), hex('#d6f0ff'), n);
      if (Math.abs(((x + y) % 9) - 4) < 1) c = shade(c, 0.86);
      return [c[0], c[1], c[2], 255];
    },
  },

  /* ------------------------------------------------- stone */
  stone: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm((x / size) * 3, (y / size) * 3, 3, 9, 2);
      const c = mix(ROCK_DARK, ROCK_LIGHT, n);
      const crack = Math.abs(pfbm((x / size) * 8, (y / size) * 8, 8, 90, 2) - 0.5) < 0.03;
      return [...(crack ? shade(c, 0.6) : c), 255] as [number, number, number, number];
    },
  },
  cobble: {
    size: 32,
    fn: (x, y, size) => {
      const cell = 8;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const jitter = hash(cx, cy, 5);
      const inX = x - cx * cell, inY = y - cy * cell;
      const edge = inX === 0 || inY === 0 || inX === cell - 1 || inY === cell - 1;
      const c = shade(ROCK_MID, 0.6 + jitter * 0.7);
      if (edge) return [...shade(c, 0.55), 255] as [number, number, number, number];
      return [c[0], c[1], c[2], 255];
    },
  },
  ruin: {
    size: 32,
    fn: (x, y, size) => {
      const bx = Math.floor(x / 10), by = Math.floor(y / 8);
      const blockSeed = hash(bx, by, 200);
      const mortar = x % 10 === 0 || y % 8 === 0;
      const n = pfbm((x / size) * 6, (y / size) * 6, 6, 4, 3);
      let c = mix(hex('#9aa0ab'), hex('#c2c7cf'), n);
      c = shade(c, 0.85 + blockSeed * 0.3);
      if (mortar) c = shade(c, 0.6);
      return [c[0], c[1], c[2], 255];
    },
  },
  marble: {
    size: 32,
    fn: (x, y, size) => {
      const vein = Math.sin((x * 0.6 + pfbm(x / size * 3, y / size * 3, 3, 9, 2) * 10) * 1.4);
      const c = mix(hex('#c9cee0'), hex('#f2f4fb'), Math.abs(vein));
      return [c[0], c[1], c[2], 255];
    },
  },

  /* ------------------------------------------------- wood */
  wood: {
    size: 32,
    fn: (x, y) => {
      const plank = Math.floor(y / 8);
      const grain = Math.sin(x * 0.7 + hash(plank, 0, 9) * 6) * 0.5 + 0.5;
      let c = mix(hex('#5f3d24'), hex('#8a5c34'), grain);
      if (y % 8 === 0) c = shade(c, 0.55);
      if (x % 16 === 0) c = shade(c, 0.7);
      return [c[0], c[1], c[2], 255];
    },
  },
  wood_dark: {
    size: 32,
    fn: (x, y) => {
      const plank = Math.floor(y / 8);
      const grain = Math.sin(x * 0.6 + hash(plank, 1, 19) * 5) * 0.5 + 0.5;
      const c = mix(hex('#3a2617'), hex('#5c3c22'), grain);
      return [c[0], c[1], c[2], 255];
    },
  },
  log: {
    size: 32,
    fn: (x, y, size) => {
      const r = Math.hypot(x - size / 2, y - size / 2);
      const rings = Math.sin(Math.hypot(x - size / 2, y - size / 2) * 1.5) * 0.5 + 0.5;
      let c = mix(hex('#7a5230'), hex('#a9764a'), Math.sin(pfbm(x / size * 3, y / size * 3, 3, 2, 2) * 3) * 0.5 + 0.5);
      c = mix(c, hex('#5a3a22'), Math.abs(Math.sin(x * 0.4 + y * 0.3)) * 0.35);
      return [c[0], c[1], c[2], 255];
    },
  },
  timber: {
    size: 32,
    fn: (x, y, size) => {
      const beam = Math.floor(x / 16);
      const grain = pfbm(x / size * 6, y / size * 2, 6, 33, 2);
      let c = mix(hex('#4a2f1c'), hex('#6b4326'), grain);
      if (x % 16 < 2) c = shade(c, 0.6);
      c = shade(c, 0.9 + beam * 0.05);
      return [c[0], c[1], c[2], 255];
    },
  },
  plaster: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm(x / size * 5, y / size * 5, 5, 71, 3);
      const c = mix(hex('#cfba90'), hex('#efe0bb'), n);
      if (hash(x, y, 90) > 0.95) return [...shade(c, 0.88), 255] as [number, number, number, number];
      return [c[0], c[1], c[2], 255];
    },
  },

  /* ------------------------------------------------- roofing & builders */
  roof_red: { size: 32, fn: roofTiles(hex('#e85c43'), hex('#b83a2b')) },
  roof_blue: { size: 32, fn: roofTiles(hex('#4f7fd6'), hex('#2f52a0')) },
  roof_green: { size: 32, fn: roofTiles(hex('#5fae54'), hex('#3d823c')) },
  roof_slate: { size: 32, fn: roofTiles(hex('#68788f'), hex('#46505e')) },
  roof_gold: { size: 32, fn: roofTiles(hex('#ffc95e'), hex('#d0892e')) },
  roof_plum: { size: 32, fn: roofTiles(hex('#b05fb0'), hex('#7f3a7f')) },
  thatch: {
    size: 32,
    fn: (x, y) => {
      const strand = Math.floor(x / 3);
      const wob = Math.sin(y * 0.3 + hash(strand, 0, 3) * 5) * 1.5;
      const n = hash(strand, Math.floor((y + wob) / 4), 8);
      const c = mix(hex('#c9963c'), hex('#ecc25c'), n);
      return [c[0], c[1], c[2], 255];
    },
  },
  window: {
    size: 32,
    alpha: true,
    fn: (x, y, size) => {
      const border = x < 3 || y < 3 || x > size - 4 || y > size - 4;
      if (border) return [45, 30, 18, 255];
      if (x === 15 || x === 16 || y === 15 || y === 16) return [60, 40, 22, 255];
      const glow = pfbm(x / size * 4, y / size * 4, 4, 3, 2);
      const c = mix(hex('#ffcf7a'), hex('#fff2c8'), glow);
      return [c[0], c[1], c[2], 235];
    },
  },
  door: {
    size: 32,
    fn: (x, y, size) => {
      const plank = Math.floor(x / 8);
      const grain = pfbm(x / size * 8, y / size * 3, 8, 44, 2);
      let c = mix(hex('#4a2f1c'), hex('#6b4326'), grain);
      if (x % 8 === 0) c = shade(c, 0.55);
      const handle = Math.hypot(x - 25, y - 16) < 2.4;
      if (handle) c = hex('#e0c060');
      return [c[0], c[1], c[2], 255];
    },
  },

  /* ------------------------------------------------- foliage */
  leaves: { size: 32, alpha: true, fn: leafCluster(hex('#7cc35a'), hex('#4f9440'), hex('#2f6b2c')) },
  leaves_dark: { size: 32, alpha: true, fn: leafCluster(hex('#4f8440'), hex('#356130'), hex('#244a24')) },
  pine: { size: 32, alpha: true, fn: leafCluster(hex('#3f7a52'), hex('#2c5c3f'), hex('#1c3f2c')) },
  bush: { size: 32, alpha: true, fn: blobBush(hex('#6cae52'), hex('#3f7a38')) },
  fern: { size: 32, alpha: true, fn: fernFronds() },
  tuft: { size: 32, alpha: true, fn: grassTuft(hex('#8fce6a'), hex('#4f9440')) },
  flower: { size: 32, alpha: true, fn: flowerSprig() },
  mushroom: { size: 32, alpha: true, fn: mushroomCap() },
  cattail: { size: 32, alpha: true, fn: cattail() },
  lily: { size: 32, alpha: true, fn: lilypad() },

  /* ------------------------------------------------- magic & fx */
  magic: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm(x / size * 6, y / size * 6, 6, 303, 3);
      const c = n > 0.66 ? hex('#c9a6ff') : n > 0.36 ? hex('#8a5cff') : hex('#5b34b8');
      const spark = hash(x, y, 4) > 0.96;
      return [...(spark ? hex('#f0e6ff') : c), 255] as [number, number, number, number];
    },
  },
  rune: {
    size: 32,
    alpha: true,
    fn: (x, y, size) => {
      const cx = Math.abs(x - size / 2), cy = Math.abs(y - size / 2);
      const ring = Math.abs(Math.hypot(cx, cy) - size * 0.36) < 1.6;
      const cross = (cx < 1.4 && cy < size * 0.3) || (cy < 1.4 && cx < size * 0.3);
      if (!ring && !cross) return [0, 0, 0, 0];
      return [190, 150, 255, 220];
    },
  },
  lava: {
    size: 32,
    fn: (x, y, size) => {
      const n = pfbm(x / size * 4, y / size * 4, 4, 505, 3);
      const c = n > 0.6 ? hex('#ffd24a') : n > 0.42 ? hex('#ff7a2f') : hex('#8f2a12');
      const crust = hash(x, y, 9) > 0.9;
      return [...(crust ? shade(c, 0.5) : c), 255] as [number, number, number, number];
    },
  },
  water: {
    size: 32,
    fn: (x, y, size) => {
      const wave = Math.sin(x * 0.5 + y * 0.22) * 0.5 + pfbm(x / size * 3, y / size * 3, 3, 77, 2);
      const c = wave > 0.7 ? hex('#8fd4f0') : wave > 0.42 ? hex('#4f9fd8') : hex('#2c6ba6');
      return [c[0], c[1], c[2], 255];
    },
  },
  water_deep: {
    size: 32,
    fn: (x, y, size) => {
      const wave = pfbm(x / size * 3, y / size * 3, 3, 211, 3);
      const c = mix(hex('#22598c'), hex('#3f8fd0'), wave);
      return [c[0], c[1], c[2], 255];
    },
  },

  glow: { size: 32, alpha: true, fn: radial(hex('#ffe6a8'), 1) },
  spark: { size: 32, alpha: true, fn: radial(hex('#fff3c0'), 1.8) },
  smoke: { size: 32, alpha: true, fn: softBlob(hex('#2a2a30')) },
  shadow: { size: 32, alpha: true, fn: radial([0, 0, 0], 1, 0.55) },
};

function roofTiles(a: RGB, b: RGB): PixelFn {
  return (x, y, size) => {
    const row = Math.floor(y / 6);
    const off = (row % 2) * 5;
    const col = Math.floor((x + off) / 10);
    const inRow = y % 6;
    const inCol = (x + off) % 10;
    const lip = inRow > 4 || inCol === 0;
    const n = hash(col, row, 6);
    let c = mix(a, b, n);
    if (lip) c = shade(c, 0.62);
    if (inRow === 0) c = shade(c, 1.12);
    return [c[0], c[1], c[2], 255];
  };
}

function leafCluster(light: RGB, mid: RGB, dark: RGB): PixelFn {
  return (x, y, size) => {
    const n = pfbm(x / size * 5, y / size * 5, 5, 12, 3);
    const clump = pnoise(x / size * 8, y / size * 8, 8, 3);
    if (clump < 0.32 && n < 0.5) return [0, 0, 0, 0];
    let c = n > 0.64 ? light : n > 0.36 ? mid : dark;
    if (hash(x, y, 8) > 0.9) c = shade(c, 1.18);
    if (hash(x, y, 9) < 0.1) c = shade(c, 0.7);
    return [c[0], c[1], c[2], 255];
  };
}

function blobBush(light: RGB, dark: RGB): PixelFn {
  return (x, y, size) => {
    const cx = (x - size / 2) / (size / 2);
    const cy = (y - size * 0.62) / (size * 0.42);
    const r = Math.hypot(cx, cy) + (pfbm(x / size * 6, y / size * 6, 6, 2, 2) - 0.5) * 0.5;
    if (r > 1) return [0, 0, 0, 0];
    const c = mix(light, dark, Math.max(0, r));
    return [c[0], c[1], c[2], 255];
  };
}

function fernFronds(): PixelFn {
  const blade = hex('#5aa04a'), tip = hex('#8fd06a'), stem = hex('#356b2c');
  return (x, y, size) => {
    const fx = (x - size / 2) / (size / 2);
    const t = y / size;
    const spread = Math.abs(fx) - t * 0.9;
    if (y < size * 0.15 || spread > 0.08 || spread < -0.16) {
      if (Math.abs(fx) < 0.05 && y > size * 0.2) return [stem[0], stem[1], stem[2], 255];
      return [0, 0, 0, 0];
    }
    const c = y < size * 0.45 ? tip : blade;
    return [c[0], c[1], c[2], 255];
  };
}

function grassTuft(light: RGB, base: RGB): PixelFn {
  const tip = hex('#c6ec9c');
  return (x, y, size) => {
    const blades = 7;
    let hit: RGB | null = null;
    for (let i = 0; i < blades; i++) {
      const baseX = (i + 0.5) * (size / blades);
      const lean = (hash(i, 3, 4) - 0.5) * 4;
      const height = size * (0.45 + hash(i, 1, 2) * 0.5);
      const topY = size - height;
      if (y < topY) continue;
      const t = (y - topY) / height;
      const cx = baseX + lean * (1 - t);
      if (Math.abs(x - cx) < 1.1) hit = t < 0.4 ? tip : i % 2 ? base : light;
    }
    if (!hit) return [0, 0, 0, 0];
    return [hit[0], hit[1], hit[2], 255];
  };
}

function flowerSprig(): PixelFn {
  const stem = hex('#3f7a38');
  const petals = [hex('#ff6b8a'), hex('#ffd24a'), hex('#9b6bff'), hex('#ff9a4d')];
  return (x, y, size) => {
    if (Math.abs(x - size / 2) < 1 && y > size * 0.5) return [stem[0], stem[1], stem[2], 255];
    if (y < size * 0.5) {
      const cx = size / 2, cy = size * 0.32;
      const r = Math.hypot(x - cx, y - cy);
      if (r < 2.2) return [255, 230, 150, 255];
      if (r < 6) {
        const p = petals[Math.floor((Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2) * 4) % 4];
        return [p[0], p[1], p[2], 255];
      }
    }
    return [0, 0, 0, 0];
  };
}

function mushroomCap(): PixelFn {
  const cap = hex('#d24a3a'), capB = hex('#f0f0e6'), stem = hex('#e8dcc0');
  return (x, y, size) => {
    const cx = size / 2, cy = size * 0.42;
    const r = Math.hypot(x - cx, (y - cy) * 1.2);
    if (y > cy && Math.abs(x - cx) < 3 && y < size * 0.9) return [stem[0], stem[1], stem[2], 255];
    if (r < size * 0.3) {
      const spot = hash(Math.floor(x / 3), Math.floor(y / 3), 5) > 0.8;
      const c = spot ? capB : cap;
      return [c[0], c[1], c[2], 255];
    }
    return [0, 0, 0, 0];
  };
}

function cattail(): PixelFn {
  const stem = hex('#4a7a3a'), head = hex('#6b3f22');
  return (x, y, size) => {
    if (Math.abs(x - size * 0.5) < 1 && y > size * 0.12) return [stem[0], stem[1], stem[2], 255];
    if (Math.abs(x - size * 0.5) < 3 && y > size * 0.12 && y < size * 0.42) return [head[0], head[1], head[2], 255];
    if (Math.abs(x - size * 0.62) < 1) return [...stem, 255] as [number, number, number, number];
    return [0, 0, 0, 0];
  };
}

function lilypad(): PixelFn {
  const pad = hex('#4f9440'), pad2 = hex('#6bb04f');
  return (x, y, size) => {
    const r = Math.hypot(x - size / 2, y - size / 2);
    if (r > size * 0.42) return [0, 0, 0, 0];
    const notch = Math.abs(Math.atan2(y - size / 2, x - size / 2)) < 0.24;
    if (notch) return [0, 0, 0, 0];
    const c = r > size * 0.3 ? pad2 : pad;
    return [c[0], c[1], c[2], 255];
  };
}

function radial(color: RGB, power: number, alphaScale = 1): PixelFn {
  return (x, y, size) => {
    const cx = (x - size / 2) / (size / 2);
    const cy = (y - size / 2) / (size / 2);
    const d = Math.sqrt(cx * cx + cy * cy);
    const a = Math.max(0, 1 - d);
    return [color[0], color[1], color[2], clampI(Math.pow(a, power) * 255 * alphaScale)];
  };
}

function softBlob(color: RGB): PixelFn {
  return (x, y, size) => {
    const n = pfbm(x / size * 3, y / size * 3, 3, 9, 3);
    const cx = (x - size / 2) / (size / 2);
    const cy = (y - size / 2) / (size / 2);
    const d = Math.sqrt(cx * cx + cy * cy) + (n - 0.5) * 0.4;
    const a = Math.max(0, 1 - d);
    return [color[0], color[1], color[2], clampI(a * 150)];
  };
}

/* ------------------------------------------------------------------ library */

export class TextureLibrary {
  private cache = new Map<string, RawTexture>();
  private tiles: Record<string, Tile>;

  constructor(private scene: Scene) {
    this.tiles = TILES;
  }

  get(name: string, uv = 1): RawTexture {
    const tiles = Math.max(1, Math.round(uv));
    const key = tiles === 1 ? name : `${name}@${tiles}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const tile = this.tiles[name] ?? TILES.stone;
    const data = makeRGBA(tile.size, (x, y) => tile.fn(x, y, tile.size));
    const tex = RawTexture.CreateRGBATexture(data, tile.size, tile.size, this.scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    tex.name = `px_${key}`;
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = tiles;
    tex.vScale = tiles;
    tex.hasAlpha = Boolean(tile.alpha);
    tex.anisotropicFilteringLevel = 1;
    this.cache.set(key, tex);
    return tex;
  }

  has(name: string): boolean {
    return name in this.tiles;
  }

  dispose(): void {
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
  }
}

/* ------------------------------------------------------------------ icons */

const ICON_CACHE = new Map<string, string>();

interface IconSpec {
  bg: [string, string];
  draw: (ctx: CanvasRenderingContext2D, s: number) => void;
}

function pixel(ctx: CanvasRenderingContext2D, s: number, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

const ICONS: Record<string, IconSpec> = {
  sword: { bg: ['#22303f', '#131b26'], draw: (c, s) => {
    pixel(c, s, s * 0.46, s * 0.14, s * 0.08, s * 0.5, '#dfe7f2');
    pixel(c, s, s * 0.4, s * 0.6, s * 0.2, s * 0.07, '#c9932e');
    pixel(c, s, s * 0.47, s * 0.66, s * 0.06, s * 0.2, '#7a4a26');
  } },
  axe: { bg: ['#3a2a22', '#1a1210'], draw: (c, s) => {
    pixel(c, s, s * 0.47, s * 0.2, s * 0.06, s * 0.62, '#6b4326');
    pixel(c, s, s * 0.5, s * 0.18, s * 0.3, s * 0.24, '#c9d2dd');
    pixel(c, s, s * 0.5, s * 0.18, s * 0.08, s * 0.24, '#8b95a6');
  } },
  dagger: { bg: ['#2a3346', '#151b26'], draw: (c, s) => {
    pixel(c, s, s * 0.48, s * 0.28, s * 0.06, s * 0.34, '#dfe7f2');
    pixel(c, s, s * 0.42, s * 0.6, s * 0.16, s * 0.06, '#c9932e');
    pixel(c, s, s * 0.48, s * 0.64, s * 0.06, s * 0.14, '#5b3a22');
  } },
  bow: { bg: ['#26331f', '#12180e'], draw: (c, s) => {
    c.strokeStyle = '#8a5c34'; c.lineWidth = s * 0.06;
    c.beginPath(); c.arc(s * 0.5, s * 0.5, s * 0.28, -1.1, 1.1); c.stroke();
    pixel(c, s, s * 0.16, s * 0.16, s * 0.03, s * 0.68, '#d8c9a0');
  } },
  staff: { bg: ['#2a2246', '#151029'], draw: (c, s) => {
    pixel(c, s, s * 0.47, s * 0.24, s * 0.06, s * 0.6, '#7a5a34');
    c.fillStyle = '#b98cff';
    c.beginPath(); c.arc(s * 0.5, s * 0.2, s * 0.11, 0, Math.PI * 2); c.fill();
  } },
  wand: { bg: ['#2a2246', '#151029'], draw: (c, s) => {
    pixel(c, s, s * 0.48, s * 0.4, s * 0.05, s * 0.44, '#7a5a34');
    c.fillStyle = '#7fd0ff'; c.beginPath(); c.arc(s * 0.52, s * 0.34, s * 0.1, 0, Math.PI * 2); c.fill();
  } },
  shield: { bg: ['#1f2a38', '#0f151f'], draw: (c, s) => {
    c.fillStyle = '#b9c4d2';
    c.beginPath(); c.moveTo(s * 0.5, s * 0.16); c.lineTo(s * 0.8, s * 0.3); c.lineTo(s * 0.72, s * 0.74); c.lineTo(s * 0.5, s * 0.86); c.lineTo(s * 0.28, s * 0.74); c.lineTo(s * 0.2, s * 0.3); c.closePath(); c.fill();
    pixel(c, s, s * 0.47, s * 0.3, s * 0.06, s * 0.42, '#c9932e');
  } },
  armor: { bg: ['#2a2f3a', '#141820'], draw: (c, s) => {
    c.fillStyle = '#aeb9c8';
    c.beginPath(); c.moveTo(s * 0.32, s * 0.2); c.lineTo(s * 0.68, s * 0.2); c.lineTo(s * 0.76, s * 0.8); c.lineTo(s * 0.24, s * 0.8); c.closePath(); c.fill();
    pixel(c, s, s * 0.44, s * 0.2, s * 0.12, s * 0.6, '#6b7484');
  } },
  helmet: { bg: ['#2a2f3a', '#141820'], draw: (c, s) => {
    c.fillStyle = '#c2ccda';
    c.beginPath(); c.arc(s * 0.5, s * 0.55, s * 0.26, Math.PI, 0); c.fill();
    pixel(c, s, s * 0.24, s * 0.55, s * 0.52, s * 0.16, '#8b95a6');
    pixel(c, s, s * 0.46, s * 0.62, s * 0.08, s * 0.2, '#3a2a1a');
  } },
  potion: { bg: ['#2a1a2a', '#150d15'], draw: (c, s) => {
    pixel(c, s, s * 0.44, s * 0.16, s * 0.12, s * 0.12, '#7a5a34');
    c.fillStyle = '#e0555a';
    c.beginPath(); c.arc(s * 0.5, s * 0.62, s * 0.24, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff9a9e'; c.beginPath(); c.arc(s * 0.42, s * 0.54, s * 0.07, 0, Math.PI * 2); c.fill();
  } },
  mana_potion: { bg: ['#1a2436', '#0d131f'], draw: (c, s) => {
    pixel(c, s, s * 0.44, s * 0.16, s * 0.12, s * 0.12, '#7a5a34');
    c.fillStyle = '#3f7ed6';
    c.beginPath(); c.arc(s * 0.5, s * 0.62, s * 0.24, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8fc0ff'; c.beginPath(); c.arc(s * 0.42, s * 0.54, s * 0.07, 0, Math.PI * 2); c.fill();
  } },
  material: { bg: ['#2a2620', '#151310'], draw: (c, s) => {
    c.fillStyle = '#8a8f99';
    c.beginPath(); c.moveTo(s * 0.3, s * 0.72); c.lineTo(s * 0.44, s * 0.3); c.lineTo(s * 0.66, s * 0.34); c.lineTo(s * 0.72, s * 0.7); c.closePath(); c.fill();
    pixel(c, s, s * 0.44, s * 0.4, s * 0.16, s * 0.08, '#c2c7cf');
  } },
  ore: { bg: ['#20262e', '#10141a'], draw: (c, s) => {
    c.fillStyle = '#7a828e';
    c.beginPath(); c.arc(s * 0.42, s * 0.6, s * 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d98b4a';
    c.beginPath(); c.arc(s * 0.58, s * 0.46, s * 0.12, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffcf7a';
    c.beginPath(); c.arc(s * 0.6, s * 0.44, s * 0.05, 0, Math.PI * 2); c.fill();
  } },
  herb: { bg: ['#1f2a1c', '#101610'], draw: (c, s) => {
    pixel(c, s, s * 0.49, s * 0.4, s * 0.04, s * 0.44, '#3f7a38');
    c.fillStyle = '#6fc25a';
    c.beginPath(); c.ellipse(s * 0.38, s * 0.42, s * 0.1, s * 0.06, -0.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(s * 0.62, s * 0.42, s * 0.1, s * 0.06, 0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9be07a'; c.beginPath(); c.arc(s * 0.5, s * 0.32, s * 0.06, 0, Math.PI * 2); c.fill();
  } },
  crystal: { bg: ['#2a2246', '#140f26'], draw: (c, s) => {
    c.fillStyle = '#b98cff';
    c.beginPath(); c.moveTo(s * 0.5, s * 0.14); c.lineTo(s * 0.7, s * 0.5); c.lineTo(s * 0.5, s * 0.86); c.lineTo(s * 0.3, s * 0.5); c.closePath(); c.fill();
    c.fillStyle = '#e6d6ff'; c.beginPath(); c.moveTo(s * 0.5, s * 0.14); c.lineTo(s * 0.5, s * 0.86); c.lineTo(s * 0.3, s * 0.5); c.closePath(); c.fill();
  } },
  quest: { bg: ['#3a3218', '#1a160a'], draw: (c, s) => {
    pixel(c, s, s * 0.3, s * 0.2, s * 0.4, s * 0.6, '#e6d3ac');
    pixel(c, s, s * 0.36, s * 0.32, s * 0.28, s * 0.04, '#8a6a3a');
    pixel(c, s, s * 0.36, s * 0.44, s * 0.28, s * 0.04, '#8a6a3a');
    pixel(c, s, s * 0.36, s * 0.56, s * 0.18, s * 0.04, '#8a6a3a');
  } },
  gold: { bg: ['#3a3218', '#1a160a'], draw: (c, s) => {
    c.fillStyle = '#ffcc55';
    c.beginPath(); c.arc(s * 0.42, s * 0.56, s * 0.16, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(s * 0.6, s * 0.5, s * 0.14, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c9932e'; c.beginPath(); c.arc(s * 0.42, s * 0.56, s * 0.07, 0, Math.PI * 2); c.fill();
  } },
  slash: { bg: ['#3a2018', '#1a0f0c'], draw: (c, s) => {
    c.strokeStyle = '#ffd08a'; c.lineWidth = s * 0.07; c.beginPath();
    c.arc(s * 0.5, s * 0.5, s * 0.3, -2.2, 1.2); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = s * 0.03; c.beginPath();
    c.arc(s * 0.5, s * 0.5, s * 0.34, -1.9, 0.6); c.stroke();
  } },
  bolt: { bg: ['#2a2246', '#140f26'], draw: (c, s) => {
    c.fillStyle = '#8fd4ff';
    c.beginPath(); c.moveTo(s * 0.56, s * 0.14); c.lineTo(s * 0.32, s * 0.54); c.lineTo(s * 0.48, s * 0.54); c.lineTo(s * 0.4, s * 0.86); c.lineTo(s * 0.7, s * 0.42); c.lineTo(s * 0.52, s * 0.42); c.closePath(); c.fill();
  } },
  heal: { bg: ['#1f3226', '#0f1a13'], draw: (c, s) => {
    pixel(c, s, s * 0.42, s * 0.24, s * 0.16, s * 0.52, '#63d179');
    pixel(c, s, s * 0.24, s * 0.42, s * 0.52, s * 0.16, '#63d179');
  } },
  fire: { bg: ['#3a2010', '#1a0f08'], draw: (c, s) => {
    c.fillStyle = '#ff7a3c';
    c.beginPath(); c.moveTo(s * 0.5, s * 0.14); c.quadraticCurveTo(s * 0.8, s * 0.5, s * 0.5, s * 0.86); c.quadraticCurveTo(s * 0.2, s * 0.5, s * 0.5, s * 0.14); c.fill();
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.moveTo(s * 0.5, s * 0.4); c.quadraticCurveTo(s * 0.66, s * 0.6, s * 0.5, s * 0.8); c.quadraticCurveTo(s * 0.34, s * 0.6, s * 0.5, s * 0.5); c.fill();
  } },
  bolt_strike: { bg: ['#22303f', '#131b26'], draw: (c, s) => {
    pixel(c, s, s * 0.46, s * 0.14, s * 0.08, s * 0.72, '#fff2c0');
  } },
  book: { bg: ['#241c33', '#120d1c'], draw: (c, s) => {
    pixel(c, s, s * 0.24, s * 0.24, s * 0.24, s * 0.52, '#7a5aa6');
    pixel(c, s, s * 0.52, s * 0.2, s * 0.24, s * 0.6, '#9b6bff');
  } },
  leaf: { bg: ['#1f2a1c', '#101610'], draw: (c, s) => {
    c.fillStyle = '#6fc25a';
    c.beginPath(); c.ellipse(s * 0.5, s * 0.5, s * 0.3, s * 0.18, -0.8, 0, Math.PI * 2); c.fill();
    pixel(c, s, s * 0.28, s * 0.66, s * 0.44, s * 0.04, '#3f7a38');
  } },
  default: { bg: ['#1c2533', '#0e131c'], draw: (c, s) => {
    pixel(c, s, s * 0.34, s * 0.34, s * 0.32, s * 0.32, '#8896ad');
    pixel(c, s, s * 0.4, s * 0.4, s * 0.2, s * 0.2, '#d7e2f2');
  } },
};

export function generateIcon(key: string, size = 44): string {
  const cacheKey = `${key}@${size}`;
  const cached = ICON_CACHE.get(cacheKey);
  if (cached) return cached;
  const spec = ICONS[key] ?? ICONS.default;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, spec.bg[0]);
  grad.addColorStop(1, spec.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  spec.draw(ctx, size);
  const url = canvas.toDataURL('image/png');
  ICON_CACHE.set(cacheKey, url);
  return url;
}

export const ICON_KEYS = Object.keys(ICONS);

export { PIXEL };
