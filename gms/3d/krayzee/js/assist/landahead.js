// LAND assist (D13): find the best place to put the aeroplane down roughly ahead, and the path to get there.
// Three-free, runs in node. World frame: +X east, -Z north, heading 0 = north.

const DEG = Math.PI / 180, G = 9.81;
export const LAND = {
  cone: 35,            // ± degrees either side of the heading
  minD: 300, maxD: 4000,
  minLen: 350,         // shortest usable strip (threshold → stop)
  halfW: 16,           // scanned half-width: C172 span 11 m + the 8 m cell rounding of the surface cache
  glideDeg: 4,         // matches FLIGHT's approach leg (routes.js GLIDE_DEG)
  flightAim: 130,      // FLIGHT's approach aims 130 m past its threshold (routes.js AIM_DIST)
  runwayAim: 130, fieldAim: 60,
  maxGrad: 0.12, grade: 0.015, bump: 0.35,       // steepest pre-final descent the AP can fly at 75 kt with idle + 1/3 flap
  vApp: 38.6, bankDeg: 25, orbitR: 450, maxOrbits: 2,
  joinFinal: 2.6, baseFinal: 3.5, baseIn: 0.4, baseLat: 1.4,   // turn radii: final after a join / a base turn, base point

  margin: 6, treeR: 4, treeH: 11, step: 8, trim: 12, clearance: 10,
};
const RANK = { runway: 0, taxiway: 1, apron: 1, grass: 2 };
export const FAIL_TEXT = { tooHigh: 'GO LOWER', tooFast: 'SLOW DOWN', nothingAhead: 'NO FIELD AHEAD', onGround: 'ON THE GROUND', tooLow: 'CLIMB A BIT' };

const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const hvec = (h) => [Math.sin(h * DEG), -Math.cos(h * DEG)];
const brg = (x0, z0, x1, z1) => ((Math.atan2(x1 - x0, -(z1 - z0)) / DEG) + 360) % 360;
const xz = (p) => (Array.isArray(p) ? [p[0], p[2] ?? p[1]] : [p.x, p.z]);

// ---- cached obstacle / surface field per world ----
const FIELDS = new WeakMap();
const OC = 8, SC = 8, HC = 8, CB = 48;
const key = (ix, iz) => ix * 262147 + iz;
const UNK = Math.fround(1e30);

// sparse grid of 64×64-cell Float32 tiles; the last tile is remembered because scans march along lines
class Grid {
  constructor(cell, init) { this.c = cell; this.init = init; this.tiles = new Map(); this.lk = NaN; this.lt = null; }
  tile(ix, iz, make) {
    const k = (ix >> 6) * 65537 + (iz >> 6);
    if (k === this.lk) return this.lt;
    let t = this.tiles.get(k);
    if (!t) { if (!make) return null; t = new Float32Array(4096).fill(this.init); this.tiles.set(k, t); }
    this.lk = k; this.lt = t;
    return t;
  }
}

