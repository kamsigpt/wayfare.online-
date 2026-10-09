/**
 * Deterministic terrain height functions for the visual layer.
 *
 * IMPORTANT: gameplay collision stays on the authoritative XZ plane defined by
 * the shared simulation. This module only shapes the *rendered* surface so the
 * world reads as genuine rolling 3D terrain. Both the ground mesh and every
 * character/prop sample the same function, so nothing floats or sinks.
 */

export interface TerrainProfile {
  amp: number;
  freq: number;
  seed: number;
  flatRadius: number;
  flatAmp: number;
}

const PROFILES: Record<string, TerrainProfile> = {
  elaris: { amp: 1.0, freq: 0.016, seed: 1337, flatRadius: 38, flatAmp: 0.22 },
  greenreach: { amp: 2.3, freq: 0.011, seed: 4242, flatRadius: 16, flatAmp: 1.0 },
  hollow: { amp: 3.2, freq: 0.016, seed: 9001, flatRadius: 12, flatAmp: 1.4 },
};

export function profileFor(zoneId: string): TerrainProfile {
  return PROFILES[zoneId] ?? PROFILES.greenreach;
}

function imul(a: number, b: number): number {
  return Math.imul(a | 0, b | 0);
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = imul(ix, 374761393) + imul(iz, 668265263) + imul(seed, 1274126177);
  h = imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return ab + (cd - ab) * sz;
}

function fbm(x: number, z: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fz, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fz *= 2.01;
  }
  return sum / norm;
}

/**
 * World-space height of the rendered terrain at (x, z) for a zone.
 * Returns roughly -amp..+amp around y = 0.
 */
export function terrainHeight(zoneId: string, x: number, z: number): number {
  const p = profileFor(zoneId);
  const n = fbm(x * p.freq, z * p.freq, p.seed, 3);
  let h = (n - 0.5) * 2 * p.amp;
  const d = Math.hypot(x, z);
  if (d < p.flatRadius) {
    const t = d / p.flatRadius;
    const s = t * t * (3 - 2 * t);
    const flatScale = p.flatAmp / p.amp;
    h *= flatScale + (1 - flatScale) * s;
  }
  return h;
}

/** Numeric normal (approximate) used for gentle prop alignment. */
export function terrainSlope(zoneId: string, x: number, z: number, e = 1.2): number {
  const hL = terrainHeight(zoneId, x - e, z);
  const hR = terrainHeight(zoneId, x + e, z);
  const dL = terrainHeight(zoneId, x, z - e);
  const dR = terrainHeight(zoneId, x, z + e);
  return Math.atan2(hR - hL, 2 * e) + Math.atan2(dR - dL, 2 * e) * 0.5;
}
