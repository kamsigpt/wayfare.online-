/**
 * Procedural low-poly model kit.
 *
 * Characters, creatures and town dressing are assembled here from boxes,
 * cylinders and simple polyhedra with animatable pivots. Every model is
 * deterministic and easy to replace with authored GLB assets later — callers
 * only depend on the returned `root` / `meshes` / `mats` / `limbs` shape.
 */

import {
  AbstractMesh,
  Color3,
  Material,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from 'babylonjs';
import type { TextureLibrary } from './textures.js';
import { PALETTE } from './visual.js';

export interface Limbs {
  body?: TransformNode;
  armR?: TransformNode;
  armL?: TransformNode;
  legR?: TransformNode;
  legL?: TransformNode;
  cape?: TransformNode;
  tail?: TransformNode;
  wingL?: TransformNode;
  wingR?: TransformNode;
  bodyBaseY?: number;
  floating?: boolean;
}

export interface BuiltModel {
  root: TransformNode;
  meshes: AbstractMesh[];
  mats: StandardMaterial[];
  limbs: Limbs;
  primary?: StandardMaterial;
}

export type HeadStyle = 'hair' | 'helm' | 'hood' | 'hat' | 'horns' | 'skull' | 'none';
export type WeaponKind = 'sword' | 'greatsword' | 'dagger' | 'bow' | 'staff' | 'wand' | 'axe' | 'hammer' | 'claw' | 'spear' | 'none';

export interface HumanoidOptions {
  scale: number;
  skin: string;
  hair: string;
  primary: string;
  secondary: string;
  accent: string;
  cape?: string;
  head: HeadStyle;
  weapon: WeaponKind;
  shield?: boolean;
  pauldrons?: boolean;
  glowingEyes?: boolean;
  eyeColor?: string;
  ears?: 'none' | 'pointed' | 'long';
  slim?: boolean;
}

/* ------------------------------------------------------------------ kit */

export class Kit {
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[] = [];
  readonly mats: StandardMaterial[] = [];
  readonly limbs: Limbs = {};
  primary?: StandardMaterial;
  private matCache = new Map<string, StandardMaterial>();

  constructor(readonly scene: Scene, readonly tex: TextureLibrary, name: string) {
    this.root = new TransformNode(name, scene);
  }

  solid(key: string, color: string, opts: { emissive?: number; alpha?: number } = {}): StandardMaterial {
    const cached = this.matCache.get(key);
    if (cached) return cached;
    const m = new StandardMaterial(`${this.root.name}_${key}`, this.scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = new Color3(0.03, 0.03, 0.03);
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(color).scale(opts.emissive);
    if (opts.alpha !== undefined && opts.alpha < 1) {
      m.alpha = opts.alpha;
      m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
    }
    this.matCache.set(key, m);
    this.mats.push(m);
    return m;
  }

  primaryMat(key: string, color: string): StandardMaterial {
    const m = this.solid(key, color);
    this.primary = m;
    return m;
  }

  textured(
    key: string,
    texName: string,
    opts: { uv?: number; alphaTest?: boolean; unlit?: boolean; emissive?: number; color?: string } = {},
  ): StandardMaterial {
    const cached = this.matCache.get(key);
    if (cached) return cached;
    const m = new StandardMaterial(`${this.root.name}_${key}`, this.scene);
    const t = this.tex.get(texName, opts.uv ?? 1);
    m.diffuseTexture = t;
    if (opts.color) m.diffuseColor = Color3.FromHexString(opts.color);
    m.specularColor = new Color3(0.02, 0.02, 0.02);
    if (opts.unlit) m.disableLighting = true;
    if (opts.emissive !== undefined) m.emissiveColor = new Color3(opts.emissive, opts.emissive, opts.emissive);
    if (opts.unlit) m.emissiveTexture = t;
    if (t.hasAlpha) {
      m.useAlphaFromDiffuseTexture = true;
      m.transparencyMode = Material.MATERIAL_ALPHATEST;
      m.alphaCutOff = 0.5;
      m.backFaceCulling = false;
    }
    this.matCache.set(key, m);
    this.mats.push(m);
    return m;
  }

  node(key: string, parent?: TransformNode, pos?: [number, number, number]): TransformNode {
    const n = new TransformNode(`${this.root.name}_${key}`, this.scene);
    n.parent = parent ?? this.root;
    if (pos) n.position.set(pos[0], pos[1], pos[2]);
    return n;
  }

  private tag(mesh: Mesh, parent?: TransformNode): Mesh {
    mesh.parent = parent ?? this.root;
    mesh.isPickable = false;
    this.meshes.push(mesh);
    return mesh;
  }

  private uid(key: string): string {
    return `${this.root.name}_${key}_${this.meshes.length}`;
  }

  box(key: string, dims: [number, number, number], pos: [number, number, number], mat: Material, parent?: TransformNode): Mesh {
    const m = MeshBuilder.CreateBox(this.uid(key), { width: dims[0], height: dims[1], depth: dims[2] }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    m.material = mat;
    return this.tag(m, parent);
  }

  cyl(key: string, dims: { top: number; bottom: number; height: number; tess?: number }, pos: [number, number, number], mat: Material, parent?: TransformNode): Mesh {
    const m = MeshBuilder.CreateCylinder(this.uid(key), { diameterTop: dims.top, diameterBottom: dims.bottom, height: dims.height, tessellation: dims.tess ?? 8 }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    m.material = mat;
    return this.tag(m, parent);
  }

  sphere(key: string, diameter: number, pos: [number, number, number], mat: Material, parent?: TransformNode, segments = 8): Mesh {
    const m = MeshBuilder.CreateSphere(this.uid(key), { diameter, segments }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    m.material = mat;
    return this.tag(m, parent);
  }

  poly(key: string, type: number, size: number, pos: [number, number, number], mat: Material, parent?: TransformNode): Mesh {
    const m = MeshBuilder.CreatePolyhedron(this.uid(key), { type, size }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    m.material = mat;
    return this.tag(m, parent);
  }

  plane(key: string, size: number, pos: [number, number, number], mat: Material, parent?: TransformNode): Mesh {
    const m = MeshBuilder.CreatePlane(this.uid(key), { size }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    m.material = mat;
    return this.tag(m, parent);
  }

  torus(key: string, dims: { diameter: number; thickness: number; tessellation?: number }, pos: [number, number, number], mat: Material, parent?: TransformNode): Mesh {
    const m = MeshBuilder.CreateTorus(this.uid(key), { diameter: dims.diameter, thickness: dims.thickness, tessellation: dims.tessellation ?? 12 }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    m.material = mat;
    return this.tag(m, parent);
  }

  result(): BuiltModel {
    return { root: this.root, meshes: this.meshes, mats: this.mats, limbs: this.limbs, primary: this.primary };
  }
}

/* ------------------------------------------------------------------ weapons */

function buildWeapon(kit: Kit, kind: WeaponKind, s: number, steel: StandardMaterial, wood: StandardMaterial, glow?: StandardMaterial): Mesh | null {
  const hand = kit.limbs.armR;
  const p = hand ?? kit.root;
  const at: [number, number, number] = [0, -0.5 * s, 0.16 * s];
  switch (kind) {
    case 'none':
      return null;
    case 'sword':
      return kit.box('w_sword', [0.07 * s, 0.95 * s, 0.05 * s], [at[0], at[1] + 0.1 * s, at[2]], steel, p);
    case 'greatsword':
      return kit.box('w_gs', [0.12 * s, 1.35 * s, 0.07 * s], [at[0], at[1] + 0.3 * s, at[2]], steel, p);
    case 'dagger':
      return kit.box('w_dagger', [0.05 * s, 0.42 * s, 0.04 * s], [at[0], at[1] + 0.05 * s, at[2]], steel, p);
    case 'axe': {
      kit.box('w_axe_h', [0.05 * s, 0.9 * s, 0.05 * s], at, wood, p);
      return kit.box('w_axe_b', [0.28 * s, 0.3 * s, 0.06 * s], [at[0] + 0.12 * s, at[1] + 0.35 * s, at[2]], steel, p);
    }
    case 'hammer': {
      kit.box('w_ham_h', [0.06 * s, 0.9 * s, 0.06 * s], at, wood, p);
      return kit.box('w_ham_b', [0.3 * s, 0.24 * s, 0.24 * s], [at[0], at[1] + 0.4 * s, at[2]], steel, p);
    }
    case 'bow': {
      const bow = kit.torus('w_bow', { diameter: 0.9 * s, thickness: 0.06 * s, tessellation: 12 }, [at[0], at[1] + 0.1 * s, at[2]], wood, p);
      bow.rotation.z = Math.PI / 2;
      return bow;
    }
    case 'staff': {
      const staff = kit.box('w_staff', [0.08 * s, 1.6 * s, 0.08 * s], [at[0], at[1] + 0.2 * s, at[2]], wood, p);
      if (glow) kit.sphere('w_orb', 0.22 * s, [at[0], at[1] + 1.02 * s, at[2]], glow, p, 6);
      return staff;
    }
    default:
      return kit.box('w_claw', [0.08 * s, 0.5 * s, 0.08 * s], at, steel, p);
  }
}

function buildShield(kit: Kit, s: number, face: StandardMaterial, rim: StandardMaterial): void {
  const p = kit.limbs.armL ?? kit.root;
  const shield = kit.cyl('sh', { top: 0.5 * s, bottom: 0.5 * s, height: 0.08 * s, tess: 6 }, [0, -0.52 * s, 0.14 * s], face, p);
  shield.rotation.x = Math.PI / 2;
  shield.scaling.y = 1.2;
  kit.cyl('sh_rim', { top: 0.14 * s, bottom: 0.14 * s, height: 0.1 * s, tess: 6 }, [0, -0.52 * s, 0.18 * s], rim, p).rotation.x = Math.PI / 2;
}

/* ------------------------------------------------------------------ humanoid */

export function makeHumanoid(kit: Kit, o: HumanoidOptions): void {
  const s = o.scale;
  const skin = kit.solid('skin', o.skin);
  const hair = kit.solid('hair', o.hair);
  const primary = kit.solid('primary', o.primary);
  kit.primary = primary;
  const secondary = kit.solid('secondary', o.secondary);
  const accent = kit.solid('accent', o.accent);
  const dark = kit.solid('dark', '#241a12');
  const steel = kit.solid('steel', PALETTE.ironLight);
  const glowMat = kit.solid('glow', PALETTE.arcane, { emissive: 0.75 });

  const body = kit.node('body', kit.root, [0, 0.58 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 0.58 * s;

  const torsoW = o.slim ? 0.4 : 0.5;
  kit.box('pelvis', [torsoW * 0.8 * s, 0.22 * s, 0.28 * s], [0, 0.06 * s, 0], secondary, body);
  kit.box('torso', [torsoW * s, 0.6 * s, 0.32 * s], [0, 0.42 * s, 0], primary, body);
  kit.box('belt', [torsoW * 0.92 * s, 0.09 * s, 0.34 * s], [0, 0.14 * s, 0], dark, body);
  kit.box('buckle', [0.1 * s, 0.1 * s, 0.04 * s], [0, 0.14 * s, 0.17 * s], accent, body);

  if (o.pauldrons) {
    for (const sx of [-1, 1]) {
      kit.box(`pauldron${sx}`, [0.26 * s, 0.2 * s, 0.34 * s], [sx * 0.34 * s, 0.68 * s, 0], accent, body);
      kit.box(`pauldronCap${sx}`, [0.22 * s, 0.1 * s, 0.3 * s], [sx * 0.34 * s, 0.8 * s, 0], steel, body);
    }
    kit.box('chest', [torsoW * 1.06 * s, 0.3 * s, 0.36 * s], [0, 0.55 * s, 0], accent, body);
  }

  kit.box('neck', [0.16 * s, 0.1 * s, 0.16 * s], [0, 0.78 * s, 0], skin, body);
  const head = kit.box('head', [0.34 * s, 0.34 * s, 0.32 * s], [0, 1.0 * s, 0], skin, body);
  void head;

  const eyeMat = o.glowingEyes ? kit.solid('eyes', '#ff5a3c', { emissive: 0.9 }) : dark;
  for (const sx of [-1, 1]) {
    kit.box(`eye${sx}`, [0.06 * s, 0.06 * s, 0.03 * s], [sx * 0.08 * s, 1.02 * s, 0.17 * s], eyeMat, body);
  }

  applyHead(kit, o, s, body, hair, accent, steel, dark);

  // arms
  const armR = kit.node('armR', body, [0.32 * s, 0.62 * s, 0]);
  const armL = kit.node('armL', body, [-0.32 * s, 0.62 * s, 0]);
  kit.limbs.armR = armR;
  kit.limbs.armL = armL;
  for (const [side, pivot] of [['R', armR], ['L', armL]] as [string, TransformNode][]) {
    kit.box(`upperArm${side}`, [0.14 * s, 0.42 * s, 0.15 * s], [0, -0.2 * s, 0], primary, pivot);
    kit.box(`foreArm${side}`, [0.12 * s, 0.28 * s, 0.13 * s], [0, -0.48 * s, 0], skin, pivot);
  }

  // legs
  const legR = kit.node('legR', body, [0.14 * s, 0.14 * s, 0]);
  const legL = kit.node('legL', body, [-0.14 * s, 0.14 * s, 0]);
  kit.limbs.legR = legR;
  kit.limbs.legL = legL;
  for (const [side, pivot] of [['R', legR], ['L', legL]] as [string, TransformNode][]) {
    kit.box(`thigh${side}`, [0.17 * s, 0.42 * s, 0.18 * s], [0, -0.2 * s, 0], secondary, pivot);
    kit.box(`shin${side}`, [0.16 * s, 0.3 * s, 0.17 * s], [0, -0.5 * s, 0], secondary, pivot);
    kit.box(`boot${side}`, [0.18 * s, 0.14 * s, 0.24 * s], [0, -0.66 * s, 0.03 * s], dark, pivot);
  }

  if (o.cape) {
    const cape = kit.node('cape', body, [0, 0.7 * s, -0.18 * s]);
    kit.box('capeC', [0.5 * s, 0.8 * s, 0.05 * s], [0, -0.4 * s, -0.04 * s], kit.solid('cape', o.cape), cape);
    kit.limbs.cape = cape;
  }

  buildWeapon(kit, o.weapon, s, steel, kit.solid('wd', '#6b4326'), glowMat);
  if (o.shield) buildShield(kit, s, accent, steel);
}

function applyHead(kit: Kit, o: HumanoidOptions, s: number, body: TransformNode, hair: StandardMaterial, accent: StandardMaterial, steel: StandardMaterial, dark: StandardMaterial): void {
  switch (o.head) {
    case 'hair':
      kit.box('hairTop', [0.38 * s, 0.16 * s, 0.36 * s], [0, 1.16 * s, 0], hair, body);
      kit.box('hairBack', [0.38 * s, 0.22 * s, 0.12 * s], [0, 1.04 * s, -0.14 * s], hair, body);
      break;
    case 'helm':
      kit.box('helmBowl', [0.4 * s, 0.24 * s, 0.38 * s], [0, 1.14 * s, 0], steel, body);
      kit.box('helmRim', [0.42 * s, 0.08 * s, 0.4 * s], [0, 1.02 * s, 0], accent, body);
      kit.box('helmNose', [0.08 * s, 0.2 * s, 0.06 * s], [0, 1.0 * s, 0.17 * s], steel, body);
      kit.box('plume', [0.08 * s, 0.26 * s, 0.3 * s], [0, 1.3 * s, -0.02 * s], accent, body);
      break;
    case 'hood': {
      kit.box('hoodBack', [0.42 * s, 0.44 * s, 0.3 * s], [0, 1.06 * s, -0.1 * s], accent, body);
      kit.box('hoodPeak', [0.3 * s, 0.2 * s, 0.28 * s], [0, 1.26 * s, -0.06 * s], accent, body);
      kit.box('hoodBrow', [0.36 * s, 0.12 * s, 0.1 * s], [0, 1.12 * s, 0.14 * s], accent, body);
      break;
    }
    case 'hat':
      kit.box('hatBrim', [0.6 * s, 0.05 * s, 0.56 * s], [0, 1.12 * s, 0], accent, body);
      kit.cyl('hatCone', { top: 0, bottom: 0.34 * s, height: 0.5 * s, tess: 6 }, [0, 1.32 * s, 0], accent, body);
      kit.sphere('hatTip', 0.08 * s, [0, 1.58 * s, 0], kit.solid('hatTipMat', PALETTE.arcane, { emissive: 0.6 }), body, 6);
      break;
    case 'horns':
      for (const sx of [-1, 1]) {
        const horn = kit.box(`horn${sx}`, [0.08 * s, 0.28 * s, 0.08 * s], [sx * 0.14 * s, 1.24 * s, -0.02 * s], dark, body);
        horn.rotation.z = sx * 0.4;
      }
      kit.box('hairTop', [0.34 * s, 0.12 * s, 0.32 * s], [0, 1.16 * s, 0], hair, body);
      break;
    case 'skull':
      kit.box('skullJaw', [0.3 * s, 0.14 * s, 0.3 * s], [0, 0.88 * s, 0.02 * s], kit.solid('bone', '#e8e2d0'), body);
      kit.solid('eyes', '#ff5a3c', { emissive: 0.8 });
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ creature helpers */

function quadrupedLegs(kit: Kit, body: TransformNode, s: number, color: StandardMaterial, positions: [number, number][]): void {
  const map: [string, 'armR' | 'armL' | 'legR' | 'legL'][] = [['fr', 'armR'], ['fl', 'armL'], ['br', 'legR'], ['bl', 'legL']];
  positions.forEach(([px, pz], i) => {
    const pivot = kit.node(`leg_${i}`, body, [px * s, -0.2 * s, pz * s]);
    kit.box(`legM_${i}`, [0.16 * s, 0.44 * s, 0.16 * s], [0, -0.22 * s, 0], color, pivot);
    kit.box(`hoof_${i}`, [0.18 * s, 0.1 * s, 0.2 * s], [0, -0.44 * s, 0.02 * s], kit.solid('hoof', '#2b2118'), pivot);
    kit.limbs[map[i][1]] = pivot;
  });
}

function buildWolf(kit: Kit, color: string, s: number): void {
  const fur = kit.solid('fur', color);
  kit.primary = fur;
  const belly = kit.solid('belly', '#d8d2c4');
  const dark = kit.solid('darkp', '#3a2f28');
  const body = kit.node('body', kit.root, [0, 0.62 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 0.62 * s;
  kit.box('torso', [0.6 * s, 0.56 * s, 1.3 * s], [0, 0, 0], fur, body);
  kit.box('belly', [0.5 * s, 0.3 * s, 1.1 * s], [0, -0.18 * s, 0.02 * s], belly, body);
  const neck = kit.node('neck', body, [0, 0.16 * s, 0.62 * s]);
  kit.box('neckM', [0.4 * s, 0.4 * s, 0.4 * s], [0, 0.1 * s, 0.06 * s], fur, neck);
  kit.box('head', [0.44 * s, 0.42 * s, 0.44 * s], [0, 0.32 * s, 0.34 * s], fur, neck);
  kit.box('snout', [0.26 * s, 0.24 * s, 0.34 * s], [0, 0.22 * s, 0.64 * s], fur, neck);
  kit.box('nose', [0.14 * s, 0.1 * s, 0.06 * s], [0, 0.22 * s, 0.82 * s], dark, neck);
  for (const sx of [-1, 1]) {
    kit.box(`ear${sx}`, [0.12 * s, 0.2 * s, 0.06 * s], [sx * 0.14 * s, 0.6 * s, 0.28 * s], fur, neck);
    kit.box(`eye${sx}`, [0.06 * s, 0.05 * s, 0.03 * s], [sx * 0.1 * s, 0.38 * s, 0.55 * s], kit.solid('eyes', '#ffd24a', { emissive: 0.6 }), neck);
  }
  const tail = kit.node('tail', body, [0, 0.16 * s, -0.66 * s]);
  kit.box('tailM', [0.2 * s, 0.52 * s, 0.16 * s], [0, -0.2 * s, -0.02 * s], fur, tail);
  kit.limbs.tail = tail;
  quadrupedLegs(kit, body, s, dark, [[-0.24, 0.42], [0.24, 0.42], [-0.24, -0.4], [0.24, -0.4]]);
}

function buildBoar(kit: Kit, color: string, s: number): void {
  const hide = kit.solid('hide', color);
  kit.primary = hide;
  const tusk = kit.solid('tusk', '#efe6d0');
  const body = kit.node('body', kit.root, [0, 0.5 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 0.5 * s;
  kit.box('torso', [0.66 * s, 0.6 * s, 1.2 * s], [0, 0, 0], hide, body);
  kit.box('hump', [0.5 * s, 0.24 * s, 0.7 * s], [0, 0.32 * s, -0.05 * s], hide, body);
  const head = kit.node('head', body, [0, -0.02 * s, 0.66 * s]);
  kit.box('snout', [0.42 * s, 0.4 * s, 0.5 * s], [0, 0, 0.22 * s], hide, head);
  kit.box('nose', [0.24 * s, 0.18 * s, 0.08 * s], [0, -0.06 * s, 0.5 * s], kit.solid('snoutTip', '#3a2a22'), head);
  for (const sx of [-1, 1]) {
    kit.box(`ear${sx}`, [0.14 * s, 0.16 * s, 0.1 * s], [sx * 0.2 * s, 0.26 * s, 0.04 * s], hide, head);
    const t = kit.box(`tusk${sx}`, [0.06 * s, 0.22 * s, 0.06 * s], [sx * 0.16 * s, -0.12 * s, 0.42 * s], tusk, head);
    t.rotation.z = sx * 0.5;
    kit.box(`eye${sx}`, [0.06 * s, 0.06 * s, 0.03 * s], [sx * 0.14 * s, 0.12 * s, 0.42 * s], kit.solid('eyes', '#ffd24a', { emissive: 0.6 }), head);
  }
  quadrupedLegs(kit, body, s, kit.solid('legdark', '#3a2a20'), [[-0.26, 0.4], [0.26, 0.4], [-0.26, -0.38], [0.26, -0.38]]);
}

function buildWisp(kit: Kit, color: string, s: number): void {
  const core = kit.solid('core', color, { emissive: 0.85 });
  kit.primary = core;
  const halo = kit.solid('halo', '#ffffff', { emissive: 0.6, alpha: 0.5 });
  const body = kit.node('body', kit.root, [0, 1.1 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 1.1 * s;
  kit.limbs.floating = true;
  kit.sphere('orb', 1.1 * s, [0, 0, 0], core, body, 8);
  kit.sphere('halo', 1.7 * s, [0, 0, 0], halo, body, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    kit.sphere(`mote${i}`, 0.18 * s, [Math.cos(a) * 1.1 * s, Math.sin(a * 2) * 0.3 * s, Math.sin(a) * 1.1 * s], core, body, 5);
  }
}

function buildGolem(kit: Kit, color: string, s: number, crystal = false): void {
  const rock = kit.solid('rock', color);
  kit.primary = rock;
  const moss = kit.solid('moss', PALETTE.rockDark);
  const core = kit.solid('core', crystal ? PALETTE.arcane : PALETTE.foliageDeep, { emissive: 0.5 });
  const body = kit.node('body', kit.root, [0, 0.9 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 0.9 * s;
  kit.box('torso', [1.2 * s, 1.1 * s, 0.8 * s], [0, 0, 0], rock, body);
  kit.sphere('core', 0.34 * s, [0, 0.1 * s, 0.42 * s], core, body, 6);
  kit.box('head', [0.55 * s, 0.5 * s, 0.5 * s], [0, 0.82 * s, 0], rock, body);
  const eye = kit.solid('eyes', crystal ? '#8fe4ff' : '#d6ff7a', { emissive: 0.9 });
  kit.box('eyeL', [0.1 * s, 0.08 * s, 0.04 * s], [0.12 * s, 0.84 * s, 0.26 * s], eye, body);
  kit.box('eyeR', [0.1 * s, 0.08 * s, 0.04 * s], [-0.12 * s, 0.84 * s, 0.26 * s], eye, body);
  const armR = kit.node('armR', body, [0.75 * s, 0.5 * s, 0]);
  const armL = kit.node('armL', body, [-0.75 * s, 0.5 * s, 0]);
  kit.limbs.armR = armR;
  kit.limbs.armL = armL;
  for (const [pivot, sx] of [[armR, 1], [armL, -1]] as [TransformNode, number][]) {
    kit.box('upper', [0.3 * s, 0.7 * s, 0.3 * s], [0, -0.32 * s, 0], rock, pivot);
    kit.box('fist', [0.4 * s, 0.4 * s, 0.4 * s], [0, -0.72 * s, 0], moss, pivot);
    void sx;
  }
  for (const sx of [-1, 1] as const) {
    kit.box(`leg${sx}`, [0.36 * s, 0.7 * s, 0.36 * s], [sx * 0.3 * s, -0.86 * s, 0], rock, body);
  }
  if (crystal) {
    for (let i = 0; i < 3; i++) {
      const spike = kit.poly(`spike${i}`, 0, 0.3 * s, [(i - 1) * 0.35 * s, 0.62 * s, -0.3 * s], core, body);
      spike.rotation.z = (i - 1) * 0.3;
    }
  }
}

function buildSkeleton(kit: Kit, color: string, s: number): void {
  const bone = kit.solid('bone', '#e8e2d0');
  kit.primary = bone;
  const cloth = kit.solid('cloth', color);
  const body = kit.node('body', kit.root, [0, 0.6 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 0.6 * s;
  kit.box('spine', [0.16 * s, 0.55 * s, 0.16 * s], [0, 0.4 * s, 0], bone, body);
  for (let i = 0; i < 3; i++) {
    kit.box(`rib${i}`, [0.44 * s, 0.06 * s, 0.24 * s], [0, 0.58 * s - i * 0.14 * s, 0], bone, body);
  }
  kit.box('skull', [0.32 * s, 0.32 * s, 0.3 * s], [0, 1.0 * s, 0], bone, body);
  kit.box('jaw', [0.28 * s, 0.1 * s, 0.26 * s], [0, 0.86 * s, 0.04 * s], bone, body);
  const eye = kit.solid('eyes', '#ff6a3c', { emissive: 0.85 });
  kit.box('eyeL', [0.07 * s, 0.07 * s, 0.03 * s], [0.08 * s, 1.02 * s, 0.16 * s], eye, body);
  kit.box('eyeR', [0.07 * s, 0.07 * s, 0.03 * s], [-0.08 * s, 1.02 * s, 0.16 * s], eye, body);
  kit.box('cloth', [0.44 * s, 0.3 * s, 0.3 * s], [0, 0.28 * s, 0], cloth, body);
  const armR = kit.node('armR', body, [0.28 * s, 0.6 * s, 0]);
  const armL = kit.node('armL', body, [-0.28 * s, 0.6 * s, 0]);
  kit.limbs.armR = armR;
  kit.limbs.armL = armL;
  for (const pivot of [armR, armL]) {
    kit.box('armB', [0.1 * s, 0.5 * s, 0.1 * s], [0, -0.24 * s, 0], bone, pivot);
  }
  const legR = kit.node('legR', body, [0.12 * s, 0.16 * s, 0]);
  const legL = kit.node('legL', body, [-0.12 * s, 0.16 * s, 0]);
  kit.limbs.legR = legR;
  kit.limbs.legL = legL;
  for (const pivot of [legR, legL]) {
    kit.box('legB', [0.12 * s, 0.55 * s, 0.12 * s], [0, -0.28 * s, 0], bone, pivot);
  }
}

function buildGoblin(kit: Kit, color: string, s: number): void {
  const skin = kit.solid('skin', color);
  kit.primary = skin;
  const cloth = kit.solid('cloth', '#5a4a2a');
  const tooth = kit.solid('tooth', '#efe6d0');
  const body = kit.node('body', kit.root, [0, 0.55 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 0.55 * s;
  kit.box('torso', [0.42 * s, 0.5 * s, 0.3 * s], [0, 0.35 * s, 0], skin, body);
  kit.box('rag', [0.44 * s, 0.22 * s, 0.32 * s], [0, 0.16 * s, 0], cloth, body);
  const head = kit.box('head', [0.36 * s, 0.32 * s, 0.34 * s], [0, 0.82 * s, 0], skin, body);
  void head;
  for (const sx of [-1, 1]) {
    const ear = kit.box(`ear${sx}`, [0.06 * s, 0.14 * s, 0.34 * s], [sx * 0.2 * s, 0.86 * s, -0.02 * s], skin, body);
    ear.rotation.z = sx * 0.6;
    kit.box(`eye${sx}`, [0.06 * s, 0.06 * s, 0.03 * s], [sx * 0.08 * s, 0.84 * s, 0.18 * s], kit.solid('eyes', '#ffd24a', { emissive: 0.5 }), body);
  }
  kit.box('tooth', [0.06 * s, 0.1 * s, 0.04 * s], [0.06 * s, 0.72 * s, 0.16 * s], tooth, body);
  const armR = kit.node('armR', body, [0.28 * s, 0.56 * s, 0]);
  const armL = kit.node('armL', body, [-0.28 * s, 0.56 * s, 0]);
  kit.limbs.armR = armR;
  kit.limbs.armL = armL;
  for (const pivot of [armR, armL]) {
    kit.box('arm', [0.12 * s, 0.44 * s, 0.12 * s], [0, -0.22 * s, 0], skin, pivot);
  }
  const legR = kit.node('legR', body, [0.12 * s, 0.14 * s, 0]);
  const legL = kit.node('legL', body, [-0.12 * s, 0.14 * s, 0]);
  kit.limbs.legR = legR;
  kit.limbs.legL = legL;
  for (const pivot of [legR, legL]) {
    kit.box('legG', [0.13 * s, 0.5 * s, 0.13 * s], [0, -0.24 * s, 0], cloth, pivot);
  }
  buildWeapon(kit, 'dagger', s, kit.solid('blade', PALETTE.ironLight), kit.solid('wd', '#4a3520'));
}

function buildOgre(kit: Kit, color: string, s: number): void {
  const skin = kit.solid('skin', color);
  kit.primary = skin;
  const loin = kit.solid('loin', '#5a4630');
  const tusk = kit.solid('tusk', '#efe6d0');
  const body = kit.node('body', kit.root, [0, 1.0 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 1.0 * s;
  kit.box('torso', [1.0 * s, 1.0 * s, 0.7 * s], [0, 0, 0], skin, body);
  kit.box('belly', [0.7 * s, 0.5 * s, 0.4 * s], [0, -0.2 * s, 0.2 * s], skin, body);
  kit.box('loin', [0.9 * s, 0.3 * s, 0.72 * s], [0, -0.5 * s, 0], loin, body);
  const neck = kit.node('neck', body, [0, 0.55 * s, 0.05 * s]);
  kit.box('head', [0.5 * s, 0.46 * s, 0.48 * s], [0, 0.2 * s, 0.1 * s], skin, neck);
  kit.box('brow', [0.52 * s, 0.1 * s, 0.2 * s], [0, 0.34 * s, 0.2 * s], skin, neck);
  for (const sx of [-1, 1]) {
    const t = kit.box(`tusk${sx}`, [0.07 * s, 0.24 * s, 0.07 * s], [sx * 0.14 * s, 0.06 * s, 0.34 * s], tusk, neck);
    t.rotation.z = sx * 0.25;
    kit.box(`eye${sx}`, [0.08 * s, 0.06 * s, 0.03 * s], [sx * 0.12 * s, 0.26 * s, 0.34 * s], kit.solid('eyes', '#ffd24a', { emissive: 0.5 }), neck);
  }
  const armR = kit.node('armR', body, [0.62 * s, 0.35 * s, 0]);
  const armL = kit.node('armL', body, [-0.62 * s, 0.35 * s, 0]);
  kit.limbs.armR = armR;
  kit.limbs.armL = armL;
  for (const pivot of [armR, armL]) {
    kit.box('upper', [0.32 * s, 0.8 * s, 0.32 * s], [0, -0.36 * s, 0], skin, pivot);
    kit.box('fist', [0.4 * s, 0.4 * s, 0.4 * s], [0, -0.8 * s, 0], skin, pivot);
  }
  for (const sx of [-1, 1] as const) {
    kit.box(`leg${sx}`, [0.34 * s, 0.75 * s, 0.34 * s], [sx * 0.28 * s, -0.9 * s, 0], skin, body);
    kit.box(`foot${sx}`, [0.36 * s, 0.18 * s, 0.5 * s], [sx * 0.28 * s, -1.24 * s, 0.08 * s], kit.solid('foot', '#3a2a20'), body);
  }
  kit.box('club', [0.16 * s, 1.1 * s, 0.16 * s], [0, -0.9 * s, 0.2 * s], kit.solid('wd', '#5a3a20'), armR);
  kit.sphere('clubHead', 0.5 * s, [0, -1.5 * s, 0.2 * s], kit.solid('clubHead', '#4a3a2a'), armR, 6);
}

function buildDragon(kit: Kit, color: string, s: number): void {
  const scale = kit.solid('scale', color);
  kit.primary = scale;
  const belly = kit.solid('belly', shadeHex(color, 1.4));
  const horn = kit.solid('horn', '#efe6d0');
  const membrane = kit.solid('membrane', shadeHex(color, 0.7), { alpha: 0.85 });
  const eye = kit.solid('eyes', '#ffd24a', { emissive: 0.9 });
  const body = kit.node('body', kit.root, [0, 1.1 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 1.1 * s;
  kit.limbs.floating = true;
  kit.box('torso', [0.9 * s, 0.9 * s, 1.8 * s], [0, 0, 0], scale, body);
  kit.box('belly', [0.6 * s, 0.4 * s, 1.6 * s], [0, -0.36 * s, 0], belly, body);
  const neck = kit.node('neck', body, [0, 0.4 * s, 0.9 * s]);
  kit.cyl('neckS', { top: 0.34 * s, bottom: 0.42 * s, height: 0.9 * s, tess: 6 }, [0, 0.3 * s, 0.1 * s], scale, neck).rotation.x = -0.5;
  const head = kit.node('head', neck, [0, 0.85 * s, 0.4 * s]);
  kit.box('skull', [0.5 * s, 0.44 * s, 0.6 * s], [0, 0, 0], scale, head);
  kit.box('snout', [0.34 * s, 0.3 * s, 0.4 * s], [0, -0.06 * s, 0.42 * s], scale, head);
  kit.box('jaw', [0.3 * s, 0.12 * s, 0.36 * s], [0, -0.2 * s, 0.4 * s], belly, head);
  for (const sx of [-1, 1]) {
    const h = kit.box(`horn${sx}`, [0.08 * s, 0.4 * s, 0.08 * s], [sx * 0.18 * s, 0.34 * s, -0.1 * s], horn, head);
    h.rotation.x = -0.4;
    h.rotation.z = sx * 0.3;
    kit.box(`eye${sx}`, [0.09 * s, 0.08 * s, 0.03 * s], [sx * 0.14 * s, 0.08 * s, 0.28 * s], eye, head);
  }
  const wingR = kit.node('wingR', body, [0.4 * s, 0.4 * s, 0.2 * s]);
  const wingL = kit.node('wingL', body, [-0.4 * s, 0.4 * s, 0.2 * s]);
  kit.limbs.wingR = wingR;
  kit.limbs.wingL = wingL;
  for (const [pivot, sx] of [[wingR, 1], [wingL, -1]] as [TransformNode, number][]) {
    kit.box('wingArm', [0.12 * s, 0.12 * s, 1.6 * s], [sx * 0.6 * s, 0.4 * s, -0.4 * s], scale, pivot).rotation.y = sx * 0.5;
    const wing = kit.plane('wingWeb', 1.8 * s, [sx * 1.4 * s, 0.2 * s, -0.4 * s], membrane, pivot);
    wing.rotation.x = Math.PI / 2.2;
    wing.rotation.z = sx * 0.4;
  }
  for (const [sx, pz] of [[-1, 0.7], [1, 0.7], [-1, -0.7], [1, -0.7]] as [number, number][]) {
    kit.box(`leg${sx}_${pz}`, [0.2 * s, 0.6 * s, 0.2 * s], [sx * 0.42 * s, -0.6 * s, pz * s], scale, body);
  }
  const tail = kit.node('tail', body, [0, 0, -0.9 * s]);
  kit.limbs.tail = tail;
  for (let i = 0; i < 5; i++) {
    const t = kit.box(`tailSeg${i}`, [0.3 * s - i * 0.04 * s, 0.3 * s - i * 0.04 * s, 0.4 * s], [0, -0.1 * s, -0.3 * s - i * 0.36 * s], scale, tail);
    void t;
  }
  const spike = kit.poly('tailSpike', 0, 0.28 * s, [0, 0, -2.2 * s], horn, tail);
  void spike;
}

function buildDummy(kit: Kit, s: number): void {
  const wood = kit.solid('wood', '#6b4326');
  kit.primary = wood;
  const straw = kit.solid('straw', '#c9a75c');
  const body = kit.node('body', kit.root, [0, 0.9 * s, 0]);
  kit.limbs.body = body;
  kit.limbs.bodyBaseY = 0.9 * s;
  kit.box('post', [0.2 * s, 1.6 * s, 0.2 * s], [0, 0, 0], wood, body);
  kit.box('cross', [1.1 * s, 0.16 * s, 0.16 * s], [0, 0.3 * s, 0], wood, body);
  kit.sphere('pads', 0.9 * s, [0, 0.1 * s, 0], straw, body, 6).scaling.y = 0.7;
  kit.box('base', [0.7 * s, 0.2 * s, 0.9 * s], [0, -0.8 * s, 0], wood, body);
}

function shadeHex(color: string, f: number): string {
  const n = parseInt(color.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------ dispatchers */

export type EnemyArchetype = 'hunter' | 'brute' | 'caster' | 'assassin' | 'guardian' | 'swarm';

export function makeEnemy(kit: Kit, defId: string, archetype: string, color: string, scale: number): void {
  const id = defId.toLowerCase();
  const s = 0.95 * scale;
  if (id.includes('dummy')) return buildDummy(kit, scale);
  if (id.includes('dragon')) return buildDragon(kit, color, scale);
  if (id.includes('wisp')) return buildWisp(kit, color, scale);
  if (id.includes('golem') || id.includes('guardian')) return buildGolem(kit, color, scale, id.includes('rift'));
  if (id.includes('boar')) return buildBoar(kit, color, scale);
  if (id.includes('wolf') || id.includes('hound') || archetype === 'hunter') return buildWolf(kit, color, scale);
  if (id.includes('ogre') || archetype === 'brute') return buildOgre(kit, color, scale);
  if (id.includes('goblin')) return buildGoblin(kit, color, scale);
  if (id.includes('skeleton') || id.includes('ghoul') || id.includes('skel')) return buildSkeleton(kit, color, scale);
  if (id.includes('bandit') || id.includes('cutthroat') || id.includes('brute') || archetype === 'assassin') {
    makeHumanoid(kit, {
      scale: s,
      skin: '#c98f5a',
      hair: '#2b2b2b',
      primary: id.includes('brute') ? '#54432c' : '#4a3a30',
      secondary: '#2f2620',
      accent: '#7a6a4a',
      head: 'hood',
      weapon: id.includes('brute') ? 'axe' : 'dagger',
      shield: false,
      glowingEyes: false,
    });
    return;
  }
  if (id.includes('lurker') || id.includes('stalker') || id.includes('ghoul')) return buildSkeleton(kit, color, scale);
  makeHumanoid(kit, {
    scale: s,
    skin: '#c98f5a',
    hair: '#2b2b2b',
    primary: color,
    secondary: '#3a2a20',
    accent: '#6b5a3a',
    head: archetype === 'caster' ? 'hood' : 'horns',
    weapon: archetype === 'caster' ? 'staff' : 'sword',
    glowingEyes: archetype === 'caster',
  });
}

/* ------------------------------------------------------------------ player & npc looks */

export interface LookOptions {
  skin: string;
  hair: string;
  bodyColor: string;
  archetype: string;
}

export function makePlayer(kit: Kit, o: LookOptions): void {
  const base: HumanoidOptions = {
    scale: 1,
    skin: o.skin,
    hair: o.hair,
    primary: o.bodyColor,
    secondary: '#3f4a58',
    accent: PALETTE.ironLight,
    head: 'hair',
    weapon: 'sword',
  };
  switch (o.archetype) {
    case 'vanguard':
      Object.assign(base, { primary: o.bodyColor, secondary: '#5a2f2f', accent: '#b9c4d2', cape: '#8a2f2f', head: 'helm', weapon: 'sword', shield: true, pauldrons: true });
      break;
    case 'strider':
      Object.assign(base, { primary: '#4f6b34', secondary: '#3a2f22', accent: '#7a5a30', head: 'hood', weapon: 'bow', pauldrons: true });
      break;
    case 'arcanist':
      Object.assign(base, { primary: '#2f4f9c', secondary: '#22345f', accent: '#7a5cc0', head: 'hat', weapon: 'staff', cape: '#22345f' });
      break;
    case 'warden':
      Object.assign(base, { primary: '#2f7a6a', secondary: '#24544a', accent: '#8fd06a', head: 'hood', weapon: 'staff', cape: '#24544a' });
      break;
    case 'reaver':
      Object.assign(base, { primary: o.bodyColor, secondary: '#2a1830', accent: '#8a2f3a', cape: '#3a2040', head: 'horns', weapon: 'greatsword', pauldrons: true });
      break;
    default:
      Object.assign(base, { primary: o.bodyColor, head: 'hair', weapon: 'sword' });
      break;
  }
  makeHumanoid(kit, base);
}

export function makeNpc(kit: Kit, role: string, color: string): void {
  const base: HumanoidOptions = {
    scale: 1,
    skin: '#e0ac69',
    hair: '#5d4037',
    primary: color,
    secondary: '#4a4030',
    accent: PALETTE.gold,
    head: 'hair',
    weapon: 'none',
  };
  switch (role) {
    case 'guard':
      Object.assign(base, { primary: '#8a95a6', secondary: '#4a5568', accent: '#c9932e', head: 'helm', weapon: 'sword', shield: true, pauldrons: true });
      break;
    case 'merchant':
      Object.assign(base, { primary: color, secondary: '#6b5a3a', accent: '#c9a75c', head: 'hair' });
      break;
    default:
      break;
  }
  makeHumanoid(kit, base);
}

/* ------------------------------------------------------------------ static props */

export function buildTreeModel(kit: Kit, h: number, variant: 'leaf' | 'pine' | 'autumn'): void {
  const trunkMat = kit.textured('trunk', 'wood', { uv: 2, color: '#7a4f2e' });
  const leafMat = kit.textured('leaf', variant === 'pine' ? 'pine' : variant === 'autumn' ? 'leaves' : 'leaves', { alphaTest: true });
  const trunkH = h * 0.55;
  kit.cyl('trunkM', { top: 0.34, bottom: 0.55, height: trunkH, tess: 6 }, [0, trunkH / 2, 0], trunkMat);
  if (variant === 'pine') {
    for (let i = 0; i < 3; i++) {
      const r = 2.0 - i * 0.45;
      const yy = trunkH * 0.7 + i * 1.1;
      const cone = kit.cyl(`pineTier${i}`, { top: 0, bottom: r * 1.5, height: 1.7, tess: 7 }, [0, yy, 0], leafMat);
      void cone;
    }
  } else {
    kit.poly('canopy1', 3, 2.2 + (h % 2) * 0.3, [0, trunkH * 0.75, 0], leafMat).scaling.y = 1.1;
    kit.poly('canopy2', 3, 1.6, [0.7, trunkH * 0.95, -0.4], leafMat).scaling.y = 1.05;
    kit.poly('canopy3', 3, 1.4, [-0.7, trunkH * 0.9, 0.5], leafMat).scaling.y = 1.0;
  }
}

export function buildRockModel(kit: Kit, size: number, dark: boolean): void {
  const mat = kit.solid('rock', dark ? PALETTE.rockDark : PALETTE.rockMid);
  kit.poly('rockA', 1, size * 0.6, [0, size * 0.35, 0], mat).scaling.y = 0.85;
  kit.poly('rockB', 1, size * 0.42, [size * 0.5, size * 0.25, size * 0.3], mat);
  kit.poly('rockC', 1, size * 0.34, [-size * 0.45, size * 0.2, -size * 0.3], mat);
}

export function buildBuilding(kit: Kit, w: number, d: number, h: number, roof: 'red' | 'blue' | 'green' | 'slate' | 'thatch'): void {
  const plaster = kit.textured('wall', 'plaster', { uv: Math.max(2, Math.round(w / 3)) });
  const timber = kit.textured('timber', 'timber', { uv: 2 });
  const roofMat = roof === 'thatch' ? kit.textured('roof', 'thatch', { uv: Math.max(2, Math.round(w / 3)) }) : kit.textured('roof', `roof_${roof}`, { uv: Math.max(2, Math.round(w / 3)) });
  const stone = kit.textured('stone', 'stone', { uv: Math.max(2, Math.round(w / 4)) });
  const door = kit.textured('door', 'door');
  const win = kit.textured('window', 'window', { alphaTest: true });
  const winLight = kit.solid('winLight', PALETTE.windowGlow, { emissive: 0.6 });

  kit.box('base', [w, h, d], [0, h / 2, 0], plaster);
  kit.box('foundation', [w * 1.02, h * 0.16, d * 1.02], [0, h * 0.08, 0], stone);
  // timber frame
  for (const sx of [-1, 1]) {
    kit.box(`beamX${sx}`, [0.22, h * 1.02, 0.22], [sx * (w / 2 - 0.15), h / 2, 0], timber);
    kit.box(`beamZ${sx}`, [0.22, h * 1.02, 0.22], [0, h / 2, sx * (d / 2 - 0.15)], timber);
  }
  kit.box('beamTopZ', [w, 0.2, 0.24], [0, h - 0.12, d / 2 - 0.15], timber);
  kit.box('beamTopZ2', [w, 0.2, 0.24], [0, h - 0.12, -(d / 2 - 0.15)], timber);
  kit.box('beamMid', [w, 0.18, 0.22], [0, h * 0.55, d / 2 + 0.01], timber);
  // door
  const doorH = Math.min(h * 0.6, 1.7);
  kit.box('doorway', [0.9, doorH, 0.12], [0, doorH / 2, d / 2 + 0.02], door);
  // windows
  const wy = doorH + 0.5;
  if (h > wy + 0.4) {
    for (const sx of [-1, 1]) {
      kit.box(`win${sx}`, [0.7, 0.7, 0.1], [sx * w * 0.28, wy, d / 2 + 0.02], win);
      kit.box(`winL${sx}`, [0.5, 0.5, 0.05], [sx * w * 0.28, wy, d / 2 + 0.07], winLight);
    }
  }
  // roof
  const roofH = Math.max(w, d) * 0.5;
  const roofMesh = kit.cyl('roofM', { top: 0, bottom: Math.max(w, d) * 1.42, height: roofH, tess: 4 }, [0, h + roofH / 2 - 0.05, 0], roofMat);
  roofMesh.rotation.y = Math.PI / 4;
  // chimney
  const chimney = kit.box('chimney', [0.5, roofH * 0.6, 0.5], [w * 0.28, h + roofH * 0.6, -d * 0.2], stone);
  void chimney;
  // overhang
  kit.box('eave', [w * 1.1, 0.12, d * 1.1], [0, h - 0.02, 0], timber);
}

export function buildStall(kit: Kit, awning: string): void {
  const post = kit.solid('stallPost', '#5a3a20');
  const counter = kit.textured('stallCounter', 'wood', { uv: 2, color: '#5a3a22' });
  const board = kit.solid('stallBoard', '#7a5a34');
  const awnMat = kit.solid('awning', awning);
  const stripe = kit.solid('awnStripe', '#efe6d0');
  const w = 2.4, d = 1.4;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box(`post${sx}${sz}`, [0.12, 2.1, 0.12], [sx * w / 2, 1.05, sz * d / 2], post);
    }
  }
  kit.box('counter', [w, 0.7, d], [0, 0.35, 0], counter);
  kit.box('top', [w * 1.05, 0.1, d * 1.1], [0, 0.75, 0], board);
  const awn = kit.box('awning', [w * 1.2, 0.12, d * 1.4], [0, 2.05, 0.15], awnMat);
  awn.rotation.x = -0.25;
  for (let i = -1; i <= 1; i++) {
    kit.box(`stripe${i}`, [w * 0.28, 0.14, d * 1.42], [i * w * 0.4, 2.05, 0.16], stripe).rotation.x = -0.25;
  }
  kit.box('good1', [0.4, 0.4, 0.4], [-w * 0.3, 1.0, 0], kit.solid('crate', '#8a6a44'));
  kit.sphere('good2', 0.4, [w * 0.3, 1.0, 0], kit.solid('fruit', '#d24a3a'), undefined, 6);
}

export function buildBarrel(kit: Kit): void {
  const wood = kit.textured('barrelWood', 'wood', { uv: 2, color: '#7a5230' });
  const hoop = kit.solid('hoop', PALETTE.iron);
  kit.cyl('barrel', { top: 0.7, bottom: 0.7, height: 1.0, tess: 10 }, [0, 0.5, 0], wood);
  kit.cyl('hoopA', { top: 0.74, bottom: 0.74, height: 0.1, tess: 10 }, [0, 0.22, 0], hoop);
  kit.cyl('hoopB', { top: 0.74, bottom: 0.74, height: 0.1, tess: 10 }, [0, 0.78, 0], hoop);
}

export function buildCrate(kit: Kit, size = 0.9): void {
  const wood = kit.textured('crateWood', 'wood', { uv: 2, color: '#8a6a44' });
  kit.box('crate', [size, size, size], [0, size / 2, 0], wood);
  kit.box('crateLine', [size * 1.02, size * 0.1, size * 1.02], [0, size / 2, 0], kit.solid('crateEdge', '#5a3a22'));
}

export function buildLamp(kit: Kit): void {
  const post = kit.solid('lampPost', '#3a4250');
  const glass = kit.solid('lampGlass', PALETTE.lantern, { emissive: 0.9 });
  kit.cyl('lampPost', { top: 0.12, bottom: 0.18, height: 2.6, tess: 6 }, [0, 1.3, 0], post);
  kit.box('lampArm', [0.5, 0.1, 0.1], [0.25, 2.55, 0], post);
  kit.box('lampHead', [0.32, 0.4, 0.32], [0.45, 2.4, 0], glass);
  kit.cyl('lampCap', { top: 0.04, bottom: 0.3, height: 0.2, tess: 4 }, [0.45, 2.68, 0], post);
}

export function buildWell(kit: Kit): void {
  const stone = kit.textured('wellStone', 'cobble', { uv: 2 });
  const wood = kit.textured('wellWood', 'wood', { uv: 2, color: '#6b4326' });
  kit.cyl('wellBase', { top: 1.3, bottom: 1.4, height: 0.9, tess: 10 }, [0, 0.45, 0], stone);
  kit.cyl('wellHole', { top: 0.9, bottom: 0.9, height: 0.95, tess: 10 }, [0, 0.46, 0], kit.solid('wellWater', PALETTE.waterDeep));
  for (const sx of [-1, 1]) kit.box(`wellPost${sx}`, [0.14, 1.2, 0.14], [sx * 0.55, 1.5, 0], wood);
  kit.box('wellBeam', [1.3, 0.16, 0.16], [0, 2.05, 0], wood);
  kit.cyl('wellRoof', { top: 0, bottom: 1.7, height: 0.6, tess: 4 }, [0, 2.3, 0], kit.textured('wellRoofM', 'thatch', { uv: 2 })).rotation.y = Math.PI / 4;
}

export function buildSign(kit: Kit): void {
  const wood = kit.textured('signWood', 'wood', { uv: 2, color: '#6b4326' });
  kit.box('signPost', [0.14, 2.0, 0.14], [0, 1.0, 0], wood);
  kit.box('signBoard', [1.2, 0.6, 0.1], [0, 1.9, 0], wood);
  kit.box('signPlank', [1.0, 0.12, 0.04], [0, 1.9, 0.08], kit.solid('signInk', '#3a2a1a'));
}

export function buildCart(kit: Kit): void {
  const wood = kit.textured('cartWood', 'wood', { uv: 2, color: '#6b4326' });
  const wheel = kit.solid('wheel', '#4a3520');
  kit.box('cartBed', [1.4, 0.3, 2.2], [0, 0.9, 0], wood);
  kit.box('cartSideL', [0.12, 0.5, 2.2], [0.7, 1.15, 0], wood);
  kit.box('cartSideR', [0.12, 0.5, 2.2], [-0.7, 1.15, 0], wood);
  for (const [sx, sz] of [[0.8, 0.7], [-0.8, 0.7], [0.8, -0.7], [-0.8, -0.7]] as [number, number][]) {
    const w = kit.cyl(`wheel${sx}_${sz}`, { top: 1.0, bottom: 1.0, height: 0.16, tess: 10 }, [sx, 0.5, sz], wheel);
    w.rotation.z = Math.PI / 2;
  }
}

export function buildFence(kit: Kit, length: number): void {
  const wood = kit.textured('fenceWood', 'wood', { uv: 2, color: '#7a5230' });
  const posts = Math.max(2, Math.round(length / 1.6));
  for (let i = 0; i <= posts; i++) {
    const x = -length / 2 + (i / posts) * length;
    kit.box(`fp${i}`, [0.14, 1.1, 0.14], [x, 0.55, 0], wood);
  }
  kit.box('rail1', [length, 0.12, 0.1], [0, 0.5, 0], wood);
  kit.box('rail2', [length, 0.12, 0.1], [0, 0.85, 0], wood);
}

export function buildPillar(kit: Kit, w: number, h: number, broken: boolean): void {
  const stone = kit.textured('pillarStone', 'ruin', { uv: 2 });
  const hh = broken ? h * 0.65 : h;
  const base = kit.cyl('pillarBase', { top: w * 0.9, bottom: w * 1.05, height: 0.5, tess: 8 }, [0, 0.25, 0], stone);
  void base;
  kit.cyl('pillarShaft', { top: w * 0.7, bottom: w * 0.85, height: hh, tess: 8 }, [0, 0.5 + hh / 2, 0], stone);
  if (!broken) kit.box('pillarCap', [w * 1.2, 0.4, w * 1.2], [0, 0.5 + hh + 0.2, 0], stone);
  else kit.poly('pillarRubble', 1, w * 0.3, [w * 0.4, 0.2, 0.2], stone);
}

export function buildTent(kit: Kit, color: string): void {
  const cloth = kit.solid('tentCloth', color);
  const pole = kit.textured('tentPole', 'wood', { uv: 2, color: '#6b4326' });
  kit.cyl('tentPole', { top: 0.14, bottom: 0.18, height: 2.2, tess: 6 }, [0, 1.1, 0], pole);
  const cone = kit.cyl('tentCone', { top: 0, bottom: 2.6, height: 2.0, tess: 6 }, [0, 1.0, 0], cloth);
  void cone;
  kit.box('tentEntry', [0.9, 1.0, 0.1], [0, 0.5, 1.2], kit.solid('tentDark', '#1a1a22'));
}

export function buildBridge(kit: Kit, length: number, width: number): void {
  const wood = kit.textured('bridgeWood', 'wood', { uv: 3, color: '#6b4326' });
  const plankCount = Math.round(length / 0.6);
  for (let i = 0; i < plankCount; i++) {
    kit.box(`plank${i}`, [width, 0.12, 0.46], [0, 0.1, -length / 2 + i * 0.6], wood);
  }
  for (const sx of [-1, 1]) {
    kit.box(`bridgeRail${sx}`, [0.12, 0.12, length], [sx * width / 2, 0.7, 0], wood);
    for (let i = 0; i <= 4; i++) {
      kit.box(`bridgePost${sx}_${i}`, [0.14, 0.8, 0.14], [sx * width / 2, 0.4, -length / 2 + (i / 4) * length], wood);
    }
  }
}

/* ------------------------------------------------------------------ small utils */

export function kitFor(scene: Scene, tex: TextureLibrary, name: string): Kit {
  return new Kit(scene, tex, name);
}

export const MODEL_KIT = { makeHumanoid, makePlayer, makeEnemy, buildTreeModel, buildRockModel, buildBuilding };

