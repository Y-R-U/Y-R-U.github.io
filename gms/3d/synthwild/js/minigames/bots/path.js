// A* on the walkable voxel grid (cell resolution). Pure: solid(x,y,z) -> bool is all it needs.
// Moves: walk (8 dirs, no corner cutting), step up 1, drop up to 3, jump straight over a 1–2 cell gap.

export const MAX_DROP = 3, MAX_GAP = 2;

// avoid(x, y, z): optional, true for a floor cell bots should not step on if there's another way.
export function makeGrid(solid) {
  const air = (x, y, z) => !solid(x, y, z);
  const standable = (x, y, z) => air(x, y, z) && air(x, y + 1, z) && solid(x, y - 1, z);
  return { solid, air, standable };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Neighbour moves from a standable cell: [x, y, z, cost, kind].
export function neighbours(G, x, y, z, out = []) {
  out.length = 0;
  const { air, standable } = G;
  for (const [dx, dz] of DIRS) {
    const diag = dx && dz;
    const nx = x + dx, nz = z + dz;
    if (diag && (!air(x + dx, y, z) || !air(x + dx, y + 1, z) || !air(x, y, z + dz) || !air(x, y + 1, z + dz))) continue;
    if (standable(nx, y, nz)) { out.push([nx, y, nz, diag ? 1.414 : 1, 'walk']); continue; }
    if (diag) continue;
    if (standable(nx, y + 1, nz) && air(x, y + 2, z)) { out.push([nx, y + 1, nz, 1.6, 'up']); continue; }
    if (air(nx, y, nz) && air(nx, y + 1, nz)) {
      let dropped = false;
      for (let d = 1; d <= MAX_DROP; d++) {
        if (!air(nx, y - d + 1, nz)) break;
        if (standable(nx, y - d, nz)) { out.push([nx, y - d, nz, 1 + d * 0.4, 'drop']); dropped = true; break; }
      }
      if (dropped) continue;
      // Gap jump: the cells in between are open air we'd fall through, landing level or one lower.
      if (!air(x, y + 2, z)) continue;
      for (let g = 1; g <= MAX_GAP; g++) {
        const bx = x + dx * g, bz = z + dz * g;
        if (!air(bx, y, bz) || !air(bx, y + 1, bz) || !air(bx, y + 2, bz) || !air(bx, y - 1, bz)) break;
        const lx = x + dx * (g + 1), lz = z + dz * (g + 1);
        if (standable(lx, y, lz)) { out.push([lx, y, lz, 2 + g, 'jump']); break; }
        if (standable(lx, y - 1, lz)) { out.push([lx, y - 1, lz, 2 + g, 'jump']); break; }
      }
    }
  }
  return out;
}

// Binary heap keyed on f.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= n.f) break; a[i] = a[p]; i = p; } a[i] = n; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { let i = 0; for (;;) { let c = i * 2 + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1].f < a[c].f) c++; if (a[c].f >= last.f) break; a[i] = a[c]; i = c; } a[i] = last; }
    return top;
  }
}

const key = (x, y, z) => `${x},${y},${z}`;

// Find a standable cell near (x,y,z): the cell itself, or one up to `r` below/around it.
export function snap(G, x, y, z, r = 3) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  for (let d = 0; d <= r; d++) for (let dy = 0; dy <= r + 1; dy++) for (const sy of [y - dy, y + dy]) {
    for (let dx = -d; dx <= d; dx++) for (let dz = -d; dz <= d; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
      if (G.standable(x + dx, sy, z + dz)) return [x + dx, sy, z + dz];
    }
  }
  return null;
}

// Returns [[x,y,z,kind], ...] from start (exclusive) to goal, or null. near: accept within this distance of goal.
export function findPath(G, start, goal, { maxNodes = 3000, near = 0 } = {}) {
  const s = snap(G, ...start, 2), g = snap(G, ...goal, 3);
  if (!s || !g) return null;
  const h = (x, y, z) => Math.hypot(x - g[0], (y - g[1]) * 1.5, z - g[2]);
  const open = new Heap();
  const best = new Map([[key(...s), 0]]);
  const from = new Map();
  open.push({ x: s[0], y: s[1], z: s[2], g: 0, f: h(...s) });
  const nb = [];
  let n = 0, closest = null;
  while (open.size && n++ < maxNodes) {
    const c = open.pop();
    const ck = key(c.x, c.y, c.z);
    if (c.g > (best.get(ck) ?? Infinity)) continue;
    const hd = h(c.x, c.y, c.z);
    if (!closest || hd < closest.h) closest = { h: hd, k: ck, c };
    if ((c.x === g[0] && c.y === g[1] && c.z === g[2]) || hd <= near) return unwind(from, ck, s);
    for (const [x, y, z, cost, kind] of neighbours(G, c.x, c.y, c.z, nb)) {
      // Avoided floors (e.g. cracking spleef glass) cost extra, so paths go around them when they can.
      const k = key(x, y, z), ng = c.g + cost + (G.avoid?.(x, y - 1, z) ? 6 : 0);
      if (ng >= (best.get(k) ?? Infinity)) continue;
      best.set(k, ng);
      from.set(k, [ck, kind]);
      open.push({ x, y, z, g: ng, f: ng + h(x, y, z) });
    }
  }
  return null;
}

// Best effort: path to the reachable cell closest to the goal (used when the goal itself is unreachable).
export function findPathClosest(G, start, goal, opts = {}) {
  const p = findPath(G, start, goal, opts);
  if (p) return p;
  return findPath(G, start, goal, { ...opts, near: 6 });
}

function unwind(from, k, s) {
  const out = [];
  while (from.has(k)) {
    const [pk, kind] = from.get(k);
    const [x, y, z] = k.split(',').map(Number);
    out.push([x, y, z, kind]);
    k = pk;
  }
  return out.reverse();
}
