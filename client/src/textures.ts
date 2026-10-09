/**
 * Procedural pixel-art textures.
 *
 * Every texture is generated at runtime as a tiny (16x16 or 32x32) RGBA buffer
 * with nearest-neighbour sampling and no mipmaps, which gives crisp pixel
 * clusters at any distance. Nothing is downloaded: the whole art direction is
 * code-generated, keeping the build tiny and fully offline-capable.
 */
import { RawTexture, Scene, Texture } from 'babylonjs';

type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function imul(a: number, b: number): number {
  return Math.imul(a | 0, b | 0);
}

function rand(x: number, y: number, seed: number): number {
  let h = imul(x, 374761393) + imul(y, 668265263) + imul(seed, 1274126177);
  h = imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = rand(x0, y0, seed);
  const b = rand(x0 + 1, y0, seed);
  const c = rand(x0, y0 + 1, seed);
  const d = rand(x0 + 1, y0 + 1, seed);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

function make(size: number, fn: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

function cluster(x: number, y: number, seed: number, palette: RGB[], spread = 1): RGB {
  const v = noise(x * 0.42, y * 0.42, seed) * 0.72 + rand(x, y, seed) * 0.28;
  let idx = Math.floor(v * palette.length * spread);
  idx = Math.max(0, Math.min(palette.length - 1, idx));
  return palette[idx];
}

const GRASS: RGB[] = [hex('#3c7a2b'), hex('#4a8f34'), hex('#59a23f'), hex('#6fb84a')];
const GRASS_DARK: RGB[] = [hex('#2c5c22'), hex('#356a28'), hex('#3f7a2f'), hex('#4a8a38')];
const DIRT: RGB[] = [hex('#7a5a38'), hex('#8a6a44'), hex('#6b4d30'), hex('#96754d')];
const STONE: RGB[] = [hex('#6b7280'), hex('#7c8794'), hex('#8b96a3'), hex('#5c6672')];
const MOSS: RGB[] = [hex('#4a7a2e'), hex('#5c8f3a'), hex('#3a6323'), hex('#6aa044')];
const WOOD: RGB[] = [hex('#6b4a2b'), hex('#7d5836'), hex('#5a3d22'), hex('#8a6440')];
const LEAVES: RGB[] = [hex('#2f6b26'), hex('#3c8231'), hex('#4a9a3b'), hex('#276020')];
const LEAVES_DARK: RGB[] = [hex('#26502a'), hex('#2f6330'), hex('#38743a'), hex('#1e4420')];
const WATER: RGB[] = [hex('#2a6ea6'), hex('#3b82bf'), hex('#4f96d1'), hex('#25608f')];
const SAND: RGB[] = [hex('#d9c48a'), hex('#e4d29c'), hex('#cbb577'), hex('#efe0b0')];
const SNOW: RGB[] = [hex('#eef4fb'), hex('#dbe7f5'), hex('#ffffff'), hex('#cddcee')];
const RUIN: RGB[] = [hex('#9aa3ad'), hex('#aab2bb'), hex('#848d98'), hex('#b6bcc4')];

export class TextureLibrary {
  private cache = new Map<string, Texture>();

  constructor(private scene: Scene) {}

  get(name: string): Texture {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const tex = this.build(name);
    tex.name = `px_${name}`;
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 1;
    tex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
    tex.hasAlpha = name === 'cloud' || name === 'tuft' || name === 'flower' || name === 'mushroom' || name === 'glow' || name === 'shadow';
    this.cache.set(name, tex);
    return tex;
  }

  dispose() {
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
  }

  private raw(name: string, size: number, data: Uint8Array): Texture {
    const tex = RawTexture.CreateRGBATexture(data, size, size, this.scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    void name;
    return tex;
  }

  private build(name: string): Texture {
    switch (name) {
      case 'grass': return this.raw(name, 16, make(16, (x, y) => [...cluster(x, y, 11, GRASS), 255] as [number, number, number, number]));
      case 'grass_dark': return this.raw(name, 16, make(16, (x, y) => [...cluster(x, y, 23, GRASS_DARK), 255] as [number, number, number, number]));
      case 'dirt': return this.raw(name, 16, (() => {
        const d = make(16, (x, y) => {
          const c = cluster(x, y, 31, DIRT);
          const spec = rand(x, y, 77) > 0.9 ? 18 : 0;
          return [Math.min(255, c[0] + spec), Math.min(255, c[1] + spec), Math.min(255, c[2] + spec), 255] as [number, number, number, number];
        });
        return d;
      })());
      case 'stone': return this.raw(name, 16, make(16, (x, y) => {
        const c = cluster(x, y, 41, STONE);
        const crack = (x + y * 3) % 11 === 0 ? 26 : 0;
        return [Math.max(0, c[0] - crack), Math.max(0, c[1] - crack), Math.max(0, c[2] - crack), 255] as [number, number, number, number];
      }));
      case 'moss': return this.raw(name, 16, make(16, (x, y) => [...cluster(x, y, 51, MOSS), 255] as [number, number, number, number]));
      case 'wood': return this.raw(name, 16, make(16, (x, y) => {
        const grain = Math.sin(x * 0.9 + rand(0, y, 61) * 0.4) * 0.5 + 0.5;
        const base = WOOD[Math.min(3, Math.floor(grain * 4))];
        return [base[0], base[1], base[2], 255] as [number, number, number, number];
      }));
      case 'leaves': return this.raw(name, 16, make(16, (x, y) => [...cluster(x, y, 71, LEAVES, 1.15), 255] as [number, number, number, number]));
      case 'leaves_dark': return this.raw(name, 16, make(16, (x, y) => [...cluster(x, y, 81, LEAVES_DARK, 1.15), 255] as [number, number, number, number]));
      case 'water': return this.raw(name, 32, make(32, (x, y) => {
        const wave = Math.sin((x + y * 0.6) * 0.7) * 0.5 + 0.5;
        const idx = Math.min(3, Math.floor((wave * 0.7 + rand(x, y, 91) * 0.3) * 4));
        const c = WATER[idx];
        return [c[0], c[1], c[2], 210] as [number, number, number, number];
      }));
      case 'sand': return this.raw(name, 16, make(16, (x, y) => [...cluster(x, y, 101, SAND), 255] as [number, number, number, number]));
      case 'snow': return this.raw(name, 16, make(16, (x, y) => [...cluster(x, y, 111, SNOW, 0.9), 255] as [number, number, number, number]));
      case 'ruin': return this.raw(name, 16, make(16, (x, y) => {
        const block = ((((x / 4) | 0) + ((y / 4) | 0)) % 2 === 0) ? 6 : -6;
        const c = cluster(x, y, 121, RUIN);
        return [clamp8(c[0] + block), clamp8(c[1] + block), clamp8(c[2] + block), 255] as [number, number, number, number];
      }));
      case 'magic': return this.raw(name, 16, make(16, (x, y) => {
        const v = noise(x * 0.7, y * 0.7, 131);
        const c = v > 0.6 ? hex('#c4aef5') : v > 0.3 ? hex('#a888ea') : hex('#7d54c9');
        return [c[0], c[1], c[2], 255] as [number, number, number, number];
      }));
      case 'glow': return this.raw(name, 32, this.radial(32, hex('#b79cf0'), 230));
      case 'shadow': return this.raw(name, 32, this.radial(32, [0, 0, 0], 150));
      case 'sky': return this.raw(name, 64, this.sky());
      case 'cloud': return this.raw(name, 32, this.cloud());
      case 'tuft': return this.raw(name, 16, this.tuft());
      case 'flower': return this.raw(name, 16, this.flower());
      case 'mushroom': return this.raw(name, 16, this.mushroom());
      default: return this.raw(name, 16, make(16, () => [255, 0, 255, 255]));
    }
  }

  private radial(size: number, color: RGB, maxAlpha: number): Uint8Array {
    return make(size, (x, y) => {
      const dx = (x - size / 2 + 0.5) / (size / 2);
      const dy = (y - size / 2 + 0.5) / (size / 2);
      const d = Math.hypot(dx, dy);
      const a = Math.max(0, 1 - d);
      return [color[0], color[1], color[2], Math.round(Math.pow(a, 1.6) * maxAlpha)];
    });
  }

  private sky(): Uint8Array {
    const top = hex('#2f6fc0');
    const mid = hex('#5fa0dd');
    const horizon = hex('#cfe6f5');
    const below = hex('#a9c6b0');
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const v = y / (size - 1);
      let c: RGB;
      if (v < 0.42) {
        c = lerpColor(top, mid, v / 0.42);
      } else if (v < 0.52) {
        c = lerpColor(mid, horizon, (v - 0.42) / 0.1);
      } else {
        c = lerpColor(horizon, below, (v - 0.52) / 0.48);
      }
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = 255;
      }
    }
    return data;
  }

  private cloud(): Uint8Array {
    const size = 32;
    return make(size, (x, y) => {
      const nx = x / size;
      const ny = y / size;
      const n = noise(nx * 6, ny * 6, 201) * 0.6 + noise(nx * 12, ny * 12, 202) * 0.4;
      const edge = 1 - Math.abs(ny - 0.5) * 2;
      const shape = n * (0.5 + edge * 0.7);
      let a = (shape - 0.42) * 3.2;
      a = Math.max(0, Math.min(1, a));
      const shade = n < 0.5 ? 0.86 : 1;
      const r = Math.round(250 * shade);
      const g = Math.round(252 * shade);
      const b = Math.round(255 * shade);
      const alpha = y > size * 0.6 ? a * 0.7 : a;
      return [r, g, b, Math.round(alpha * 255)];
    });
  }

  private tuft(): Uint8Array {
    return make(16, (x, y) => {
      const blades = [4, 6, 9, 11];
      const on = blades.some((b) => Math.abs(x - b) < 1.1) && y > 5 + (x % 3);
      if (!on) return [0, 0, 0, 0];
      const c = y < 8 ? hex('#5aa23f') : hex('#3c7a2b');
      return [c[0], c[1], c[2], 255];
    });
  }

  private flower(): Uint8Array {
    const petals = hex('#e85d75');
    const center = hex('#ffd24a');
    const stem = hex('#3c7a2b');
    return make(16, (x, y) => {
      if (x === 7 && y > 8) return [stem[0], stem[1], stem[2], 255];
      const d = Math.hypot(x - 7.5, y - 4.5);
      if (d < 1.4) return [center[0], center[1], center[2], 255];
      if (d < 3.4) return [petals[0], petals[1], petals[2], 255];
      return [0, 0, 0, 0];
    });
  }

  private mushroom(): Uint8Array {
    const cap = hex('#c0392b');
    const spot = hex('#f2e9d8');
    const stem = hex('#e8dcc0');
    return make(16, (x, y) => {
      if (y > 9 && x > 6 && x < 10) return [stem[0], stem[1], stem[2], 255];
      const d = Math.hypot(x - 7.5, y - 7);
      if (d < 4.6) {
        const isSpot = (x === 5 && y === 5) || (x === 9 && y === 5) || (x === 7 && y === 8) || (x === 4 && y === 9) || (x === 11 && y === 8);
        const c = isSpot ? spot : cap;
        return [c[0], c[1], c[2], 255];
      }
      return [0, 0, 0, 0];
    });
  }
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}
