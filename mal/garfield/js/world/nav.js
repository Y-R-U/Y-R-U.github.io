import * as THREE from '../../vendor/three/three.module.js';

// Jon's walk graph: a 0.2 m grid per floor, nodes blocked by colliders that overlap Jon's body,
// joined by an explicit stair chain. Dynamic colliders (props: doors, chair...) are re-tested per query.
const STEP = 0.2, R = 0.26;

export function createNav({ colliders, floors, stairs, bounds, isDynamic }) {
  const nodes = []; // {x,y,z,floor, staticBlocked}
  const grids = floors.map((fy, fi) => {
    const nx = Math.floor((bounds.x1 - bounds.x0) / STEP) + 1, nz = Math.floor((bounds.z1 - bounds.z0) / STEP) + 1;
    const start = nodes.length;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      nodes.push({ x: bounds.x0 + i * STEP, y: fy, z: bounds.z0 + j * STEP, floor: fi, i, j, stair: false });
    }
    return { fy, nx, nz, start };
  });
  const hits = (c, x, y, z) => c.enabled !== false && x + R > c.min.x && x - R < c.max.x && z + R > c.min.z && z - R < c.max.z
    && y + 1.75 > c.min.y && y + 0.3 < c.max.y;
  const supported = (x, y, z) => colliders.some(c => c.enabled !== false && c.floor && x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && Math.abs(c.max.y - y) < 0.05);
  const statics = () => colliders.filter(c => !isDynamic(c));
  const st0 = statics();
  for (const n of nodes) n.sb = !supported(n.x, n.y, n.z) || st0.some(c => hits(c, n.x, n.y, n.z));
  // stair chain (centre line of the flight)
  const sx = (stairs.x0 + stairs.x1) / 2;
  const chain = [];
  const addStair = (x, y, z) => { const n = { x, y, z, floor: -1, stair: true, sb: false }; nodes.push(n); chain.push(nodes.length - 1); };
  addStair(sx, 0, stairs.z0 - 0.35);
  for (let i = 1; i <= stairs.steps; i += 2) addStair(sx, i * stairs.rise, stairs.z0 + (i - 0.5) * stairs.run);
  addStair(sx, floors[1], stairs.z1 + 0.35);

  const idx = (g, i, j) => (i < 0 || j < 0 || i >= g.nx || j >= g.nz) ? -1 : g.start + j * g.nx + i;
  const extra = new Map();
  const link = (a, b) => { (extra.get(a) || extra.set(a, []).get(a)).push(b); (extra.get(b) || extra.set(b, []).get(b)).push(a); };
  for (let k = 0; k < chain.length - 1; k++) link(chain[k], chain[k + 1]);
  // join chain ends to nearby free grid nodes
  for (const [ci, fi] of [[chain[0], 0], [chain[chain.length - 1], 1]]) {
    const c = nodes[ci], g = grids[fi];
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const n = nodes[idx(g, i, j)];
      if (!n.sb && Math.hypot(n.x - c.x, n.z - c.z) < 0.45) link(ci, idx(g, i, j));
    }
  }

  let dynCache = null;
  function blocked(k) {
    const n = nodes[k];
    if (n.sb) return true;
    if (n.stair) return false;
    if (dynCache.has(k)) return dynCache.get(k);
    const v = dynCols.some(c => hits(c, n.x, n.y, n.z));
    dynCache.set(k, v);
    return v;
  }
  let dynCols = [];

  function neighbours(k) {
    const n = nodes[k], out = [];
    if (!n.stair) {
      const g = grids[n.floor];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const m = idx(g, n.i + di, n.j + dj);
        if (m < 0 || blocked(m)) continue;
        if (di && dj && (blocked(idx(g, n.i + di, n.j)) || blocked(idx(g, n.i, n.j + dj)))) continue;
        out.push(m);
      }
    }
    for (const m of extra.get(k) || []) if (!blocked(m)) out.push(m);
    return out;
  }

  function floorOf(p) { return p.y > (floors[0] + floors[1]) / 2 - 0.4 ? 1 : 0; }
  function nearest(p) {
    const fi = floorOf(p), g = grids[fi];
    const ci = Math.round((p.x - bounds.x0) / STEP), cj = Math.round((p.z - bounds.z0) / STEP);
    // on the stairs → nearest chain node
    if (p.x > stairs.x0 - 0.1 && p.z > stairs.z0 - 0.2 && p.z < stairs.z1 + 0.2 && p.y > 0.2 && p.y < floors[1] - 0.2) {
      let best = -1, bd = 1e9;
      for (const k of chain) { const n = nodes[k]; const d = Math.hypot(n.z - p.z, n.y - p.y); if (d < bd) { bd = d; best = k; } }
      return best;
    }
    for (let r = 0; r < 30; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const k = idx(g, ci + di, cj + dj);
        if (k < 0 || blocked(k)) continue;
        const n = nodes[k], d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  function clearLine(a, b) {
    if (a.stair || b.stair || a.floor !== b.floor) return false;
    const g = grids[a.floor];
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(len / (STEP * 0.5));
    for (let s = 1; s < n; s++) {
      const t = s / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const i = Math.round((x - bounds.x0) / STEP), j = Math.round((z - bounds.z0) / STEP);
      const k = idx(g, i, j);
      if (k < 0 || blocked(k)) return false;
      // also test the floor-aligned neighbours the segment passes between
      const i2 = Math.floor((x - bounds.x0) / STEP), j2 = Math.floor((z - bounds.z0) / STEP);
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const kk = idx(g, i2 + di, j2 + dj);
        const nn = kk >= 0 ? nodes[kk] : null;
        if (nn && Math.hypot(nn.x - x, nn.z - z) < STEP * 0.75 && blocked(kk)) return false;
      }
    }
    return true;
  }

  const api = {
    blockedEdges: new Set(),
    path(from, to) {
      dynCols = colliders.filter(c => isDynamic(c) && c.enabled !== false);
      dynCache = new Map();
      const s = nearest(from), t = nearest(to);
      if (s < 0 || t < 0) return [to.clone()];
      const open = new Map([[s, 0]]), came = new Map(), gs = new Map([[s, 0]]);
      const h = (k) => { const a = nodes[k], b = nodes[t]; return Math.hypot(a.x - b.x, (a.y - b.y) * 1.2, a.z - b.z); };
      const f = new Map([[s, h(s)]]);
      let found = false, iter = 0;
      while (open.size && iter++ < 20000) {
        let cur = -1, cf = 1e18;
        for (const [k] of open) { const v = f.get(k); if (v < cf) { cf = v; cur = k; } }
        if (cur === t) { found = true; break; }
        open.delete(cur);
        const cn = nodes[cur];
        for (const m of neighbours(cur)) {
          const mn = nodes[m];
          const g2 = gs.get(cur) + Math.hypot(mn.x - cn.x, mn.y - cn.y, mn.z - cn.z);
          if (g2 < (gs.get(m) ?? 1e18)) { came.set(m, cur); gs.set(m, g2); f.set(m, g2 + h(m)); open.set(m, 1); }
        }
      }
      if (!found) return null;
      const raw = [t];
      while (raw[raw.length - 1] !== s) raw.push(came.get(raw[raw.length - 1]));
      raw.reverse();
      // string-pull
      const out = [nodes[raw[0]]];
      let i = 0;
      while (i < raw.length - 1) {
        let j = raw.length - 1;
        while (j > i + 1 && !clearLine(nodes[raw[i]], nodes[raw[j]])) j--;
        out.push(nodes[raw[j]]);
        i = j;
      }
      const pts = out.map(n => new THREE.Vector3(n.x, n.y, n.z));
      if (pts.length > 1 && pts[0].distanceTo(from) < 0.3) pts.shift();
      pts.push(new THREE.Vector3(to.x, nodes[t].y, to.z));
      return pts;
    },
    // debug: free nodes for visualisation
    debugPoints() {
      dynCols = colliders.filter(c => isDynamic(c) && c.enabled !== false); dynCache = new Map();
      return nodes.map((n, k) => ({ x: n.x, y: n.y, z: n.z, blocked: blocked(k) }));
    },
  };
  return api;
}
