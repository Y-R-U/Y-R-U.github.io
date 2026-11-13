// City district generator. Pure: no three, no DOM.

function mulberry32(a) {
  a = (a >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDEWALK = 3;

function axisLayout(rnd, lo, hi, nBlocks) {
  const roads = [];
  for (let i = 0; i <= nBlocks; i++) {
    const outer = i === 0 || i === nBlocks;
    const mid = i === nBlocks >> 1;
    roads.push(outer ? 16 + rnd() * 2 : mid ? 20 + rnd() * 3 : 17 + rnd() * 3);
  }
  const rest = hi - lo - roads.reduce((a, b) => a + b, 0);
  const wts = [];
  for (let i = 0; i < nBlocks; i++) wts.push(0.85 + rnd() * 0.3);
  const ws = wts.reduce((a, b) => a + b, 0);
  const out = { roads: [], blocks: [] };
  let c = lo;
  for (let i = 0; i <= nBlocks; i++) {
    out.roads.push({ a: c, b: c + roads[i], c: c + roads[i] / 2, w: roads[i] });
    c += roads[i];
    if (i < nBlocks) {
      const bw = rest * wts[i] / ws;
      out.blocks.push({ a: c, b: c + bw, c: c + bw / 2, w: bw });
      c += bw;
    }
  }
  return out;
}

function splitRect(rnd, r, minSide, maxSide, out, depth = 0) {
  const long = r.w >= r.d ? 'w' : 'd';
  const L = r[long];
  if (L <= maxSide || depth > 6) { out.push(r); return; }
  const n = Math.max(2, Math.round(L / (minSide + rnd() * (maxSide - minSide))));
  const cut = L * (0.35 + rnd() * 0.3);
  if (cut < minSide || L - cut < minSide || n < 2) { out.push(r); return; }
  if (long === 'w') {
    splitRect(rnd, { x0: r.x0, z0: r.z0, w: cut, d: r.d }, minSide, maxSide, out, depth + 1);
    splitRect(rnd, { x0: r.x0 + cut, z0: r.z0, w: r.w - cut, d: r.d }, minSide, maxSide, out, depth + 1);
  } else {
    splitRect(rnd, { x0: r.x0, z0: r.z0, w: r.w, d: cut }, minSide, maxSide, out, depth + 1);
    splitRect(rnd, { x0: r.x0, z0: r.z0 + cut, w: r.w, d: r.d - cut }, minSide, maxSide, out, depth + 1);
  }
}

export const FACADES = [0xeadfc6, 0xdcc6a0, 0xcf8a66, 0xe0b070, 0x95a8bd, 0xa7b797, 0xd8aa9c, 0xe8d8b8];
export const ROOFS = { mansard: [0x4f5a72, 0x5b6680, 0x5e5658, 0x48587a, 0x66605e], dome: [0x3f5f9a, 0x4a8a7c, 0x52669e], pitched: [0xb4553a, 0xa24a30, 0xc06a40, 0x9a5638, 0xb85e3e], flat: [0x9c8c7a, 0xa48f78] };

function pick(rnd, a) { return a[Math.floor(rnd() * a.length)]; }

function makeBuildings(rnd, fp, opts) {
  const parts = [];
  splitRect(rnd, { x0: fp.x - fp.w / 2, z0: fp.z - fp.d / 2, w: fp.w, d: fp.d }, opts.min ?? 8, opts.max ?? 16, parts);
  return parts.map((p) => {
    const w = p.w, d = p.d;
    const floors = (opts.floorsMin ?? 3) + Math.floor(rnd() * ((opts.floorsMax ?? 5) - (opts.floorsMin ?? 3) + 1));
    const r = rnd();
    let roof = r < 0.34 ? 'mansard' : r < 0.68 ? 'pitched' : r < 0.84 ? 'flat' : 'dome';
    if (roof === 'dome' && Math.min(w, d) < 9) roof = 'mansard';
    const e = 0.01;
    const ext = {
      n: Math.abs(p.z0 - (fp.z - fp.d / 2)) < e, s: Math.abs(p.z0 + d - (fp.z + fp.d / 2)) < e,
      w: Math.abs(p.x0 - (fp.x - fp.w / 2)) < e, e: Math.abs(p.x0 + w - (fp.x + fp.w / 2)) < e,
    };
    return {
      x: p.x0 + w / 2, z: p.z0 + d / 2, w, d, ext, awning: rnd() < 0.55,
      floors, h: 4.2 + floors * 3.1,
      roof, facade: pick(rnd, FACADES), roofCol: pick(rnd, ROOFS[roof]),
      lit: 0.45 + rnd() * 0.35, seed: Math.floor(rnd() * 1e9), outer: !!opts.outer,
    };
  });
}

export function generateMap(seed = 1, opts = {}) {
  const rnd = mulberry32(seed * 2654435761 + 17);
  const size = opts.size ?? 240;
  const H = size / 2;
  const EDGE = 12;
  const N = 4;
  const ax = axisLayout(rnd, -H + EDGE, H - EDGE, N);
  const az = axisLayout(rnd, -H + EDGE, H - EDGE, N);

  const obstacles = [], plazas = [], spawns = [];
  const blocks = [], buildings = [], trees = [], lamps = [], fountains = [], statues = [], banners = [], planters = [], crossings = [];

  const kinds = [];
  for (let i = 0; i < N; i++) { kinds.push([]); for (let j = 0; j < N; j++) kinds[i].push('build'); }
  for (let i = 1; i <= 2; i++) for (let j = 1; j <= 2; j++) kinds[i][j] = 'central';
  const ring = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (kinds[i][j] === 'build') ring.push([i, j]);
  for (let k = ring.length - 1; k > 0; k--) { const q = Math.floor(rnd() * (k + 1)); [ring[k], ring[q]] = [ring[q], ring[k]]; }
  const nOpen = opts.plazas ?? (3 + Math.floor(rnd() * 3));
  const openKinds = ['plaza', 'park', 'square', 'park', 'plaza'];
  let placed = 0;
  for (const [i, j] of ring) {
    if (placed >= nOpen) break;
    let adj = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = kinds[i + di]?.[j + dj];
      if (k && k !== 'build' && k !== 'central') adj = true;
    }
    if (adj) continue;
    kinds[i][j] = openKinds[placed++];
  }

  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const bx = ax.blocks[i], bz = az.blocks[j];
    const b = { i, j, x: bx.c, z: bz.c, w: bx.w, d: bz.w, kind: kinds[i][j] };
    blocks.push(b);
    if (b.kind === 'build') {
      const fp = { x: b.x, z: b.z, w: b.w - SIDEWALK * 2, d: b.d - SIDEWALK * 2 };
      obstacles.push({ type: 'rect', x: fp.x, z: fp.z, w: fp.w, d: fp.d });
      buildings.push(...makeBuildings(rnd, fp, { min: 8, max: 15, floorsMin: 2, floorsMax: 4 }));
    } else if (b.kind === 'plaza') {
      const r = 4.2 + rnd() * 0.8;
      obstacles.push({ type: 'circle', x: b.x, z: b.z, r });
      fountains.push({ x: b.x, z: b.z, r, kind: 'small' });
      plazas.push({ x: b.x, z: b.z, r: Math.min(b.w, b.d) / 2 });
    } else if (b.kind === 'square') {
      obstacles.push({ type: 'circle', x: b.x, z: b.z, r: 2.6 });
      statues.push({ x: b.x, z: b.z, r: 2.6, kind: 'obelisk' });
      plazas.push({ x: b.x, z: b.z, r: Math.min(b.w, b.d) / 2 });
    } else if (b.kind === 'park') {
      obstacles.push({ type: 'circle', x: b.x, z: b.z, r: 3.6 });
      statues.push({ x: b.x, z: b.z, r: 3.6, kind: 'bandstand' });
      plazas.push({ x: b.x, z: b.z, r: Math.min(b.w, b.d) / 2 });
      const tr = Math.min(b.w, b.d) / 2 - 4;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + rnd() * 0.3;
        const rr = tr * (0.62 + rnd() * 0.35);
        trees.push({ x: b.x + Math.cos(a) * rr, z: b.z + Math.sin(a) * rr, s: 0.85 + rnd() * 0.45 });
      }
    }
  }

  const cx = ax.roads[2].c, cz = az.roads[2].c;
  const cw = ax.blocks[2].b - ax.blocks[1].a, cd = az.blocks[2].b - az.blocks[1].a;
  plazas.unshift({ x: cx, z: cz, r: Math.min(cw, cd) / 2, central: true });
  obstacles.push({ type: 'circle', x: cx, z: cz, r: 7 });
  fountains.push({ x: cx, z: cz, r: 7, kind: 'grand' });
  statues.push({ x: cx, z: cz, r: 2, kind: 'gold' });
  const cr = Math.min(cw, cd) / 2;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const px = cx + Math.cos(a) * cr * 0.72, pz = cz + Math.sin(a) * cr * 0.72;
    obstacles.push({ type: 'circle', x: px, z: pz, r: 2.4 });
    planters.push({ x: px, z: pz, r: 2.4 });
    trees.push({ x: px, z: pz, s: 1.25 });
  }

  const per = [
    { x: 0, z: -H, w: size + EDGE * 2, d: EDGE * 2 },
    { x: 0, z: H, w: size + EDGE * 2, d: EDGE * 2 },
    { x: -H, z: 0, w: EDGE * 2, d: size },
    { x: H, z: 0, w: EDGE * 2, d: size },
  ];
  for (const p of per) obstacles.push({ type: 'rect', ...p });
  const perimFps = [
    { x: 0, z: -H + EDGE / 2, w: size, d: EDGE },
    { x: 0, z: H - EDGE / 2, w: size, d: EDGE },
    { x: -H + EDGE / 2, z: 0, w: EDGE, d: size - EDGE * 2 },
    { x: H - EDGE / 2, z: 0, w: EDGE, d: size - EDGE * 2 },
  ];
  for (const fp of perimFps) buildings.push(...makeBuildings(rnd, fp, { min: 10, max: 18, floorsMin: 3, floorsMax: 5 }));

  // Visual-only outer city, beyond the perimeter, lost in fog.
  const OUT = H + 60;
  for (let gx = -OUT; gx < OUT; gx += 40) for (let gz = -OUT; gz < OUT; gz += 40) {
    const fp = { x: gx + 20, z: gz + 20, w: 26, d: 26 };
    if (Math.max(Math.abs(fp.x), Math.abs(fp.z)) - 13 < H + 6) continue;
    buildings.push(...makeBuildings(rnd, fp, { min: 9, max: 16, floorsMin: 3, floorsMax: 6, outer: true }));
  }

  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const rx = ax.roads[i], rz = az.roads[j];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (dx) {
        const nb = ax.roads[i + dx]; if (!nb) continue;
        const edge = dx > 0 ? rx.b : rx.a;
        crossings.push({ x: edge + dx * 2.4, z: rz.c, w: 3.2, d: rz.w - 1, dir: 'x' });
      } else {
        const nb = az.roads[j + dz]; if (!nb) continue;
        const edge = dz > 0 ? rz.b : rz.a;
        crossings.push({ x: rx.c, z: edge + dz * 2.4, w: rx.w - 1, d: 3.2, dir: 'z' });
      }
    }
  }

  // Lamps along block edges (sidewalk), skipping the central plaza interior.
  for (const b of blocks) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    if (b.kind === 'central') continue;
    const inset = 1.2;
    for (const [sx, sz] of corners) lamps.push({ x: b.x + sx * (b.w / 2 - inset), z: b.z + sz * (b.d / 2 - inset) });
    for (const s of [-1, 1]) {
      lamps.push({ x: b.x, z: b.z + s * (b.d / 2 - inset), banner: rnd() < 0.5 });
      lamps.push({ x: b.x + s * (b.w / 2 - inset), z: b.z, banner: rnd() < 0.5 });
    }
    if (b.kind !== 'build' && b.kind !== 'park') {
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        const rr = Math.min(b.w, b.d) / 2 - 5;
        trees.push({ x: b.x + Math.cos(a) * rr, z: b.z + Math.sin(a) * rr, s: 0.9 + rnd() * 0.3 });
      }
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8;
    lamps.push({ x: cx + Math.cos(a) * 13, z: cz + Math.sin(a) * 13, banner: k % 2 === 0, grand: true });
  }
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    lamps.push({ x: cx + s * (cw / 2 - 2), z: cz + t * (cd / 2 - 2) });
  }
  for (let k = 0; k < 4; k++) {
    const side = k % 2 ? 1 : -1, alongX = k < 2;
    const L = alongX ? cw : cd;
    for (let t = -L / 2 + 6; t <= L / 2 - 6; t += 7.5) {
      if (Math.abs(t) < 8) continue;
      const x = alongX ? cx + t : cx + side * (cw / 2 - 2.2), z = alongX ? cz + side * (cd / 2 - 2.2) : cz + t;
      trees.push({ x, z, s: 0.8 + rnd() * 0.15, street: true });
    }
  }
  // Boulevard trees along the middle roads, on the sidewalk edges.
  for (const b of blocks) {
    if (b.kind !== 'build') continue;
    for (const s of [-1, 1]) {
      const n = Math.floor(b.w / 9);
      for (let k = 1; k < n; k++) {
        if (rnd() < 0.45) continue;
        trees.push({ x: b.x - b.w / 2 + (k * b.w) / n, z: b.z + s * (b.d / 2 - 1.3), s: 0.7 + rnd() * 0.2, street: true });
      }
    }
  }

  // Spawns: farthest-point sampling over intersections and open-area points.
  const cand = [];
  for (const rx of ax.roads) for (const rz of az.roads) cand.push({ x: rx.c, z: rz.c });
  for (const p of plazas) {
    const off = p.central ? p.r * 0.55 : Math.min(p.r * 0.6, 9);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      cand.push({ x: p.x + Math.cos(a) * off, z: p.z + Math.sin(a) * off });
    }
  }
  const grid = buildGrid(obstacles, size);
  const walkable = (x, z) => isWalkable(grid, obstacles, H, x, z);
  const clear = (p, r) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (!walkable(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r)) return false;
    }
    return walkable(p.x, p.z);
  };
  const ok = cand.filter((p) => clear(p, 4));
  const first = Math.floor(rnd() * ok.length);
  spawns.push(ok[first]);
  const want = opts.spawns ?? 16;
  while (spawns.length < want) {
    let best = null, bd = -1;
    for (const p of ok) {
      let m = Infinity;
      for (const s of spawns) m = Math.min(m, Math.hypot(p.x - s.x, p.z - s.z));
      if (m > bd) { bd = m; best = p; }
    }
    if (!best || bd < 1) break;
    spawns.push(best);
  }

  return {
    seed, size, obstacles, spawns, plazas, walkable,
    pushOut: (x, z, r, out) => pushOut(grid, obstacles, H, x, z, r, out),
    blocks, buildings, trees, lamps, fountains, statues, planters, banners, crossings,
    roadsX: ax.roads, roadsZ: az.roads, blocksX: ax.blocks, blocksZ: az.blocks,
    edge: EDGE, sidewalk: SIDEWALK, outer: OUT,
  };
}

