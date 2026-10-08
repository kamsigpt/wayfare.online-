import type { CollisionGrid } from './collision.js';

interface Node {
  x: number;
  z: number;
  g: number;
  f: number;
  parent?: Node;
}

export function findPath(grid: CollisionGrid, sx: number, sz: number, tx: number, tz: number, maxNodes = 4000): { x: number; z: number }[] {
  const cell = grid.cell;
  const half = grid.zone.size / 2;
  const toCell = (v: number) => Math.floor((v + half) / cell);
  const toWorld = (c: number) => c * cell - half + cell / 2;

  const startX = toCell(sx);
  const startZ = toCell(sz);
  let goalX = toCell(tx);
  let goalZ = toCell(tz);

  if (grid.circleHits(tx, tz, 0.6)) {
    let found = false;
    for (let r = 1; r <= 4 && !found; r++) {
      for (let dz = -r; dz <= r && !found; dz++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const cx = goalX + dx;
          const cz = goalZ + dz;
          if (!grid.circleHits(toWorld(cx), toWorld(cz), 0.6)) {
            goalX = cx;
            goalZ = cz;
            found = true;
          }
        }
      }
    }
    if (!found) return [];
  }

  const key = (x: number, z: number) => x * 100000 + z;
  const open: Node[] = [];
  const openMap = new Map<number, Node>();
  const closed = new Set<number>();

  const start: Node = { x: startX, z: startZ, g: 0, f: 0 };
  open.push(start);
  openMap.set(key(startX, startZ), start);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  let visited = 0;
  while (open.length > 0 && visited < maxNodes) {
    visited++;
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIdx].f) bestIdx = i;
    const current = open.splice(bestIdx, 1)[0];
    openMap.delete(key(current.x, current.z));
    closed.add(key(current.x, current.z));

    if (current.x === goalX && current.z === goalZ) {
      const path: { x: number; z: number }[] = [];
      let n: Node | undefined = current;
      while (n) {
        path.push({ x: toWorld(n.x), z: toWorld(n.z) });
        n = n.parent;
      }
      path.reverse();
      return path;
    }

    for (const [dx, dz] of dirs) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      const k = key(nx, nz);
      if (closed.has(k)) continue;
      if (nx < 0 || nz < 0 || nx >= grid.cols || nz >= grid.rows) continue;
      if (grid.circleHits(toWorld(nx), toWorld(nz), 0.6)) continue;
      if (dx !== 0 && dz !== 0) {
        if (grid.circleHits(toWorld(current.x + dx), toWorld(current.z), 0.6)) continue;
      }
      const cost = dx !== 0 && dz !== 0 ? 1.414 : 1;
      const g = current.g + cost;
      const existing = openMap.get(k);
      if (existing && existing.g <= g) continue;
      const h = Math.abs(nx - goalX) + Math.abs(nz - goalZ);
      const node: Node = { x: nx, z: nz, g, f: g + h, parent: current };
      if (existing) {
        existing.g = g;
        existing.f = node.f;
        existing.parent = current;
      } else {
        open.push(node);
        openMap.set(k, node);
      }
    }
  }
  return [];
}
