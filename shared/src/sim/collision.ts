import { getZone, type Obstacle, type ZoneDef } from '../content/zones.js';

export class CollisionGrid {
  readonly zone: ZoneDef;
  readonly cell = 4;
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(zoneId: string) {
    this.zone = getZone(zoneId);
    this.cols = Math.ceil(this.zone.size / this.cell);
    this.rows = this.cols;
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (const o of this.zone.obstacles) {
      if (o.kind === 'water' && zoneId === 'greenreach') continue;
      this.stamp(o);
    }
  }

  private stamp(o: Obstacle) {
    const half = this.zone.size / 2;
    const x0 = Math.floor((o.x - o.w / 2 + half) / this.cell);
    const x1 = Math.floor((o.x + o.w / 2 + half) / this.cell);
    const z0 = Math.floor((o.z - o.d / 2 + half) / this.cell);
    const z1 = Math.floor((o.z + o.d / 2 + half) / this.cell);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && z >= 0 && x < this.cols && z < this.rows) {
          this.blocked[z * this.cols + x] = 1;
        }
      }
    }
  }

  private cellAt(x: number, z: number): boolean {
    const half = this.zone.size / 2;
    const cx = Math.floor((x + half) / this.cell);
    const cz = Math.floor((z + half) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return true;
    return this.blocked[cz * this.cols + cx] === 1;
  }

  circleHits(x: number, z: number, r: number): boolean {
    if (this.cellAt(x, z)) return true;
    if (r <= 0) return false;
    const steps = Math.max(1, Math.ceil((Math.PI * 2 * r) / (this.cell * 0.5)));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      if (this.cellAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true;
    }
    return false;
  }

  moveWithCollision(x: number, z: number, dx: number, dz: number, radius: number): { x: number; z: number; hit: boolean } {
    const nx = x + dx;
    const nz = z + dz;
    if (!this.circleHits(nx, nz, radius)) return { x: nx, z: nz, hit: false };
    if (!this.circleHits(nx, z, radius)) return { x: nx, z, hit: true };
    if (!this.circleHits(x, nz, radius)) return { x, z: nz, hit: true };
    if (!this.circleHits(nx + dx * 0.5, nz + dz * 0.5, radius)) {
      return { x: x + dx * 0.5, z: z + dz * 0.5, hit: true };
    }
    return { x, z, hit: true };
  }

  inBounds(x: number, z: number): boolean {
    const half = this.zone.size / 2 - 1;
    return x >= -half && x <= half && z >= -half && z <= half;
  }

  clampToZone(x: number, z: number): { x: number; z: number } {
    const half = this.zone.size / 2 - 2;
    return { x: Math.max(-half, Math.min(half, x)), z: Math.max(-half, Math.min(half, z)) };
  }

  hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(dist / (this.cell * 0.6));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.cellAt(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }
}
