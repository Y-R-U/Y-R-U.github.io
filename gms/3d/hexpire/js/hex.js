// Axial (pointy-top) hex math. Keys are "q,r" strings.
import { CFG } from './config.js';

export const DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export const key = (q, r) => q + ',' + r;
export const unkey = (k) => k.split(',').map(Number);

export function neighbors(q, r) {
  return DIRS.map(([dq, dr]) => [q + dq, r + dr]);
}

export function hexDist(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
}

// all hexes with distance <= radius from (q,r), including itself
export function disc(q, r, radius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      out.push([q + dq, r + dr]);
    }
  }
  return out;
}

// hex -> world (x, z); pointy-top
export function hexToWorld(q, r) {
  const s = CFG.hexSize;
  return {
    x: s * Math.sqrt(3) * (q + r / 2),
    z: s * 1.5 * r,
  };
}

// world (x, z) -> nearest hex [q, r]
export function worldToHex(x, z) {
  const s = CFG.hexSize;
  const qf = (Math.sqrt(3) / 3 * x - 1 / 3 * z) / s;
  const rf = (2 / 3 * z) / s;
  return roundHex(qf, rf);
}

export function roundHex(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), sr = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(sr - sf);
  if (dq > dr && dq > ds) q = -r - sr;
  else if (dr > ds) r = -q - sr;
  return [q, r];
}

// the 6 corner offsets of a pointy-top hex (x, z), corner k between DIRS edges.
// corner(k) and corner(k+1) bound the edge toward neighbor DIRS[k]... we define
// explicitly: edge toward DIRS[i] uses corners edgeCorners[i] = [a, b].
export function corner(k, scale = 1) {
  const a = Math.PI / 3 * k + Math.PI / 6;
  return { x: Math.cos(a) * CFG.hexSize * scale, z: Math.sin(a) * CFG.hexSize * scale };
}

// For each direction index i in DIRS, which corner pair forms that edge.
// Derived: neighbor center dir angle = atan2(z, x); edge midpoint lies halfway.
export const EDGE_CORNERS = DIRS.map(([dq, dr]) => {
  const c = hexToWorld(dq, dr); // neighbor offset from origin
  const mid = { x: c.x / 2, z: c.z / 2 };
  // find two corners nearest to mid
  const idx = [0, 1, 2, 3, 4, 5]
    .map(k => ({ k, d: (corner(k).x - mid.x) ** 2 + (corner(k).z - mid.z) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2).map(o => o.k);
  return idx;
});

// BFS over passable tiles. passable(k) -> bool, from key, maxCost.
// Returns Map key -> cost.
export function bfs(fromKey, maxCost, passable) {
  const dist = new Map([[fromKey, 0]]);
  let frontier = [fromKey];
  for (let c = 1; c <= maxCost; c++) {
    const next = [];
    for (const k of frontier) {
      const [q, r] = unkey(k);
      for (const [nq, nr] of neighbors(q, r)) {
        const nk = key(nq, nr);
        if (dist.has(nk) || !passable(nk)) continue;
        dist.set(nk, c);
        next.push(nk);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return dist;
}

// Reconstruct one shortest path (list of keys, excluding start) to target
// using a dist map produced by bfs().
export function pathTo(dist, targetKey) {
  if (!dist.has(targetKey)) return null;
  const path = [targetKey];
  let cur = targetKey, d = dist.get(targetKey);
  while (d > 1) {
    const [q, r] = unkey(cur);
    for (const [nq, nr] of neighbors(q, r)) {
      const nk = key(nq, nr);
      if (dist.get(nk) === d - 1) { path.push(nk); cur = nk; d--; break; }
    }
  }
  return path.reverse();
}

// connected components of a set of keys
export function components(keys) {
  const left = new Set(keys);
  const comps = [];
  while (left.size) {
    const start = left.values().next().value;
    left.delete(start);
    const comp = [start];
    const stack = [start];
    while (stack.length) {
      const [q, r] = unkey(stack.pop());
      for (const [nq, nr] of neighbors(q, r)) {
        const nk = key(nq, nr);
        if (left.has(nk)) { left.delete(nk); comp.push(nk); stack.push(nk); }
      }
    }
    comps.push(comp);
  }
  return comps;
}