const CELL = 8;

function buildGrid(obstacles, size) {
  const n = Math.ceil((size + 64) / CELL);
  const off = (size + 64) / 2;
  const cells = Array.from({ length: n * n }, () => []);
  obstacles.forEach((o, idx) => {
    const hw = (o.type === 'rect' ? o.w / 2 : o.r) + 1.2, hd = (o.type === 'rect' ? o.d / 2 : o.r) + 1.2;
    const i0 = Math.max(0, Math.floor((o.x - hw + off) / CELL)), i1 = Math.min(n - 1, Math.floor((o.x + hw + off) / CELL));
    const j0 = Math.max(0, Math.floor((o.z - hd + off) / CELL)), j1 = Math.min(n - 1, Math.floor((o.z + hd + off) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells[j * n + i].push(idx);
  });
  return { n, off, cells };
}

function cellOf(grid, x, z) {
  const i = Math.floor((x + grid.off) / CELL), j = Math.floor((z + grid.off) / CELL);
  if (i < 0 || j < 0 || i >= grid.n || j >= grid.n) return null;
  return grid.cells[j * grid.n + i];
}

function isWalkable(grid, obs, H, x, z) {
  if (!(x > -H && x < H && z > -H && z < H)) return false;
  const c = cellOf(grid, x, z);
  if (!c) return false;
  for (let k = 0; k < c.length; k++) {
    const o = obs[c[k]];
    if (o.type === 'rect') {
      if (Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2) return false;
    } else {
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz < o.r * o.r) return false;
    }
  }
  return true;
}

function pushOut(grid, obs, H, x, z, r, out) {
  out.x = x; out.z = z; out.hit = false;
  const c = cellOf(grid, x, z);
  if (!c) return out;
  for (let k = 0; k < c.length; k++) {
    const o = obs[c[k]];
    if (o.type === 'rect') {
      const hw = o.w / 2 + r, hd = o.d / 2 + r;
      const dx = out.x - o.x, dz = out.z - o.z;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
        if (px < pz) out.x = o.x + Math.sign(dx || 1) * hw; else out.z = o.z + Math.sign(dz || 1) * hd;
        out.hit = true;
      }
    } else {
      const dx = out.x - o.x, dz = out.z - o.z, rr = o.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-3;
        out.x = o.x + (dx / d) * rr; out.z = o.z + (dz / d) * rr;
        out.hit = true;
      }
    }
  }
  return out;
}
