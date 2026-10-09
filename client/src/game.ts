import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  InstancedMesh,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from 'babylonjs';
import { ZONES, type Obstacle, type ZoneDef } from '@shared/content/zones.js';
import { ENEMIES } from '@shared/content/enemies.js';
import { NPCS } from '@shared/content/npcs.js';
import { RESOURCE_NODES } from '@shared/content/recipes.js';
import type { ClientMessage, EnemySnapshot, PlayerSnapshot, ServerMessage, SnapshotEntity } from '@shared/protocol.js';
import type { ArchetypeId, EnemyDef } from '@shared/types.js';
import { TextureLibrary } from './textures.js';
import { terrainHeight, terrainSlope } from './terrain.js';
import { QUALITY_PRESETS, SKY, type Quality } from './visual.js';
import { Kit, makeEnemy, makeNpc, makePlayer, type BuiltModel } from './models.js';

type EnemyArchetype = EnemyDef['archetype'];

interface Limbs {
  body?: TransformNode;
  armR?: TransformNode;
  armL?: TransformNode;
  legR?: TransformNode;
  legL?: TransformNode;
  tail?: TransformNode;
  wingL?: TransformNode;
  wingR?: TransformNode;
  cape?: TransformNode;
  bodyBaseY?: number;
  floating?: boolean;
}

interface EntityView {
  root: TransformNode;
  meshes: AbstractMesh[];
  mats: StandardMaterial[];
  limbs: Limbs;
  primary?: StandardMaterial;
  kind: string;
  tx: number;
  tz: number;
  th: number;
  baseColor: Color3;
  moving: boolean;
  anim: string;
  phase: number;
  floating: boolean;
  defId?: string;
  label?: string;
}

export interface GameCallbacks {
  send: (msg: ClientMessage) => void;
  floater: (x: number, y: number, text: string, cls: string) => void;
  onTarget: (id: number | null, name: string, hp: number, max: number) => void;
  onInteractPrompt: (text: string | null) => void;
  onZone: (zoneId: string) => void;
  onAbilitySlot?: (slot: number) => void;
}

type QualityConfig = (typeof QUALITY_PRESETS)[Quality];

export class GameView {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: ArcRotateCamera;
  private sun: DirectionalLight;
  private hemi: HemisphericLight;
  private canvas: HTMLCanvasElement;
  private texlib: TextureLibrary;

  private entities = new Map<number, EntityView>();
  private staticMeshes: AbstractMesh[] = [];
  private staticMaterials: Material[] = [];
  private cloudMeshes: { mesh: Mesh; speed: number; range: number }[] = [];
  private fireflies: { mesh: InstancedMesh; base: Vector3; phase: number }[] = [];
  private waterMeshes: Mesh[] = [];
  private sky: Mesh | null = null;

  localPlayerId = -1;
  private localPos = { x: 0, z: 0 };
  private selfRoot: TransformNode | null = null;
  private selfLimbs: Limbs = {};
  private zone: ZoneDef;
  private pickGround: Mesh | null = null;
  private keys = new Set<string>();
  private selectedTarget: number | null = null;
  private inputSeq = 1;
  private moveSendTimer = 0;
  private cameraShake = 0;
  private shakeEnabled = true;
  private invertY = false;
  private lastPointerDown = { x: 0, y: 0, t: 0, button: 0 };
  private nearestInteract: { id: number; kind: 'npc' | 'node' | 'ground' | 'portal'; label: string } | null = null;
  private quality: Quality = 'medium';
  private pixelSize = 3;
  private drawDistance = 70;
  private elapsed = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 60;
  private lowFpsStreak = 0;
  private autoDegraded = false;
  private rngState = 1234567;