class Field {
  constructor(world) {
    this.w = world;
    this.obst = new Grid(OC, -1e9);
    this.surf = new Grid(SC, UNK);
    this.hgt = new Grid(HC, UNK);
    this.blk = new Map();
    const m = LAND.margin;
    for (const c of world.colliders || []) this._box(c.min[0] - m, c.min[2] - m, c.max[0] + m, c.max[2] + m, c.max[1]);
    const trees = world.trees || collectTrees(world);
    const r = LAND.treeR + m;
    for (const t of trees) this._box(t[0] - r, t[1] - r, t[0] + r, t[1] + r, (t[2] ?? LAND.treeH) + this.height(t[0], t[1]));
    this.treeCount = trees.length;
  }
  _box(x0, z0, x1, z1, top) {
    for (let ix = Math.floor(x0 / OC); ix <= Math.floor(x1 / OC); ix++) {
      for (let iz = Math.floor(z0 / OC); iz <= Math.floor(z1 / OC); iz++) {
        const t = this.obst.tile(ix, iz, true), i = ((iz & 63) << 6) | (ix & 63);
        if (t[i] < top) t[i] = top;
      }
    }
  }
  top(x, z) {
    const ix = Math.floor(x / OC), iz = Math.floor(z / OC), t = this.obst.tile(ix, iz, false);
    return t ? t[((iz & 63) << 6) | (ix & 63)] : -1e9;
  }
  // ground height of the 8 m cell, NaN where the surface is building/water
  ground(x, z) {
    const ix = Math.floor(x / SC), iz = Math.floor(z / SC), t = this.surf.tile(ix, iz, true), i = ((iz & 63) << 6) | (ix & 63);
    let v = t[i];
    if (v === UNK) {
      const cx = (ix + 0.5) * SC, cz = (iz + 0.5) * SC;
      const s = this.w.surfaceAt && this.dirty(cx, cz) ? this.w.surfaceAt(cx, cz) : 'grass';
      v = s === 'building' || s === 'water' ? NaN : this.height(cx, cz);
      t[i] = v;
    }
    return v;
  }
  // 48 m blocks whose corners and centre are all dry skip per-cell surfaceAt calls. Buildings come from the colliders
  // anyway; this only matters for water, and a water body narrower than ~48 m could slip through.
  dirty(x, z) {
    const bx = Math.floor(x / CB), bz = Math.floor(z / CB), k = key(bx, bz);
    let v = this.blk.get(k);
    if (v === undefined) {
      const x0 = bx * CB, z0 = bz * CB;
      v = this.wet(bx, bz) || this.wet(bx + 1, bz) || this.wet(bx, bz + 1) || this.wet(bx + 1, bz + 1) || this._wet(x0 + CB / 2, z0 + CB / 2);
      this.blk.set(k, v);
    }
    return v;
  }
  wet(cx, cz) {
    const k = key(cx, cz) + 0.5;
    let v = this.blk.get(k);
    if (v === undefined) { v = this._wet(cx * CB, cz * CB); this.blk.set(k, v); }
    return v;
  }
  _wet(x, z) { const q = this.w.surfaceAt(x, z); return q === 'water' || q === 'building'; }
  height(x, z) {
    if (!this.w.groundHeightAt) return 0;
    const ix = Math.floor(x / HC), iz = Math.floor(z / HC), t = this.hgt.tile(ix, iz, true), i = ((iz & 63) << 6) | (ix & 63);
    let v = t[i];
    if (v === UNK) v = t[i] = this.w.groundHeightAt((ix + 0.5) * HC, (iz + 0.5) * HC);
    return v;
  }
}
function field(world) {
  let f = FIELDS.get(world);
  if (!f) { f = new Field(world); FIELDS.set(world, f); }
  return f;
}
export function resetLandCache(world) { FIELDS.delete(world); }

// Tree trunks [x, z, height]: AIRPORT's planted set (world.debug.trees.data, stride x,y,z,height,...), else the older
// instanced meshes (world.root children named 'trees' / 'conifers').
export function collectTrees(world) {
  const out = [];
  const T = world.debug?.trees;
  if (T?.data && T.stride) {
    for (let i = 0, n = T.count ?? T.data.length / T.stride; i < n; i++) { const o = i * T.stride; out.push([T.data[o], T.data[o + 2], T.data[o + 3] || LAND.treeH]); }
    return out;
  }
  const root = world.root;
  if (!root || !root.children) return out;
  for (const o of root.children) {
    if (!o.isInstancedMesh || (o.name !== 'trees' && o.name !== 'conifers')) continue;
    const a = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) out.push([a[i * 16 + 12], a[i * 16 + 14], LAND.treeH]);
  }
  return out;
}

