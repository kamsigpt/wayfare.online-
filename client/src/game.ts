import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from 'babylonjs';
import { ZONES, collidersFor, type Obstacle, type ZoneDef } from '@shared/content/zones.js';
import { ENEMIES } from '@shared/content/enemies.js';
import { NPCS } from '@shared/content/npcs.js';
import { RESOURCE_NODES } from '@shared/content/recipes.js';
import type { ClientMessage, EnemySnapshot, PlayerSnapshot, ServerMessage, SnapshotEntity } from '@shared/protocol.js';
import type { ArchetypeId } from '@shared/types.js';

interface EntityView {
  mesh: Mesh;
  kind: string;
  tx: number;
  tz: number;
  th: number;
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

export class GameView {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: ArcRotateCamera;
  private sun: DirectionalLight;
  private hemi: HemisphericLight;
  private entities = new Map<number, EntityView>();
  private staticMeshes: Mesh[] = [];
  localPlayerId = -1;
  private localPos = { x: 0, z: 0 };
  private selfMesh: Mesh | null = null;
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

  constructor(canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    this.engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.07, 0.1, 1);
    this.scene.collisionsEnabled = false;

    this.hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    this.hemi.intensity = 0.7;
    this.sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.3), this.scene);
    this.sun.intensity = 0.8;

    this.camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.05, 14, new Vector3(0, 1, 0), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 5;
    this.camera.upperRadiusLimit = 30;
    this.camera.lowerBetaLimit = 0.25;
    this.camera.upperBetaLimit = 1.5;
    this.camera.wheelPrecision = 12;
    this.camera.panningSensibility = 0;
    this.camera.inertia = 0.6;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 400;

    this.zone = ZONES.elaris;
    this.buildZone(this.zone);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.onBlur);

    this.engine.runRenderLoop(() => {
      this.update(this.engine.getDeltaTime() / 1000);
      this.scene.render();
    });
  }

  // ------------------------------------------------------------------ zone

  setZone(zoneId: string, x: number, z: number) {
    const zone = ZONES[zoneId] ?? ZONES.elaris;
    if (zone.id !== this.zone.id) this.buildZone(zone);
    this.localPos = { x, z };
    this.camera.setTarget(new Vector3(x, 1, z));
    this.cb.onZone(zone.id);
  }

  private buildZone(zone: ZoneDef) {
    this.zone = zone;
    for (const m of this.staticMeshes) m.dispose();
    this.staticMeshes = [];
    for (const [, v] of this.entities) { v.mesh.dispose(); }
    this.entities.clear();
    if (this.selfMesh) { this.selfMesh.dispose(); this.selfMesh = null; }

    this.scene.clearColor = Color4.FromHexString(`${zone.fogColor}ff`);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = Color3.FromHexString(zone.fogColor);
    this.scene.fogDensity = zone.fogDensity;
    this.hemi.intensity = zone.ambient;
    this.hemi.diffuse = Color3.FromHexString(zone.ambientColor);
    this.sun.intensity = zone.sunIntensity;
    this.sun.diffuse = Color3.FromHexString(zone.sunColor);
    this.sun.direction = new Vector3(zone.sunDir.x, zone.sunDir.y, zone.sunDir.z);

    // ground
    const ground = MeshBuilder.CreateGround('ground', { width: zone.size, height: zone.size }, this.scene);
    ground.position.y = 0;
    const gm = new StandardMaterial('groundmat', this.scene);
    gm.diffuseColor = Color3.FromHexString(zone.groundColor);
    gm.specularColor = new Color3(0, 0, 0);
    ground.material = gm;
    ground.isPickable = false;
    this.staticMeshes.push(ground);

    // ground props (roads, patches)
    for (const p of zone.props) {
      const plane = MeshBuilder.CreateGround(`prop_${p.x}_${p.z}`, { width: p.w, height: p.d }, this.scene);
      plane.position.set(p.x, 0.02, p.z);
      const m = new StandardMaterial(`propmat_${p.x}_${p.z}`, this.scene);
      m.diffuseColor = Color3.FromHexString(p.color);
      m.specularColor = new Color3(0, 0, 0);
      plane.material = m;
      plane.isPickable = false;
      this.staticMeshes.push(plane);
    }

    // obstacles
    for (const o of collidersFor(zone)) this.staticMeshes.push(this.makeObstacle(o));

    // portals
    for (const portal of zone.portals) {
      const ring = MeshBuilder.CreateTorus(`portal_${portal.id}`, { diameter: 3.2, thickness: 0.28, tessellation: 20 }, this.scene);
      ring.position.set(portal.x, 1.4, portal.z);
      const m = new StandardMaterial(`portmat_${portal.id}`, this.scene);
      m.emissiveColor = Color3.FromHexString('#7b5cff');
      m.diffuseColor = new Color3(0.2, 0.15, 0.4);
      ring.material = m;
      ring.isPickable = false;
      this.staticMeshes.push(ring);
    }

    // invisible pick plane for click-to-move
    const pick = MeshBuilder.CreateGround('pickplane', { width: zone.size, height: zone.size }, this.scene);
    pick.isVisible = false;
    pick.isPickable = true;
    this.pickGround = pick;
    this.staticMeshes.push(pick);
  }

  private makeObstacle(o: Obstacle): Mesh {
    let mesh: Mesh;
    if (o.kind === 'tree') {
      mesh = MeshBuilder.CreateCylinder(`tree_${o.x}_${o.z}`, { height: (o.h || 5), diameterTop: 0.2, diameterBottom: 1.4 }, this.scene);
      mesh.position.set(o.x, (o.h || 5) / 2, o.z);
    } else if (o.kind === 'rock' || o.kind === 'pillar') {
      mesh = MeshBuilder.CreateCylinder(`rock_${o.x}_${o.z}`, { height: o.h || 2, diameterTop: (o.w || 1.5) * 0.8, diameterBottom: o.w || 1.5 }, this.scene);
      mesh.position.set(o.x, (o.h || 2) / 2, o.z);
    } else if (o.kind === 'water' || o.kind === 'pit') {
      mesh = MeshBuilder.CreateGround(`water_${o.x}_${o.z}`, { width: o.w, height: o.d }, this.scene);
      mesh.position.set(o.x, 0.05, o.z);
    } else {
      mesh = MeshBuilder.CreateBox(`box_${o.x}_${o.z}`, { width: o.w, height: o.h || 3, depth: o.d }, this.scene);
      mesh.position.set(o.x, (o.h || 3) / 2, o.z);
    }
    const m = new StandardMaterial(`omat_${o.x}_${o.z}`, this.scene);
    m.diffuseColor = Color3.FromHexString(o.color);
    m.specularColor = new Color3(0, 0, 0);
    if (o.kind === 'water' || o.kind === 'pit') { m.alpha = 0.75; m.emissiveColor = Color3.FromHexString(o.color).scale(0.3); }
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  }

  // ------------------------------------------------------------------ rendering from snapshots

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
      if (e.kind === 'ground') {
        view.mesh.rotation.y += 0.02;
        view.mesh.position.y = 0.5 + Math.sin(performance.now() / 400) * 0.12;
      }
      this.tintEntity(view, e);
    }
    for (const id of msg.removed) {
      const v = this.entities.get(id);
      if (v) { v.mesh.dispose(); this.entities.delete(id); }
    }
    // cull stale entities not in this snapshot and not removed
    for (const [id, v] of this.entities) {
      if (!seen.has(id)) { v.mesh.dispose(); this.entities.delete(id); }
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
      if (this.selfMesh) this.selfMesh.setEnabled(false);
      return;
    }
    if (!this.selfMesh) {
      this.selfMesh = this.makeCharacterMesh(you.appearance.bodyColor, you.appearance.hairColor);
    }
    this.selfMesh.setEnabled(true);
    this.selfMesh.position.set(you.x, 0, you.z);
    this.selfMesh.rotation.y = you.heading;
  }

  private createEntity(e: SnapshotEntity): EntityView | null {
    const scene = this.scene;
    let mesh: Mesh;
    let defId: string | undefined;
    let label: string | undefined;
    switch (e.kind) {
      case 'player': {
        const ps = e as PlayerSnapshot;
        mesh = this.makeCharacterMesh(ps.colors?.bodyColor ?? '#90a4ae', ps.colors?.hairColor ?? '#3e2723');
        break;
      }
      case 'enemy': {
        const es = e as EnemySnapshot;
        defId = es.defId;
        const def = ENEMIES[es.defId];
        const scale = def?.scale ?? 1;
        if (es.defId.includes('wisp')) {
          mesh = MeshBuilder.CreateSphere(`e_${e.id}`, { diameter: 1.4 * scale, segments: 8 }, scene);
        } else if (def?.archetype === 'hunter' || es.defId.includes('wolf') || es.defId.includes('boar')) {
          mesh = MeshBuilder.CreateBox(`e_${e.id}`, { width: 1.0 * scale, height: 0.9 * scale, depth: 1.6 * scale }, scene);
        } else {
          mesh = MeshBuilder.CreateCapsule(`e_${e.id}`, { height: 1.9 * scale, radius: 0.45 * scale }, scene);
        }
        mesh.position.y = 0.5 * scale;
        label = es.name;
        break;
      }
      case 'npc': {
        mesh = MeshBuilder.CreateCylinder(`npc_${e.id}`, { height: 1.8, diameter: 0.7 }, scene);
        mesh.position.y = 0.9;
        break;
      }
      case 'node': {
        mesh = MeshBuilder.CreatePolyhedron(`node_${e.id}`, { type: 1, size: 0.55 }, scene);
        mesh.position.y = 0.7;
        break;
      }
      case 'ground': {
        defId = 'ground';
        mesh = MeshBuilder.CreateBox(`ground_${e.id}`, { size: 0.4 }, scene);
        mesh.position.y = 0.5;
        break;
      }
      case 'portal': {
        return null;
      }
      default:
        return null;
    }
    const mat = new StandardMaterial(`mat_${e.id}`, scene);
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    mesh.material = mat;
    mesh.metadata = { entityId: e.id, kind: e.kind };
    mesh.isPickable = e.kind === 'enemy' || e.kind === 'npc';
    return { mesh, kind: e.kind, tx: e.x, tz: e.z, th: e.h, defId, label };
  }

  private tintEntity(view: EntityView, e: SnapshotEntity) {
    const mat = view.mesh.material as StandardMaterial | null;
    if (!mat) return;
    if (e.kind === 'enemy') {
      const es = e as EnemySnapshot;
      const def = ENEMIES[es.defId];
      let color = def?.color ?? '#8d6e63';
      if (es.hp !== undefined && es.mhp && es.mhp > 0 && es.hp / es.mhp < 0.3) color = '#c62828';
      mat.diffuseColor = Color3.FromHexString(color);
      mat.emissiveColor = e.flash ? new Color3(0.8, 0.15, 0.15) : new Color3(0, 0, 0);
      if (es.boss) mat.emissiveColor = mat.emissiveColor.add(new Color3(0.25, 0.05, 0.35));
    } else if (e.kind === 'npc') {
      const npc = Object.values(NPCS).find((n) => Math.abs(n.x - e.x) < 2 && Math.abs(n.z - e.z) < 2);
      mat.diffuseColor = Color3.FromHexString(npc?.color ?? '#ffd54f');
      mat.emissiveColor = new Color3(0.08, 0.08, 0.12);
    } else if (e.kind === 'node') {
      const ndef = e.state ? RESOURCE_NODES[e.state] : undefined;
      mat.diffuseColor = Color3.FromHexString(ndef?.color ?? '#7e57c2');
      mat.emissiveColor = new Color3(0.1, 0.1, 0.15);
    } else if (e.kind === 'ground') {
      const gold = e.state === 'gold';
      mat.diffuseColor = Color3.FromHexString(gold ? '#ffcc33' : '#e0e0e0');
      mat.emissiveColor = gold ? new Color3(0.4, 0.3, 0.05) : new Color3(0.15, 0.15, 0.15);
    } else if (e.kind === 'player') {
      const ps = e as PlayerSnapshot;
      mat.diffuseColor = Color3.FromHexString(ps.colors?.bodyColor ?? '#90a4ae');
      mat.emissiveColor = ps.pvp ? new Color3(0.35, 0.05, 0.05) : new Color3(0, 0, 0);
    }
  }

  private makeCharacterMesh(body: string, hair: string): Mesh {
    const root = MeshBuilder.CreateCapsule('char', { height: 1.7, radius: 0.4 }, this.scene);
    root.position.y = 0.85;
    const mat = new StandardMaterial(`charmat_${Math.random()}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(body);
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    root.material = mat;
    root.isPickable = false;
    void hair;
    return root;
  }

  // ------------------------------------------------------------------ input

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

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => this.keys.clear();

  private onPointerDown = (e: PointerEvent) => {
    this.lastPointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
  };

  private onPointerUp = (e: PointerEvent) => {
    const dx = e.clientX - this.lastPointerDown.x;
    const dy = e.clientY - this.lastPointerDown.y;
    const moved = Math.hypot(dx, dy);
    if (moved > 6 || performance.now() - this.lastPointerDown.t > 400) return;
    if (e.button !== 0) return;
    const pick = this.scene.pick(e.clientX, e.clientY, (m) => m.isPickable || m.name === 'pickplane');
    if (!pick?.hit || !pick.pickedPoint) return;
    const meta = pick.pickedMesh?.metadata as { entityId?: number; kind?: string } | undefined;
    if (meta?.kind === 'enemy' && meta.entityId !== undefined) {
      this.selectedTarget = meta.entityId;
      this.cb.send({ t: 'attack', seq: this.inputSeq++, targetId: meta.entityId });
      return;
    }
    if (meta?.kind === 'npc' && meta.entityId !== undefined) {
      this.cb.send({ t: 'interact', targetId: meta.entityId, kind: 'npc' });
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

  // ------------------------------------------------------------------ per-frame

  private update(dt: number) {
    // camera follow
    const target = new Vector3(this.localPos.x, 1.2, this.localPos.z);
    this.camera.target = Vector3.Lerp(this.camera.target, target, Math.min(1, dt * 8));
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 3);
      const s = this.shakeEnabled ? this.cameraShake : 0;
      this.camera.target.addInPlace(new Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }

    // interpolate entities
    for (const [, v] of this.entities) {
      v.mesh.position.x += (v.tx - v.mesh.position.x) * Math.min(1, dt * 10);
      v.mesh.position.z += (v.tz - v.mesh.position.z) * Math.min(1, dt * 10);
      let da = v.th - v.mesh.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      v.mesh.rotation.y += da * Math.min(1, dt * 10);
    }

    // send movement input at ~15Hz
    this.moveSendTimer += dt;
    if (this.moveSendTimer >= 1 / 15) {
      this.moveSendTimer = 0;
      this.sendMovement();
    }
  }

  private sendMovement() {
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    if (fwd === 0 && strafe === 0) {
      this.cb.send({ t: 'stop', seq: this.inputSeq++ });
      return;
    }
    // camera-relative direction
    const yaw = this.camera.alpha + Math.PI;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // forward in world space
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
        const d = Math.hypot(v.mesh.position.x - this.localPos.x, v.mesh.position.z - this.localPos.z);
        const range = v.kind === 'npc' ? 5 : 5.5;
        if (d < Math.min(bestD, range)) {
          bestD = d;
          best = { id, kind: v.kind as 'npc' | 'node' | 'ground', label: v.kind === 'npc' ? 'Talk to NPC' : v.kind === 'node' ? 'Gather resource' : 'Pick up item' };
        }
      }
    }
    this.nearestInteract = best;
    this.cb.onInteractPrompt(best ? `[E] ${best.label}` : null);
  }

  setQuality(quality: 'low' | 'medium' | 'high') {
    const scale = quality === 'low' ? 0.65 : quality === 'high' ? 1 : 0.85;
    this.engine.setHardwareScalingLevel(1 / scale);
    if (quality === 'low') {
      this.scene.fogDensity = this.zone.fogDensity * 1.6;
      this.sun.shadowEnabled = false;
    }
  }

  setDrawDistance(d: number) {
    this.camera.maxZ = d + 120;
    this.scene.fogDensity = this.zone.fogDensity * (70 / Math.max(30, d));
  }

  setShake(enabled: boolean) { this.shakeEnabled = enabled; }
  setInvertY(inverted: boolean) { this.invertY = inverted; }

  triggerShake(amount = 0.5) { this.cameraShake = Math.min(1.5, this.cameraShake + amount); }

  projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()),
    );
    return { x: v.x, y: v.y, visible: v.z > 0 && v.z < 1 };
  }

  get local() { return this.localPos; }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}

export type { ArchetypeId };