  constructor(canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, false, { stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }, false);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.18, 0.42, 0.75, 1);
    this.scene.collisionsEnabled = false;
    this.texlib = new TextureLibrary(this.scene);

    this.hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), this.scene);
    this.sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.3), this.scene);

    this.camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.02, 16, new Vector3(0, 1, 0), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 6;
    this.camera.upperRadiusLimit = 34;
    this.camera.lowerBetaLimit = 0.35;
    this.camera.upperBetaLimit = 1.34;
    this.camera.wheelPrecision = 14;
    this.camera.panningSensibility = 0;
    this.camera.inertia = 0.55;
    this.camera.minZ = 0.15;
    this.camera.maxZ = QUALITY_PRESETS.medium.maxZ;
    this.camera.fov = 0.9;

    this.zone = ZONES.elaris;
    this.applyQuality('medium', false);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);

    this.engine.runRenderLoop(() => {
      const dt = this.engine.getDeltaTime() / 1000;
      this.update(dt);
      this.scene.render();
      this.trackFps(dt);
    });
  }

  // ================================================================== zone

  setZone(zoneId: string, x: number, z: number) {
    const zone = ZONES[zoneId] ?? ZONES.elaris;
    if (zone.id !== this.zone.id || this.staticMeshes.length === 0) this.buildZone(zone);
    this.localPos = { x, z };
    const y = terrainHeight(zone.id, x, z);
    this.camera.setTarget(new Vector3(x, y + 1.2, z));
    this.cb.onZone(zone.id);
  }

  private buildZone(zone: ZoneDef) {
    this.zone = zone;
    for (const m of this.staticMeshes) m.dispose();
    this.staticMeshes = [];
    for (const m of this.staticMaterials) m.dispose();
    this.staticMaterials = [];
    for (const [, v] of this.entities) this.disposeView(v);
    this.entities.clear();
    this.cloudMeshes = [];
    this.fireflies = [];
    this.waterMeshes = [];
    if (this.selfRoot) { this.selfRoot.dispose(); this.selfRoot = null; this.selfLimbs = {}; }

    const cfg = QUALITY_PRESETS[this.quality];
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = Color3.FromHexString(zone.fogColor);
    this.scene.fogDensity = zone.fogDensity * cfg.fogMul;
    this.scene.clearColor = Color4.FromHexString(`${zone.fogColor}ff`);
    this.hemi.intensity = zone.ambient + 0.15;
    this.hemi.diffuse = Color3.FromHexString(zone.ambientColor);
    this.hemi.groundColor = Color3.FromHexString(zone.groundColor).scale(0.6);
    this.sun.intensity = zone.sunIntensity;
    this.sun.diffuse = Color3.FromHexString(zone.sunColor);
    this.sun.direction = new Vector3(zone.sunDir.x, zone.sunDir.y, zone.sunDir.z);

    this.buildSky(zone);
    this.buildClouds(zone, cfg.clouds);
    this.buildMountains(zone);
    this.buildFloatingIslands(zone);
    this.buildTerrain(zone);
    this.buildProps(zone);
    this.buildObstacles(zone, cfg.treeScale);
    this.buildFoliage(zone, cfg.foliage);
    this.buildFireflies(zone);
  }

  private rng(): number {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  private registerMat(m: StandardMaterial): StandardMaterial {
    this.staticMaterials.push(m);
    return m;
  }

  private pixelMat(texName: string, opts: { tint?: string; unlit?: boolean; alphaTest?: boolean; alpha?: number; uv?: number; emissive?: number } = {}): StandardMaterial {
    const m = new StandardMaterial(`pm_${texName}_${this.staticMaterials.length}`, this.scene);
    const tex = this.texlib.get(texName);
    m.diffuseTexture = tex;
    m.diffuseColor = opts.tint ? Color3.FromHexString(opts.tint) : new Color3(1, 1, 1);
    m.specularColor = new Color3(0.02, 0.02, 0.02);
    if (opts.unlit) m.disableLighting = true;
    if (opts.emissive !== undefined) m.emissiveColor = new Color3(opts.emissive, opts.emissive, opts.emissive);
    if (opts.uv) { tex.uScale = opts.uv; tex.vScale = opts.uv; }
    if (opts.alphaTest) {
      tex.hasAlpha = true;
      m.useAlphaFromDiffuseTexture = true;
      m.transparencyMode = Material.MATERIAL_ALPHATEST;
      m.alphaCutOff = 0.4;
      m.backFaceCulling = false;
    }
    if (opts.alpha !== undefined) {
      m.alpha = opts.alpha;
      m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
    }
    return this.registerMat(m);
  }

  // ------------------------------------------------------------------ sky

  private buildSky(zone: ZoneDef) {
    const sky = MeshBuilder.CreateSphere('sky', { diameter: SKY.followRadius, segments: 16, sideOrientation: Mesh.BACKSIDE }, this.scene);
    sky.infiniteDistance = true;
    sky.isPickable = false;
    const mat = new StandardMaterial('skymat', this.scene);
    mat.diffuseTexture = this.texlib.get('sky');
    mat.emissiveTexture = this.texlib.get('sky');
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.fogEnabled = false;
    this.registerMat(mat);
    sky.material = mat;
    this.sky = sky;
    this.staticMeshes.push(sky);
  }

  private buildClouds(zone: ZoneDef, count: number) {
    const tex = this.texlib.get('cloud');
    const mat = this.registerMat(new StandardMaterial('cloudmat', this.scene));
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.fogEnabled = false;
    mat.alpha = 0.92;
    const span = zone.size * 2 + 400;
    for (let i = 0; i < count; i++) {
      const plane = MeshBuilder.CreatePlane(`cloud_${i}`, { size: 40 + this.rng() * 60 }, this.scene);
      plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
      plane.isPickable = false;
      plane.material = mat;
      plane.position.set((this.rng() - 0.5) * span, 70 + this.rng() * 120, (this.rng() - 0.5) * span);
      this.staticMeshes.push(plane);
      this.cloudMeshes.push({ mesh: plane, speed: 1.5 + this.rng() * 2.5, range: span / 2 });
    }
  }

  private buildMountains(zone: ZoneDef) {
    const mat = this.registerMat(new StandardMaterial('mountainmat', this.scene));
    const c = Color3.FromHexString(zone.fogColor);
    mat.diffuseColor = c.scale(0.75);
    mat.emissiveColor = c.scale(0.25);
    mat.specularColor = new Color3(0, 0, 0);
    const base = zone.size * 0.62 + 40;
    const count = 26;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng() * 0.12;
      const r = base + this.rng() * 70;
      const h = 60 + this.rng() * 120;
      const w = 60 + this.rng() * 90;
      const peak = MeshBuilder.CreateCylinder(`mtn_${i}`, { diameterTop: 0, diameterBottom: w, height: h, tessellation: 5 }, this.scene);
      peak.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r);
      peak.rotation.y = a;
      peak.material = mat;
      peak.isPickable = false;
      this.staticMeshes.push(peak);
    }
  }

  private buildFloatingIslands(zone: ZoneDef) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const group = new TransformNode(`island_${i}`, this.scene);
      const rx = (this.rng() - 0.5) * (zone.size + 260);
      const rz = (this.rng() - 0.5) * (zone.size + 260);
      const ry = 55 + this.rng() * 70;
      group.position.set(rx, ry, rz);
      const w = 22 + this.rng() * 26;

      const rockMat = this.registerMat(new StandardMaterial(`islerock_${i}`, this.scene));
      rockMat.diffuseColor = Color3.FromHexString('#6f6a63');
      rockMat.specularColor = new Color3(0, 0, 0);
      const base = MeshBuilder.CreateCylinder(`islebase_${i}`, { diameterTop: w, diameterBottom: 2, height: 22 + this.rng() * 18, tessellation: 6 }, this.scene);
      base.parent = group;
      base.position.y = -8;
      base.material = rockMat;
      base.isPickable = false;
      this.staticMeshes.push(base);

      const grassMat = this.pixelMat('grass', { tint: '#ffffff', uv: 4 });
      const top = MeshBuilder.CreateCylinder(`isletop_${i}`, { diameterTop: w * 1.02, diameterBottom: w * 1.02, height: 3, tessellation: 6 }, this.scene);
      top.parent = group;
      top.position.y = 4;
      top.material = grassMat;
      top.isPickable = false;
      this.staticMeshes.push(top);

      group.parent = null;
      this.staticMeshes.push(group as unknown as AbstractMesh);
    }
  }

  // ------------------------------------------------------------------ terrain

  private buildTerrain(zone: ZoneDef) {
    const size = zone.size + 90;
    const sub = Math.max(40, Math.min(130, Math.round(size / 4.5)));
    const ground = MeshBuilder.CreateGround('terrain', { width: size, height: size, subdivisions: sub }, this.scene);
    const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
    const count = positions.length / 3;
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      const h = terrainHeight(zone.id, x, z) + (zone.id === 'elaris' ? 0 : 0);
      positions[i * 3 + 1] = h;
      const shade = 0.82 + Math.min(1, Math.max(0, (h + 3) / 8)) * 0.18;
      colors[i * 4] = shade;
      colors[i * 4 + 1] = shade;
      colors[i * 4 + 2] = shade;
      colors[i * 4 + 3] = 1;
    }
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);
    const indices = ground.getIndices()!;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    ground.setVerticesData(VertexBuffer.NormalKind, normals);
    ground.setVerticesData(VertexBuffer.ColorKind, colors);

    const grassTex = zone.id === 'hollow' ? 'moss' : zone.id === 'greenreach' ? 'grass_dark' : 'grass';
    const mat = this.pixelMat(grassTex, { uv: Math.round(size / 5) });
    mat.specularColor = new Color3(0.0, 0.0, 0.0);
    ground.material = mat;
    ground.isPickable = false;
    this.staticMeshes.push(ground);

    const pick = MeshBuilder.CreateGround('pickplane', { width: size, height: size, subdivisions: 1 }, this.scene);
    pick.isVisible = false;
    pick.isPickable = true;
    pick.material = this.registerMat((() => {
      const m = new StandardMaterial('pickmat', this.scene);
      m.alpha = 0;
      return m;
    })());
    this.pickGround = pick;
    this.staticMeshes.push(pick);
  }

  private buildProps(zone: ZoneDef) {
    for (const p of zone.props) {
      const tex = p.kind === 'stone' ? 'ruin' : p.kind === 'road' ? 'dirt' : p.kind === 'lava' ? 'magic' : 'grass';
      const mat = this.pixelMat(tex, { uv: Math.max(2, Math.round(p.w / 4)) });
      const plane = MeshBuilder.CreateGround(`prop_${p.x}_${p.z}`, { width: p.w, height: p.d, subdivisions: 1 }, this.scene);
      plane.position.set(p.x, terrainHeight(zone.id, p.x, p.z) + 0.04, p.z);
      plane.material = mat;
      plane.isPickable = false;
      this.staticMeshes.push(plane);
    }
  }

  // ------------------------------------------------------------------ obstacles

  private buildObstacles(zone: ZoneDef, treeScale: number) {
    const obstacles = zone.obstacles;
    const trunkMat = this.pixelMat('wood', { uv: 2 });
    const leafA: Mesh[] = [];
    const leafB: Mesh[] = [];
    const rockMat = this.registerMat(new StandardMaterial('rockmat', this.scene));
    rockMat.diffuseColor = Color3.FromHexString('#6d7480');
    rockMat.specularColor = new Color3(0, 0, 0);
    const rockMatB = this.registerMat(new StandardMaterial('rockmatb', this.scene));
    rockMatB.diffuseColor = Color3.FromHexString('#5c6bc0');
    rockMatB.specularColor = new Color3(0, 0, 0);

    let built = 0;
    let treeBudget = Math.ceil(obstacles.length * treeScale);
    for (const o of obstacles) {
      const y = terrainHeight(zone.id, o.x, o.z);
      switch (o.kind) {
        case 'tree': {
          if (built >= treeBudget) break;
          built++;
          const leafIdx = o.color === '#2e5d23' ? 1 : 0;
          const trunk = MeshBuilder.CreateCylinder(`trunk_${o.x}_${o.z}`, { height: o.h * 0.55, diameterTop: 0.5, diameterBottom: 0.85, tessellation: 6 }, this.scene);
          trunk.position.set(o.x, y + o.h * 0.27, o.z);
          trunk.material = trunkMat;
          trunk.isPickable = false;
          this.staticMeshes.push(trunk);
          const canopy = this.makeCanopy(`leaf_${o.x}_${o.z}`, o.x, y + o.h * 0.6, o.z, 2.4 + (o.h % 2) * 0.4);
          if (leafIdx === 1) leafB.push(canopy); else leafA.push(canopy);
          break;
        }
        case 'rock': {
          const mesh = MeshBuilder.CreatePolyhedron(`rock_${o.x}_${o.z}`, { type: 1, size: o.w * 0.55 }, this.scene);
          mesh.position.set(o.x, y + o.h * 0.3, o.z);
          mesh.scaling.y = 0.8;
          mesh.rotation.set(this.rng() * 0.6, this.rng() * Math.PI, this.rng() * 0.6);
          mesh.material = o.color === '#5c6bc0' ? rockMatB : rockMat;
          mesh.isPickable = false;
          this.staticMeshes.push(mesh);
          break;
        }
        case 'building': {
          this.buildBuilding(o, y);
          break;
        }
        case 'wall': {
          const wall = MeshBuilder.CreateBox(`wall_${o.x}_${o.z}`, { width: o.w, height: o.h, depth: o.d }, this.scene);
          wall.position.set(o.x, y + o.h / 2, o.z);
          wall.material = this.pixelMat('ruin', { uv: Math.max(2, Math.round(o.w / 5)) });
          wall.isPickable = false;
          this.staticMeshes.push(wall);
          break;
        }
        case 'pillar': {
          const broken = this.rng() > 0.5;
          const h = broken ? o.h * 0.7 : o.h;
          const pillar = MeshBuilder.CreateCylinder(`pillar_${o.x}_${o.z}`, { height: h, diameter: o.w * 0.6, tessellation: 8 }, this.scene);
          pillar.position.set(o.x, y + h / 2, o.z);
          if (broken) pillar.rotation.z = (this.rng() - 0.5) * 0.25;
          pillar.material = this.pixelMat('ruin', { uv: 2 });
          pillar.isPickable = false;
          this.staticMeshes.push(pillar);
          break;
        }
        case 'ruin': {
          this.buildRuinArea(o, y);
          break;
        }
        case 'fence': {
          const fence = MeshBuilder.CreateBox(`fence_${o.x}_${o.z}`, { width: o.w, height: o.h, depth: 0.3 }, this.scene);
          fence.position.set(o.x, y + o.h / 2, o.z);
          fence.material = this.pixelMat('wood', { uv: 2 });
          fence.isPickable = false;
          this.staticMeshes.push(fence);
          break;
        }
        case 'water': {
          this.buildWater(zone, o, y);
          break;
        }
        case 'pit': {
          const pit = MeshBuilder.CreateGround(`pit_${o.x}_${o.z}`, { width: o.w, height: o.d }, this.scene);
          pit.position.set(o.x, y - 0.2, o.z);
          pit.material = this.registerMat((() => {
            const m = new StandardMaterial('pitmat', this.scene);
            m.diffuseColor = Color3.FromHexString('#241f1a');
            m.specularColor = new Color3(0, 0, 0);
            return m;
          })());
          pit.isPickable = false;
          this.staticMeshes.push(pit);
          break;
        }
      }
    }

    // instanced canopies (shared geometry per variant -> one draw call)
    this.instanceCanopies(leafA, 'leaves');
    this.instanceCanopies(leafB, 'leaves_dark');
  }

  private makeCanopy(name: string, x: number, y: number, z: number, radius: number): Mesh {
    const mesh = MeshBuilder.CreatePolyhedron(name, { type: 3, size: radius }, this.scene);
    mesh.position.set(x, y, z);
    mesh.scaling.y = 1.1;
    mesh.isPickable = false;
    return mesh;
  }

  private instanceCanopies(meshes: Mesh[], tex: string) {
    if (!meshes.length) return;
    const source = meshes[0];
    const mat = this.pixelMat(tex, { uv: 2 });
    source.material = mat;
    source.isVisible = false;
    this.staticMeshes.push(source);
    for (let i = 1; i < meshes.length; i++) {
      const m = meshes[i];
      const inst = source.createInstance(`leafi_${i}`) as InstancedMesh;
      inst.position.copyFrom(m.position);
      inst.scaling.copyFrom(m.scaling);
      inst.rotation.copyFrom(m.rotation);
      inst.isPickable = false;
      this.staticMeshes.push(inst);
      m.dispose();
    }
  }

  private buildBuilding(o: Obstacle, y: number) {
    const wallMat = this.pixelMat('wood', { uv: Math.max(2, Math.round(o.w / 4)) });
    const body = MeshBuilder.CreateBox(`bldg_${o.x}_${o.z}`, { width: o.w, height: o.h, depth: o.d }, this.scene);
    body.position.set(o.x, y + o.h / 2, o.z);
    body.material = wallMat;
    body.isPickable = false;
    this.staticMeshes.push(body);

    const roofMat = this.registerMat((() => {
      const m = new StandardMaterial('roofmat', this.scene);
      m.diffuseColor = Color3.FromHexString('#8d4b3a');
      m.specularColor = new Color3(0, 0, 0);
      return m;
    })());
    const roof = MeshBuilder.CreateCylinder(`roof_${o.x}_${o.z}`, { height: Math.max(o.w, o.d) * 0.55, diameterTop: 0, diameterBottom: Math.max(o.w, o.d) * 1.35, tessellation: 4 }, this.scene);
    roof.position.set(o.x, y + o.h + Math.max(o.w, o.d) * 0.27, o.z);
    roof.rotation.y = Math.PI / 4;
    roof.material = roofMat;
    roof.isPickable = false;
    this.staticMeshes.push(roof);
  }

  private buildRuinArea(o: Obstacle, y: number) {
    const count = 4 + Math.floor(this.rng() * 4);
    for (let i = 0; i < count; i++) {
      const px = o.x + (this.rng() - 0.5) * o.w;
      const pz = o.z + (this.rng() - 0.5) * o.d;
      const h = 2 + this.rng() * o.h;
      const pillar = MeshBuilder.CreateCylinder(`rl_${o.x}_${o.z}_${i}`, { height: h, diameter: 1 + this.rng() * 1.2, tessellation: 6 }, this.scene);
      const py = terrainHeight(this.zone.id, px, pz);
      pillar.position.set(px, py + h / 2, pz);
      if (this.rng() > 0.6) pillar.rotation.z = (this.rng() - 0.5) * 0.5;
      pillar.material = this.pixelMat('ruin', { uv: 2 });
      pillar.isPickable = false;
      this.staticMeshes.push(pillar);
    }
    const slab = MeshBuilder.CreateGround(`slab_${o.x}_${o.z}`, { width: o.w, height: o.d }, this.scene);
    slab.position.set(o.x, y + 0.05, o.z);
    slab.material = this.pixelMat('ruin', { uv: Math.round(o.w / 4) });
    slab.isPickable = false;
    this.staticMeshes.push(slab);
  }

  private buildWater(zone: ZoneDef, o: Obstacle, y: number) {
    const mat = this.pixelMat('water', { alpha: 0.82, uv: Math.max(2, Math.round(o.w / 8)) });
    const plane = MeshBuilder.CreateGround(`water_${o.x}_${o.z}`, { width: o.w, height: o.d, subdivisions: 1 }, this.scene);
    plane.position.set(o.x, y + 0.18, o.z);
    plane.material = mat;
    plane.isPickable = false;
    this.staticMeshes.push(plane);
    this.waterMeshes.push(plane);
  }

  // ------------------------------------------------------------------ foliage

  private buildFoliage(zone: ZoneDef, count: number) {
    const tuftSrc = this.makeCrossedPlane('tuftsrc', 1.4);
    const flowerSrc = this.makeCrossedPlane('flowersrc', 0.9);
    const mushSrc = this.makeCrossedPlane('mushsrc', 0.7);
    const tuftMat = this.alphaMat('tuft', true);
    const flowerMat = this.alphaMat('flower', false);
    const mushMat = this.alphaMat('mushroom', false);
    tuftSrc.material = tuftMat; flowerSrc.material = flowerMat; mushSrc.material = mushMat;
    tuftSrc.isVisible = flowerSrc.isVisible = mushSrc.isVisible = false;
    this.staticMeshes.push(tuftSrc, flowerSrc, mushSrc);

    const half = (zone.size + 60) / 2;
    const sources: { src: Mesh; tex: string; weight: number }[] = [
      { src: tuftSrc, tex: 'tuft', weight: 0.72 },
      { src: flowerSrc, tex: 'flower', weight: 0.18 },
      { src: mushSrc, tex: 'mushroom', weight: 0.1 },
    ];
    const buckets: number[][] = [[], [], []];
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 6) {
      guard++;
      const x = (this.rng() * 2 - 1) * half;
      const z = (this.rng() * 2 - 1) * half;
      if (this.tooCloseToObstacle(zone, x, z, 1.6)) continue;
      const roll = this.rng();
      const bi = roll < sources[0].weight ? 0 : roll < sources[0].weight + sources[1].weight ? 1 : 2;
      buckets[bi].push(x, z);
      placed++;
    }
    const yOff = [0.7, 0.45, 0.35];
    for (let b = 0; b < 3; b++) {
      const src = sources[b].src;
      const coords = buckets[b];
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i];
        const z = coords[i + 1];
        const inst = src.createInstance(`fol_${b}_${i}`) as InstancedMesh;
        inst.position.set(x, terrainHeight(zone.id, x, z) + yOff[b] * 0.5, z);
        inst.rotation.y = this.rng() * Math.PI;
        const s = 0.7 + this.rng() * 0.8;
        inst.scaling.set(s, s, s);
        inst.isPickable = false;
        this.staticMeshes.push(inst);
      }
    }
  }

  private makeCrossedPlane(name: string, size: number): Mesh {
    const p1 = MeshBuilder.CreatePlane(`${name}_a`, { size }, this.scene);
    const p2 = MeshBuilder.CreatePlane(`${name}_b`, { size }, this.scene);
    p2.rotation.y = Math.PI / 2;
    const merged = Mesh.MergeMeshes([p1, p2], true, true, undefined, false, false)!;
    merged.name = name;
    merged.position.y = size / 2;
    return merged;
  }

  private alphaMat(tex: string, lift: boolean): StandardMaterial {
    const m = this.registerMat(new StandardMaterial(`am_${tex}`, this.scene));
    const t = this.texlib.get(tex);
    m.diffuseTexture = t;
    m.diffuseTexture.hasAlpha = true;
    m.useAlphaFromDiffuseTexture = true;
    m.transparencyMode = Material.MATERIAL_ALPHATEST;
    m.alphaCutOff = 0.4;
    m.specularColor = new Color3(0, 0, 0);
    m.backFaceCulling = false;
    if (lift) m.emissiveColor = new Color3(0.22, 0.24, 0.18);
    return m;
  }

  private tooCloseToObstacle(zone: ZoneDef, x: number, z: number, pad: number): boolean {
    for (const o of zone.obstacles) {
      if (o.kind === 'water' || o.kind === 'pit') continue;
      const hw = o.w / 2 + pad;
      const hd = o.d / 2 + pad;
      if (Math.abs(x - o.x) < hw && Math.abs(z - o.z) < hd) return true;
    }
    return false;
  }

  private buildFireflies(zone: ZoneDef) {
    if (zone.ambientParticles !== 'fireflies' && this.quality === 'low') return;
    const src = MeshBuilder.CreatePlane('ffsrc', { size: 0.5 }, this.scene);
    const mat = this.registerMat(new StandardMaterial('ffmat', this.scene));
    const tex = this.texlib.get('glow');
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.transparencyMode = Material.MATERIAL_ALPHATEST;
    mat.alphaCutOff = 0.2;
    src.material = mat;
    src.isVisible = false;
    src.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.staticMeshes.push(src);
    const n = this.quality === 'high' ? 40 : 20;
    for (let i = 0; i < n; i++) {
      const inst = src.createInstance(`ff_${i}`) as InstancedMesh;
      const x = (this.rng() * 2 - 1) * 60;
      const z = (this.rng() * 2 - 1) * 60;
      const base = new Vector3(x, terrainHeight(zone.id, x, z) + 1 + this.rng() * 3, z);
      inst.position.copyFrom(base);
      inst.isPickable = false;
      this.staticMeshes.push(inst);
      this.fireflies.push({ mesh: inst, base, phase: this.rng() * Math.PI * 2 });
    }
  }

  // ================================================================== entities

  applySnapshot(msg: Extract<ServerMessage, { t: 'snapshot' }>) {
    const seen = new Set<number>();
    for (const e of msg.entities) {
      seen.add(e.id);
      let view = this.entities.get(e.id);
      if (!view) {
        const created = this.createEntity(e);
        if (!created) continue;
        view = created;
        this.entities.set(e.id, view);
      }
      view.tx = e.x;
      view.tz = e.z;
      view.th = e.h;
      const ps = e as PlayerSnapshot;
      view.moving = (e.kind === 'player' && Boolean(ps.moving)) || (e.kind === 'enemy' && e.state === 'chase');
      view.anim = e.state ?? e.anim ?? 'idle';
      this.tintEntity(view, e);
    }
    for (const id of msg.removed) {
      const v = this.entities.get(id);
      if (v) { this.disposeView(v); this.entities.delete(id); }
    }
    for (const [id, v] of this.entities) {
      if (!seen.has(id)) { this.disposeView(v); this.entities.delete(id); }
    }

    this.applySelf(msg.you);
    this.updateInteractionPrompt();

    if (this.selectedTarget !== null) {
      const t = this.entities.get(this.selectedTarget);
      const snap = msg.entities.find((e) => e.id === this.selectedTarget) as EnemySnapshot | undefined;
      if (!t || !snap) {
        this.selectedTarget = null;
        this.cb.onTarget(null, '', 0, 0);
      } else {
        this.cb.onTarget(this.selectedTarget, snap.name ?? 'Target', snap.health ?? 0, snap.maxHealth ?? 1);
      }
    }
  }

  private applySelf(you: import('@shared/protocol.js').SerializedPlayer) {
    this.localPlayerId = you.id;
    this.localPos = { x: you.x, z: you.z };
    if (you.dead) {
      if (this.selfRoot) this.selfRoot.setEnabled(false);
      return;
    }
    if (!this.selfRoot) {
      const kit = new Kit(this.scene, this.texlib, 'self');
      makePlayer(kit, {
        skin: you.appearance.skinTone ?? '#e0ac69',
        hair: you.appearance.hairColor,
        bodyColor: you.appearance.bodyColor,
        archetype: you.archetype,
      });
      const built = this.finishModel(kit, 0.9);
      this.selfRoot = built.root;
      this.selfLimbs = built.limbs;
    }
    this.selfRoot.setEnabled(true);
    const y = terrainHeight(this.zone.id, you.x, you.z);
    this.selfRoot.position.set(you.x, y, you.z);
    this.selfRoot.rotation.y = you.heading;
    this.animateLimbs(this.selfLimbs, true, 'idle', performance.now() / 1000);
  }

  private createEntity(e: SnapshotEntity): EntityView | null {
    switch (e.kind) {
      case 'player': return this.buildPlayer(e as PlayerSnapshot);
      case 'enemy': return this.buildEnemy(e as EnemySnapshot);
      case 'npc': return this.buildNpc(e);
      case 'node': return this.buildNode(e);
      case 'ground': return this.buildGround(e);
      case 'portal': return null;
      default: return null;
    }
  }

  private baseView(root: TransformNode, meshes: AbstractMesh[], mats: StandardMaterial[], limbs: Limbs, kind: string, e: SnapshotEntity, color: Color3, primary?: StandardMaterial): EntityView {
    for (const m of meshes) {
      m.metadata = { entityId: e.id, kind: e.kind };
    }
    return { root, meshes, mats, limbs, primary, kind, tx: e.x, tz: e.z, th: e.h, baseColor: color, moving: false, anim: 'idle', phase: Math.random() * 10, floating: kind === 'node' || Boolean(limbs.floating), label: undefined, defId: undefined };
  }

  private finishModel(kit: Kit, shadowRadius = 0.9): BuiltModel {
    const built = kit.result();
    const shadow = this.makeBlobShadow(`${built.root.name}_shadow`, shadowRadius);
    shadow.parent = built.root;
    built.meshes.push(shadow);
    return built;
  }

  private buildPlayer(e: PlayerSnapshot): EntityView {
    const kit = new Kit(this.scene, this.texlib, `p_${e.id}`);
    makePlayer(kit, {
      skin: e.colors?.skinTone ?? '#e0ac69',
      hair: e.colors?.hairColor ?? '#3e2723',
      bodyColor: e.colors?.bodyColor ?? '#90a4ae',
      archetype: e.archetype,
    });
    const built = this.finishModel(kit, 0.9);
    return this.baseView(built.root, built.meshes, built.mats, built.limbs, 'player', e, Color3.FromHexString(e.colors?.bodyColor ?? '#90a4ae'), built.primary);
  }

  private buildEnemy(e: EnemySnapshot): EntityView {
    const def = ENEMIES[e.defId];
    const color = Color3.FromHexString(def?.color ?? '#8d6e63');
    const scale = def?.scale ?? 1;
    const arche: EnemyArchetype = (def?.archetype ?? 'brute') as EnemyArchetype;
    const kit = new Kit(this.scene, this.texlib, `e_${e.id}`);
    makeEnemy(kit, e.defId, arche, def?.color ?? '#8d6e63', scale);
    const built = this.finishModel(kit, 0.9 * scale);
    const view = this.baseView(built.root, built.meshes, built.mats, built.limbs, 'enemy', e, color, built.primary);
    view.defId = e.defId;
    view.label = e.name;
    if (def?.boss) { view.root.scaling.setAll(1.25); }
    else if (def?.elite) { view.root.scaling.setAll(1.1); }
    return view;
  }

  private buildNpc(e: SnapshotEntity): EntityView {
    const npc = NPCS[Object.keys(NPCS).find((id) => Math.abs(NPCS[id].x - e.x) < 2 && Math.abs(NPCS[id].z - e.z) < 2) ?? ''] ;
    const color = npc?.color ?? '#ffd54f';
    const kit = new Kit(this.scene, this.texlib, `npc_${e.id}`);
    makeNpc(kit, npc?.role ?? 'flavor', color);
    const built = this.finishModel(kit, 0.9);
    const view = this.baseView(built.root, built.meshes, built.mats, built.limbs, 'npc', e, Color3.FromHexString(color), built.primary);
    const marker = MeshBuilder.CreatePolyhedron(`npcm_${e.id}`, { type: 1, size: 0.22 }, this.scene);
    marker.position.y = 2.35;
    marker.parent = built.root;
    const mm = this.entityMat(`npcm_${e.id}`, '#ffd54f');
    mm.emissiveColor = new Color3(0.6, 0.5, 0.05);
    marker.material = mm;
    view.meshes.push(marker);
    view.mats.push(mm);
    return view;
  }

  private buildNode(e: SnapshotEntity): EntityView {
    const ndef = e.state ? RESOURCE_NODES[e.state] : undefined;
    const color = Color3.FromHexString(ndef?.color ?? '#7e57c2');
    const root = new TransformNode(`node_${e.id}`, this.scene);
    const mesh = MeshBuilder.CreatePolyhedron(`node_${e.id}`, { type: 3, size: 0.6 }, this.scene);
    mesh.position.y = 0.7;
    const mat = this.entityMat(`node_${e.id}`, ndef?.color ?? '#7e57c2');
    mat.emissiveColor = color.scale(0.25);
    mesh.material = mat;
    mesh.parent = root;
    const view = this.baseView(root, [mesh], [mat], {}, 'node', e, color);
    view.floating = true;
    return view;
  }

  private buildGround(e: SnapshotEntity): EntityView {
    const gold = e.state === 'gold';
    const root = new TransformNode(`ground_${e.id}`, this.scene);
    const mesh = MeshBuilder.CreatePolyhedron(`ground_${e.id}`, { type: 1, size: 0.28 }, this.scene);
    mesh.position.y = 0.4;
    const mat = this.entityMat(`ground_${e.id}`, gold ? '#ffcc33' : '#e0e0e0');
    mat.emissiveColor = gold ? new Color3(0.5, 0.38, 0.08) : new Color3(0.2, 0.2, 0.2);
    mesh.material = mat;
    mesh.parent = root;
    return this.baseView(root, [mesh], [mat], {}, 'ground', e, gold ? new Color3(1, 0.8, 0.2) : new Color3(0.9, 0.9, 0.9));
  }

  private makeBlobShadow(name: string, radius: number): Mesh {
    const disc = MeshBuilder.CreateDisc(name, { radius, tessellation: 12 }, this.scene);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 0.05;
    const mat = this.registerMat(new StandardMaterial(`${name}_m`, this.scene));
    const tex = this.texlib.get('shadow');
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.emissiveTexture = tex;
    mat.disableLighting = true;
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    disc.material = mat;
    disc.isPickable = false;
    return disc;
  }

  private entityMat(name: string, colorHex: string, alpha = 1): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.FromHexString(colorHex);
    m.specularColor = new Color3(0.02, 0.02, 0.02);
    if (alpha < 1) { m.alpha = alpha; m.transparencyMode = Material.MATERIAL_ALPHABLEND; }
    return m;
  }

  private disposeView(v: EntityView) {
    v.root.dispose(false, true);
    for (const m of v.meshes) if (!m.isDisposed()) m.dispose();
    for (const m of v.mats) m.dispose();
  }

  private tintEntity(view: EntityView, e: SnapshotEntity) {
    if (e.kind === 'enemy') {
      const es = e as EnemySnapshot;
      const def = ENEMIES[es.defId];
      let color = Color3.FromHexString(def?.color ?? '#8d6e63');
      if (es.hp !== undefined && es.mhp && es.mhp > 0 && es.hp / es.mhp < 0.3) color = Color3.FromHexString('#c62828');
      const emissive = e.flash ? new Color3(0.8, 0.15, 0.15) : es.boss ? new Color3(0.2, 0.05, 0.28) : new Color3(0, 0, 0);
      for (const m of view.primary ? [view.primary] : view.mats) {
        m.diffuseColor = color;
        m.emissiveColor = emissive;
      }
    } else if (e.kind === 'player') {
      const ps = e as PlayerSnapshot;
      for (const m of view.mats) m.emissiveColor = ps.pvp ? new Color3(0.3, 0.03, 0.03) : new Color3(0, 0, 0);
    }
  }

  // ================================================================== input

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    this.keys.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); this.doAttack(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.cb.send({ t: 'dodge', seq: this.inputSeq++ });
    if (e.code === 'KeyE') this.doInteract();
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5)) - 1;
      this.cb.onAbilitySlot?.(n);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();
  private onResize = () => this.engine.resize();

  private onPointerDown = (e: PointerEvent) => {
    this.lastPointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
  };

  private onPointerUp = (e: PointerEvent) => {
    const dx = e.clientX - this.lastPointerDown.x;
    const dy = e.clientY - this.lastPointerDown.y;
    const moved = Math.hypot(dx, dy);
    if (moved > 6 || performance.now() - this.lastPointerDown.t > 400) return;
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const pick = this.scene.pick(px, py, (m) => m.isPickable || m.name === 'pickplane');
    if (!pick?.hit || !pick.pickedPoint) return;
    const meta = pick.pickedMesh?.metadata as { entityId?: number; kind?: string } | undefined;
    if (meta?.kind === 'enemy' && meta.entityId !== undefined) {
      this.selectedTarget = meta.entityId;
      this.cb.send({ t: 'attack', seq: this.inputSeq++, targetId: meta.entityId });
      return;
    }
    if ((meta?.kind === 'npc' || meta?.kind === 'node' || meta?.kind === 'ground') && meta.entityId !== undefined) {
      this.cb.send({ t: 'interact', targetId: meta.entityId, kind: meta.kind as 'npc' | 'node' | 'ground' });
      return;
    }
    const pt = pick.pickedPoint;
    this.cb.send({ t: 'move_to', seq: this.inputSeq++, x: pt.x, z: pt.z });
  };

  private doAttack() {
    this.cb.send({ t: 'attack', seq: this.inputSeq++, targetId: this.selectedTarget ?? undefined });
  }

  private doInteract() {
    const nearest = this.nearestInteract;
    if (nearest) this.cb.send({ t: 'interact', targetId: nearest.id, kind: nearest.kind });
  }

  // ================================================================== per-frame

  private update(dt: number) {
    this.elapsed += dt;
    const t = this.elapsed;
    const ty = terrainHeight(this.zone.id, this.localPos.x, this.localPos.z) + 1.2;
    const target = new Vector3(this.localPos.x, ty, this.localPos.z);
    this.camera.target = Vector3.Lerp(this.camera.target, target, Math.min(1, dt * 8));
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 3);
      const s = this.shakeEnabled ? this.cameraShake : 0;
      this.camera.target.addInPlace(new Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }

    for (const [, v] of this.entities) {
      const gy = terrainHeight(this.zone.id, v.tx, v.tz);
      const targetY = v.floating ? gy + 0.7 + Math.sin(t * 2 + v.phase) * 0.12 : gy;
      v.root.position.x += (v.tx - v.root.position.x) * Math.min(1, dt * 10);
      v.root.position.z += (v.tz - v.root.position.z) * Math.min(1, dt * 10);
      v.root.position.y += (targetY - v.root.position.y) * Math.min(1, dt * 10);
      let da = v.th - v.root.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      v.root.rotation.y += da * Math.min(1, dt * 9);
      if (v.meshes.length && v.kind === 'ground') v.root.rotation.y += dt * 1.5;
      if (v.kind === 'player' || v.kind === 'enemy' || v.kind === 'npc') {
        this.animateLimbs(v.limbs, v.moving, v.anim, t + v.phase);
      }
    }

    for (const c of this.cloudMeshes) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > c.range) c.mesh.position.x = -c.range;
    }
    for (const f of this.fireflies) {
      const a = t * 1.4 + f.phase;
      f.mesh.position.set(f.base.x + Math.sin(a) * 2.2, f.base.y + Math.sin(a * 1.7) * 0.6, f.base.z + Math.cos(a * 0.8) * 2.2);
    }
    for (const w of this.waterMeshes) {
      const m = w.material as StandardMaterial;
      if (m.diffuseTexture) {
        const t = m.diffuseTexture as Texture;
        t.uOffset += dt * 0.02;
        t.vOffset += dt * 0.012;
      }
    }

    this.moveSendTimer += dt;
    if (this.moveSendTimer >= 1 / 15) {
      this.moveSendTimer = 0;
      this.sendMovement();
    }
  }

  private animateLimbs(limbs: Limbs, moving: boolean, anim: string, t: number) {
    const freq = moving ? 9 : 0;
    const swing = moving ? Math.sin(t * freq) * 0.7 : Math.sin(t * 1.6) * 0.04;
    const attacking = anim === 'attack';
    if (limbs.legR) limbs.legR.rotation.x = swing;
    if (limbs.legL) limbs.legL.rotation.x = -swing;
    if (limbs.armR) limbs.armR.rotation.x = attacking ? -1.3 : -swing * 0.8;
    if (limbs.armL) limbs.armL.rotation.x = attacking ? -0.4 : swing * 0.8;
    if (limbs.wingR) limbs.wingR.rotation.z = Math.sin(t * (moving ? 12 : 6)) * 0.5;
    if (limbs.wingL) limbs.wingL.rotation.z = -Math.sin(t * (moving ? 12 : 6)) * 0.5;
    if (limbs.tail) limbs.tail.rotation.y = Math.sin(t * 2.5) * 0.25;
    if (limbs.body) limbs.body.position.y = (limbs.bodyBaseY ?? 0.55) + Math.abs(swing) * 0.03;
  }

  private sendMovement() {
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    if (fwd === 0 && strafe === 0) {
      this.cb.send({ t: 'stop', seq: this.inputSeq++ });
      return;
    }
    const yaw = this.camera.alpha + Math.PI;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const fx = -sin * fwd + cos * strafe;
    const fz = -cos * fwd - sin * strafe;
    const len = Math.hypot(fx, fz) || 1;
    const heading = Math.atan2(fx, fz);
    this.cb.send({ t: 'move', seq: this.inputSeq++, mx: fx / len, mz: fz / len, heading });
  }

  private updateInteractionPrompt() {
    let best: { id: number; kind: 'npc' | 'node' | 'ground' | 'portal'; label: string } | null = null;
    let bestD = 6;
    for (const [id, v] of this.entities) {
      if (v.kind === 'npc' || v.kind === 'node' || v.kind === 'ground') {
        const d = Math.hypot(v.root.position.x - this.localPos.x, v.root.position.z - this.localPos.z);
        if (d < Math.min(bestD, 5.5)) {
          bestD = d;
          best = { id, kind: v.kind as 'npc' | 'node' | 'ground', label: v.kind === 'npc' ? 'Talk to NPC' : v.kind === 'node' ? 'Gather resource' : 'Pick up item' };
        }
      }
    }
    this.nearestInteract = best;
    this.cb.onInteractPrompt(best ? `[E] ${best.label}` : null);
  }

  // ================================================================== quality

  applyQuality(q: Quality, rebuild = true) {
    this.quality = q;
    const cfg = QUALITY_PRESETS[q];
    this.pixelSize = cfg.pixel;
    this.engine.setHardwareScalingLevel(this.pixelSize);
    this.camera.maxZ = cfg.maxZ;
    this.scene.fogDensity = this.zone.fogDensity * cfg.fogMul;
    if (rebuild) this.buildZone(this.zone);
  }

  setQuality(q: 'low' | 'medium' | 'high') {
    this.applyQuality(q, true);
  }

  setPixelSize(size: number) {
    this.pixelSize = Math.max(1, Math.min(6, Math.round(size)));
    this.engine.setHardwareScalingLevel(this.pixelSize);
  }

  getPixelSize(): number { return this.pixelSize; }

  setDrawDistance(d: number) {
    this.drawDistance = d;
    this.camera.maxZ = d + 200;
    this.scene.fogDensity = this.zone.fogDensity * (70 / Math.max(30, d));
  }

  setShake(enabled: boolean) { this.shakeEnabled = enabled; }
  setInvertY(inverted: boolean) { this.invertY = inverted; }
  triggerShake(amount = 0.5) { this.cameraShake = Math.min(1.5, this.cameraShake + amount); }

  private trackFps(dt: number) {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 1) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      if (this.fps < 24 && this.quality !== 'low') this.lowFpsStreak++;
      else this.lowFpsStreak = 0;
      if (this.lowFpsStreak >= 6 && !this.autoDegraded) {
        this.autoDegraded = true;
        this.applyQuality(this.quality === 'high' ? 'medium' : 'low', true);
        this.cb.floater(window.innerWidth / 2, 140, 'Lowered graphics for performance', 'miss');
      }
    }
  }

  getFps(): number { return Math.round(this.fps); }

  projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()),
    );
    const s = this.engine.getHardwareScalingLevel();
    return { x: v.x * s, y: v.y * s, visible: v.z > 0 && v.z < 1 };
  }

  get local() { return this.localPos; }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.texlib.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}

export type { ArchetypeId };