const HIST = new Float64Array(4096), WIN = 6;
// March along a line, returning clear, flat runs [s0, s1] (metres along the line from its origin).
function scanLine(F, ox, oz, ux, uz, s0, s1, out) {
  const { step, halfW } = LAND, px = -uz, pz = ux;
  const lat = [0, -halfW, halfW];
  let runS = null, last = 0, hmin = 0, hmax = 0, hs = 0, k = 0;
  for (let s = s0; s <= s1; s += step) {
    const cx = ox + ux * s, cz = oz + uz * s;
    let ok = true, h = 0;
    for (let j = 0; j < 3 && ok; j++) {
      const x = cx + px * lat[j], z = cz + pz * lat[j];
      const g = F.ground(x, z);
      if (g !== g) { ok = false; break; }
      if (j === 0) h = g;
      else if (Math.abs(g - h) > 0.8) ok = false;
      if (F.top(x, z) > -1e8) ok = false;
    }
    if (ok && runS !== null) {
      // grade ≤ 1.5 % over the whole run and over every 48 m window, plus a small bump allowance
      const back = k >= WIN ? HIST[(k - WIN) & 4095] : hs, span = k >= WIN ? WIN * step : s - runS;
      if (Math.abs(h - hs) > LAND.grade * (s - runS) + LAND.bump || Math.abs(h - back) > LAND.grade * span + LAND.bump ||
        Math.abs(h - last) > LAND.grade * step + LAND.bump) ok = false;
    }
    if (ok) {
      if (runS === null) { runS = s; hmin = hmax = hs = h; k = 0; }
      hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); last = h;
      HIST[k++ & 4095] = h;
    } else if (runS !== null) {
      out.push([runS, s - step, (hmin + hmax) / 2]);
      runS = null;
      // the blocked sample may itself start a new run (eg. a slope break), so re-test it next step
    }
    if (!ok && runS === null) last = h;
  }
  if (runS !== null) out.push([runS, s1, (hmin + hmax) / 2]);
  return out;
}

// Is the glide path into a strip starting at (sx,sz) heading u free of terrain and obstacles?
function approachClear(F, sx, sz, ux, uz, elev, aim) {
  const tg = Math.tan(LAND.glideDeg * DEG), px = -uz, pz = ux;
  for (let d = 0; d <= 1600; d += 20) {
    const h = (d + aim) * tg, gp = elev + h - Math.min(LAND.clearance, h * 0.5);
    for (const l of [0, -40, 40]) {
      const x = sx - ux * d + px * l, z = sz - uz * d + pz * l;
      if (F.top(x, z) > gp) return false;
      if (F.height(x, z) > gp) return false;
    }
  }
  return true;
}

// ---- approach path ----
// Strip frame: s along the landing direction with the touchdown point at s = 0, l lateral (+ = right of track).
function buildPath(c, st, F) {
  const { x, z, alt, H, V, agl } = st;
  const [ux, uz] = hvec(c.heading), rx = -uz, rz = ux;
  const tg = Math.tan(LAND.glideDeg * DEG);
  const T = c.touchdown, elev = c.elev;
  const toW = (s, l) => [T[0] + ux * s + rx * l, T[1] + uz * s + rz * l];
  const dx = x - T[0], dz = z - T[1];
  const sP = dx * ux + dz * uz, lP = dx * rx + dz * rz;
  const hRel = wrap180(H - c.heading);
  const r = Math.max(300, (LAND.vApp * LAND.vApp) / (G * Math.tan(LAND.bankDeg * DEG)));
  const dist = Math.hypot(dx, dz);
  // STORY tuning: a shorter final when already close (was 600–1400 m, ≈2.5 min at 1× from a few km out)
  let Lf = Math.max(Math.min(1200, Math.max(600, dist * 0.3)), LAND.flightAim + 300);
  const decel = Math.max(0, V * V - LAND.vApp * LAND.vApp) / (2 * 0.8);
  let pts = [], kind;

  if (-sP > 260 && Math.abs(lP) < 50 + 0.22 * -sP && Math.abs(hRel) < 30) {
    // straight in: FLIGHT's approach leg can take it from here; FAF wherever we are (≤ 1400 m)
    kind = 'straight';
    const fd = Math.min(-sP, Lf);
    const excess = alt - (elev + -sP * tg);
    // a high straight-in beats an orbit: the approach leg sinks at st.sink (opts.sink, m/s; a flapless type ~3) and may
    // still be 45 m high 450 m out
    const va = Math.min(V, LAND.vApp * 1.1) * 0.85;
    const budget = Math.max(0.035 * -sP + 10, (st.sink - va * tg) * Math.max(0, -sP - 450) / va + 20) - decel * 0.03;
    if (excess <= budget) return finish(c, st, [], Math.max(LAND.flightAim + 150, fd), kind, { excess, budget, orbits: 0, pathLength: -sP, required: Math.max(0, excess) }, toW, F);
  }
  // joining from the side: a straight final of at least ~2.6 turn radii after the last turn, entered from a base point
  // slightly inside the FAF (the autopilot's pursuit rounds it onto the centreline, like its own circuit's base)
  Lf = Math.max(Lf, LAND.flightAim + LAND.joinFinal * r);
  const E = [-Lf - r, 0];
  if (sP < E[0] - r * 0.5 && Math.abs(lP) < (E[0] - sP) * Math.tan(35 * DEG) && Math.abs(hRel) < 60) {
    kind = 'join';
    pts.push({ s: E[0], l: 0, kind: 'entry' });
  } else {
    kind = 'base';
    const sg = Math.abs(lP) > 30 ? Math.sign(lP) : (hRel > 0 ? -1 : 1) * (Math.sign(lP) || 1);
    Lf = Math.max(Lf, LAND.flightAim + LAND.baseFinal * r);
    const B = [-Lf + LAND.baseIn * r, sg * LAND.baseLat * r];
    if (sP > B[0] - r && Math.abs(lP) < 2 * r) pts.push({ s: Math.max(sP, B[0]) + r * 0.3, l: sg * 2 * r, kind: 'downwind' });
    else if (sP > B[0] - r) pts.push({ s: B[0], l: sg * Math.max(Math.abs(lP), 2 * r), kind: 'downwind' });
    pts.push({ s: B[0], l: B[1], kind: 'base' });
  }
  let wp = pts.map((p) => { const [wx, wz] = toW(p.s, p.l); return { x: wx, z: wz, kind: p.kind }; });
  const faf = toW(-Lf, 0);
  const fafAlt = elev + Lf * tg;
  let len = 0, px = x, pz = z;
  for (const p of wp) { len += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
  len += Math.hypot(faf[0] - px, faf[1] - pz);
  // turning costs track miles (and the pursuit cuts corners): count each heading change at radius r
  let turn = 0, hd = H, ax0 = x, az0 = z;
  for (const q of [...wp, { x: faf[0], z: faf[1] }, { x: T[0], z: T[1] }]) {
    const b = brg(ax0, az0, q.x, q.z);
    turn += Math.abs(wrap180(b - hd)); hd = b; ax0 = q.x; az0 = q.z;
  }
  const excess = alt - fafAlt;
  const required = Math.max(0, excess) / LAND.maxGrad + decel;
  let orbits = 0;
  if (required > len) orbits = Math.ceil((required - len) / (2 * Math.PI * LAND.orbitR * 0.9));
  if (orbits > LAND.maxOrbits) {
    const why = decel > Math.max(0, excess) / LAND.maxGrad ? 'tooFast' : 'tooHigh';
    return { fail: why, kind, orbits, required, pathLength: len };
  }
  if (orbits) {
    // descend in circles HERE, tangent to the current track 250 m ahead, then fly the path as planned. (An orbit at the
    // last waypoint left the pursuit autopilot cutting out of it onto a short final at the wrong heading — B2.)
    const [hx, hz] = hvec(H), W = { x: x + hx * 250, z: z + hz * 250 };
    const wl = (W.x - T[0]) * rx + (W.z - T[1]) * rz;
    const side = Math.abs(wl) > 1 ? Math.sign(wl) : Math.sign(lP) || 1;
    let ax = -hz, az = hx;                       // a = (W - centre) / R points back toward the centreline: turn away
    if ((ax * rx + az * rz) * side > 0) { ax = -ax; az = -az; }
    const R = LAND.orbitR, cx = W.x - ax * R, cz = W.z - az * R, circ = [{ x: W.x, z: W.z, kind: 'entry' }];
    for (let o = 0; o < orbits; o++) {
      for (let k = 1; k <= 6; k++) {
        const t = (k * Math.PI) / 3;
        circ.push({ x: cx + R * (Math.cos(t) * ax + Math.sin(t) * hx), z: cz + R * (Math.cos(t) * az + Math.sin(t) * hz), kind: 'orbit' });
      }
    }
    wp = [...circ, ...wp];
    len += orbits * 2 * Math.PI * R * 0.9 + 250;
  }
  return finish(c, st, wp, Lf, kind, { excess, orbits, pathLength: len, required, turn }, toW, F, fafAlt);
}

function finish(c, st, wp, Lf, kind, feas, toW, F, fafAltIn) {
  const tg = Math.tan(LAND.glideDeg * DEG);
  const elev = c.elev, fafAlt = fafAltIn ?? elev + Lf * tg;
  const faf = toW(-Lf, 0);
  // altitude targets: uniform descent from now to the FAF, never closer than 40 m to the terrain
  let tot = 0, px = st.x, pz = st.z;
  const cum = wp.map((p) => (tot += Math.hypot(p.x - px, p.z - pz), px = p.x, pz = p.z, tot));
  tot += Math.hypot(faf[0] - px, faf[1] - pz);
  const ground = (x, z) => (F.w.groundHeightAt ? F.w.groundHeightAt(x, z) : 0);
  const approach = wp.map((p, i) => {
    const a = Math.max(st.alt + (fafAlt - st.alt) * (cum[i] / (tot || 1)), ground(p.x, p.z) + 40, fafAlt);
    return { x: p.x, z: p.z, alt: a, agl: a - ground(p.x, p.z), speed: 75, flaps: 1 / 3, kind: p.kind };
  });
  approach.push({ x: faf[0], z: faf[1], alt: fafAlt, agl: fafAlt - elev, speed: 70, flaps: 1 / 3, kind: 'faf' });
  approach.push({ x: c.touchdown[0], z: c.touchdown[1], alt: elev, agl: 0, speed: 65, flaps: 1, kind: 'touchdown' });
  approach.push({ x: c.stripEnd[0], z: c.stripEnd[1], alt: elev, agl: 0, speed: 0, flaps: 1, kind: 'rollout' });
  return { kind, approach, Lf, feas };
}

// ---- candidates ----
function runwayCandidates(st, layout, inCone, push) {
  for (const rw of layout.RUNWAYS || []) {
    const [hx, hz] = hvec(rw.heading);
    let hit = false;
    for (let k = -2; k <= 2 && !hit; k++) hit = inCone(rw.center[0] + hx * rw.length * k / 5, rw.center[2] + hz * rw.length * k / 5);
    if (!hit) continue;
    const ends = rw.ends.map((id, i) => ({ id, hdg: i === 0 ? rw.heading : (rw.heading + 180) % 360 }));
    ends.sort((a, b) => Math.abs(wrap180(a.hdg - st.H)) - Math.abs(wrap180(b.hdg - st.H)));
    for (const e of ends) {
      if (e !== ends[0] && Math.abs(wrap180(e.hdg - st.H)) > Math.abs(wrap180(ends[0].hdg - st.H)) + 5) continue;
      const [ux, uz] = hvec(e.hdg);
      const thr = [rw.center[0] - ux * rw.length / 2, rw.center[2] - uz * rw.length / 2];
      push({ kind: 'runway', surface: 'runway', label: `RWY ${e.id}`, runway: e.id, heading: e.hdg, origin: thr, length: rw.length, aim: LAND.runwayAim, width: rw.width, pref: Math.abs(wrap180(e.hdg - st.H)), closed: !!rw.closed });
    }
  }
}

function pavedCandidates(st, layout, inCone, push) {
  for (const tw of layout.TAXIWAYS || []) {
    for (let i = 1; i < tw.points.length; i++) {
      const a = tw.points[i - 1], b = tw.points[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < LAND.minLen + 40) continue;
      let hit = false;
      for (let k = 0; k <= 4 && !hit; k++) hit = inCone(a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4);
      if (!hit) continue;
      const h = brg(a[0], a[1], b[0], b[1]);
      for (const [o, hd] of [[a, h], [b, (h + 180) % 360]]) {
        push({ kind: 'taxiway', surface: 'taxiway', label: `TWY ${tw.id}`, heading: hd, origin: o, length: L, aim: LAND.fieldAim, width: layout.TAXIWAY_WIDTH || 15, pref: Math.abs(wrap180(hd - st.H)) });
      }
    }
  }
  const ap = layout.APRON;
  if (ap) {
    const [cx, , cz] = ap.center, [w, d] = ap.size, long = w >= d;
    const L = long ? w : d, h = long ? 90 : 0;
    const [ux, uz] = hvec(h);
    for (const off of [-d / 4, 0, d / 4]) {
      const ox = long ? cx : cx + off, oz = long ? cz + off : cz;
      if (!inCone(ox, oz)) continue;
      const near = (layout.STANDS || []).some((s) => Math.abs((s.position[0] - ox) * -uz + (s.position[2] - oz) * ux) < 30);
      for (const hd of [h, (h + 180) % 360]) {
        const [vx, vz] = hvec(hd);
        push({ kind: 'apron', surface: 'apron', label: 'APRON', heading: hd, origin: [ox - vx * L / 2, oz - vz * L / 2], length: L, aim: LAND.fieldAim, width: 30, pref: Math.abs(wrap180(hd - st.H)) + (near ? 60 : 0) });
      }
    }
  }
}

function grassLines(st, maxD) {
  const lines = [];
  for (let b = -LAND.cone; b <= LAND.cone; b += 5) lines.push({ origin: [st.x, st.z], heading: (st.H + b + 360) % 360, off: 0, ray: true });
  const [hx, hz] = hvec(st.H), stepO = 250, wide = maxD * Math.tan(LAND.cone * DEG);
  for (let o = stepO; o < wide; o += stepO) {
    const s0 = Math.max(0, o / Math.tan(LAND.cone * DEG) - 400);
    for (const sg of [-1, 1]) lines.push({ origin: [st.x - hz * o * sg, st.z + hx * o * sg], heading: st.H, off: o, ray: false, s0 });
  }
  return lines;
}

/**
 * planLandAhead({ pos, vel, heading, altitude, world, layout, onGround?, speed?, avoid?, debug? })
 *   pos [x,y,z] | {x,y,z}; vel likewise (m/s); heading deg (0 = north); altitude m MSL (defaults to pos.y)
 *   world: { groundHeightAt, surfaceAt, colliders, trees?, root? }   layout: js/world/layout.js exports
 * → plan (see docs/ASSIST.md) or { fail: 'tooHigh'|'tooFast'|'nothingAhead'|'onGround', hint }
 */
export function planLandAhead(o) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const [x, z] = xz(o.pos);
  const y = Array.isArray(o.pos) ? o.pos[1] : o.pos.y;
  const v = o.vel ? (Array.isArray(o.vel) ? o.vel : [o.vel.x, o.vel.y, o.vel.z]) : [0, 0, 0];
  const V = o.speed ?? Math.hypot(v[0], v[2]);
  const alt = o.altitude ?? y;
  const F = field(o.world);
  const gH = o.world.groundHeightAt ? o.world.groundHeightAt(x, z) : 0;
  const agl = alt - gH;
  const H = V > 15 && Math.hypot(v[0], v[2]) > 15 ? brg(0, 0, v[0], v[2]) : o.heading;
  const dbg = o.debug ? { cone: null, lines: [], cands: [], rejects: [] } : null;
  const failOut = (fail, extra) => ({ fail, hint: FAIL_TEXT[fail] || fail, ...extra, ...(dbg ? { debug: dbg } : {}), ms: (typeof performance !== 'undefined' ? performance.now() : 0) - t0 });
  if (o.onGround || agl < 3) return failOut('onGround');
  const st = { x, z, alt, agl, H, V, sink: o.sink ?? 3 };
  const maxD = Math.max(1800, Math.min(LAND.maxD, 1500 + agl * 9 + Math.max(0, V - 40) * 20));
  const minD = LAND.minD;
  if (dbg) dbg.cone = { x, z, heading: H, half: LAND.cone, minD, maxD };
  const inCone = (px, pz) => {
    const d = Math.hypot(px - x, pz - z);
    return d >= minD && d <= maxD && Math.abs(wrap180(brg(x, z, px, pz) - H)) <= LAND.cone;
  };
  const avoid = o.avoid || [];
  const cands = [];
  const runs = [];

  // turns a candidate line into strips with a valid touchdown inside the cone
  const consider = (c) => {
    const [ux, uz] = hvec(c.heading);
    runs.length = 0;
    const sEnd = c.length ?? maxD + 900;
    scanLine(F, c.origin[0], c.origin[1], ux, uz, c.s0 ?? 0, sEnd, runs);
    if (dbg) dbg.lines.push({ origin: c.origin, heading: c.heading, s0: c.s0 ?? 0, s1: sEnd, kind: c.kind, runs: runs.map((r) => [r[0], r[1]]) });
    for (const r of runs) {
      let s0 = r[0] + (r[0] > (c.s0 ?? 0) + 1 ? LAND.trim : 0), s1 = r[1] - (r[1] < sEnd - 1 ? LAND.trim : 0);
      const aim = c.aim;
      // earliest touchdown that is inside the cone
      if (c.kind === 'grass') {
        const dx = c.origin[0] - x, dz = c.origin[1] - z;
        const along = dx * ux + dz * uz, lat = Math.abs(dx * -uz + dz * ux);
        const sMin = Math.max(minD, lat / Math.tan(LAND.cone * DEG)) - along;
        s0 = Math.max(s0, sMin - aim);
      }
      const rej = (why) => { if (dbg) dbg.rejects.push({ kind: c.kind, label: c.label, why, at: [c.origin[0] + ux * (s0 + aim), c.origin[1] + uz * (s0 + aim)], heading: c.heading }); };
      if (c.kind !== 'grass' && (s0 > 1 || s1 < c.length - 1)) {
        // paved: the touchdown must be on a clear run of the real thing
        if (s0 > aim) { rej('blocked'); continue; }
      }
      if (s1 - s0 < LAND.minLen) { rej('short'); continue; }
      const T = [c.origin[0] + ux * (s0 + aim), c.origin[1] + uz * (s0 + aim)];
      if (!inCone(T[0], T[1]) && c.kind === 'grass') { rej('cone'); continue; }
      if (Math.hypot(T[0] - x, T[1] - z) < minD) { rej('close'); continue; }
      if (c.kind !== 'runway' && avoid.some((a) => segDist(a[0], a[1], c.origin[0] + ux * s0, c.origin[1] + uz * s0, c.origin[0] + ux * s1, c.origin[1] + uz * s1) < (a[2] || 15))) { rej('traffic'); continue; }
      cands.push({ ...c, ux, uz, s0, s1, elev: r[2], touchdown: T, stripLength: s1 - s0 });
    }
  };
  // glide path clear of obstacles? Slides the threshold up to 200 m in. Only run for candidates worth building.
  const settle = (c) => {
    const { ux, uz, aim, s1 } = c;
    let s0 = c.s0, ok = false;
    for (let tries = 0; tries < 6 && s1 - s0 >= LAND.minLen; tries++, s0 += 40) {
      if (approachClear(F, c.origin[0] + ux * s0, c.origin[1] + uz * s0, ux, uz, F.height(c.origin[0] + ux * (s0 + aim), c.origin[1] + uz * (s0 + aim)), aim)) { ok = true; break; }
    }
    if (!ok) return false;
    c.touchdown = [c.origin[0] + ux * (s0 + aim), c.origin[1] + uz * (s0 + aim)];
    c.start = [c.origin[0] + ux * s0, c.origin[1] + uz * s0];
    c.stripEnd = [c.origin[0] + ux * s1, c.origin[1] + uz * s1];
    c.stripLength = s1 - s0; c.rollout = s1 - s0 - aim;
    c.elev = F.height(c.touchdown[0], c.touchdown[1]);
    if (c.kind === 'grass') c.surface = o.world.surfaceAt ? o.world.surfaceAt(c.touchdown[0], c.touchdown[1]) : 'grass';
    return true;
  };

  const pre = (c) => Math.hypot(c.touchdown[0] - x, c.touchdown[1] - z) * 0.2 + c.pref * 12 - Math.min(c.stripLength, 900) * (c.kind === 'grass' ? 0.8 : 0.1);
  let best = null, bestCost = Infinity;
  const fails = { tooHigh: 0, tooFast: 0 };
  // build paths for the best few in each rank; a lower rank is only searched when nothing better worked
  const choose = () => {
    const rk = (c) => RANK[c.kind] + (c.closed ? 1 : 0);   // a closed runway only when no open one works
    cands.sort((a, b) => rk(a) - rk(b) || pre(a) - pre(b));
    const perRank = {};
    for (const c of cands) {
      const rank = rk(c);
      if (best && rank > rk(best.c)) break;
      perRank[rank] = (perRank[rank] || 0) + 1;
      if (perRank[rank] > 14) continue;
      if (!settle(c)) { perRank[rank]--; if (dbg) dbg.rejects.push({ kind: c.kind, label: c.label, why: 'approach', at: c.touchdown, heading: c.heading }); continue; }
      const p = buildPath(c, st, F);
      if (p.fail) { fails[p.fail]++; if (dbg) dbg.rejects.push({ kind: c.kind, label: c.label, why: p.fail, at: c.touchdown, heading: c.heading }); continue; }
      const cost = p.feas.pathLength + (p.feas.turn || 0) * 4 + p.feas.orbits * 900 + c.pref * 25 - Math.min(c.stripLength, 900) * (c.kind === 'grass' ? 1 : 0.2);
      if (dbg) dbg.cands.push({ kind: c.kind, label: c.label, touchdown: c.touchdown, start: c.start, end: c.stripEnd, cost: Math.round(cost) });
      if (cost < bestCost) { bestCost = cost; best = { c, p }; }
    }
  };
  const raw = [];
  runwayCandidates(st, o.layout, inCone, (c) => raw.push(c));
  pavedCandidates(st, o.layout, inCone, (c) => raw.push(c));
  for (const c of raw) consider(c);
  choose();
  if (!best) {
    cands.length = 0;
    for (const l of grassLines(st, maxD)) {
      consider({ kind: 'grass', surface: 'grass', label: 'FIELD', heading: l.heading, origin: l.origin, s0: l.ray ? minD - 200 : l.s0, length: maxD + 700, aim: LAND.fieldAim, width: 20, pref: Math.abs(wrap180(l.heading - H)) });
    }
    choose();
  }
  if (!best) {
    if (fails.tooHigh || fails.tooFast) return failOut(fails.tooFast > fails.tooHigh ? 'tooFast' : 'tooHigh', { candidates: cands.length });
    return failOut('nothingAhead', { candidates: cands.length });
  }
  return makePlan(best.c, best.p, st, dbg, t0);
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function makePlan(c, p, st, dbg, t0) {
  const [ux, uz] = hvec(c.heading);
  const A = LAND.flightAim;
  // FLIGHT's approach leg wants a runway-end-shaped object; its "threshold" is 130 m before our touchdown point
  const thr = [c.touchdown[0] - ux * A, c.touchdown[1] - uz * A];
  const end = {
    id: c.runway || 'LAND', virtual: !c.runway, label: c.label, hdg: c.heading, u: [ux, uz], thr, far: c.stripEnd,
    len: Math.hypot(c.stripEnd[0] - thr[0], c.stripEnd[1] - thr[1]), width: c.width, elev: c.elev,
  };
  const fly = p.approach.filter((w) => w.kind !== 'faf' && w.kind !== 'touchdown' && w.kind !== 'rollout');
  const legs = fly.map((w) => ({ kind: 'fly', to: [w.x, w.alt, w.z], speed: w.speed, flaps: w.flaps, clearance: LAND.clearance + 25, label: w.kind === 'orbit' ? 'LAND · DESCEND' : 'LAND · JOIN' }));
  legs.push({ kind: 'approach', end: c.runway || end, fafDist: Math.round(p.Lf - A), label: 'LAND', land: true });
  const off = Math.round(Math.abs(wrap180(c.heading - st.H)));
  const why = c.kind === 'runway' ? `runway ${c.runway} ahead` : c.kind === 'grass' ? `${Math.round(c.stripLength)} m clear ${c.surface === 'grass' ? 'field' : c.surface}` : `${c.label.toLowerCase()} ahead`;
  const plan = {
    touchdown: c.touchdown, heading: c.heading, rolloutLength: Math.round(c.rollout), stripLength: Math.round(c.stripLength),
    surface: c.surface, kind: c.kind, label: c.label, runway: c.runway || null, elev: c.elev,
    strip: { start: c.start, end: c.stripEnd, width: c.width },
    approach: p.approach, pattern: p.kind,
    end, route: { name: 'land', legs, loop: null },
    feasibility: { orbits: p.feas.orbits, pathLength: Math.round(p.feas.pathLength), required: Math.round(p.feas.required || 0), excess: Math.round(p.feas.excess) },
    distance: Math.round(Math.hypot(c.touchdown[0] - st.x, c.touchdown[1] - st.z)),
    reason: `${why}${off > 5 ? `, ${off}° turn` : ''}${p.feas.orbits ? `, ${p.feas.orbits} descending orbit${p.feas.orbits > 1 ? 's' : ''}` : ''}`,
  };
  if (dbg) plan.debug = dbg;
  plan.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return plan;
}

export { createLandButton } from './landbutton.js';
