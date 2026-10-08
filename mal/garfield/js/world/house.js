import * as THREE from '../../vendor/three/three.module.js';
import { Builder, frameAt } from './houseBuild.js';

// Layout constants (metres). Interior ground floor x 0..W, z 0..D; front wall z=0, street toward -z.
export const W = 9.2, D = 11, T = 0.2, CEIL1 = 2.7, UF = 3.0, CEIL2 = 5.6;
const STEPS = 14, RISE = UF / STEPS, RUN = 0.27, ST_X0 = 8.1, ST_X1 = W, ST_Z0 = 0.9, ST_Z1 = ST_Z0 + STEPS * RUN;
export const STAIRS = { x0: ST_X0, x1: ST_X1, z0: ST_Z0, z1: ST_Z1, steps: STEPS, rise: RISE, run: RUN };
// Lyman's door (landing → his room) and the under-stair cupboard (steps CUP_S0..CUP_S1 are hollow underneath)
const LY_DOOR = [7.75, 8.6];
export const CUPBOARD = { x0: ST_X0 + 0.04, x1: ST_X1, s0: 5, s1: 13, door: [2.55, 3.2], doorH: 1.25, slab: 0.22 };

export const ROOMS = [
  { id: 'living', x0: 0, x1: W, z0: 0, z1: 5.4, y0: 0, y1: CEIL1 },
  { id: 'kitchen', x0: 0, x1: W, z0: 5.6, z1: D, y0: 0, y1: CEIL1 },
  { id: 'bedroom', x0: 0, x1: 6.3, z0: 0, z1: 6.9, y0: UF, y1: CEIL2 },
  { id: 'landing', x0: 6.5, x1: W, z0: 0, z1: 6.9, y0: UF, y1: CEIL2 },
  { id: 'lyman', x0: 0, x1: W, z0: 7.1, z1: D, y0: UF, y1: CEIL2 },
];

function roomAt(p) {
  for (const r of ROOMS) if (p.x > r.x0 - 0.06 && p.x < r.x1 + 0.06 && p.z > r.z0 - 0.06 && p.z < r.z1 + 0.06 && p.y > r.y0 - 0.06 && p.y < r.y1 + 0.06) return r;
  return null;
}

// Cheap baked ambient occlusion: darken toward every room plane the point is not lying on.
export function roomAO(p, n) {
  const r = roomAt(p);
  if (!r) return 1;
  let a = 1;
  const plane = (d, k = 0.32, s = 0.38) => { if (d > 0.025) a *= 1 - k * Math.exp(-d / s); };
  plane(p.y - r.y0, n.y > 0.5 ? 0 : 0.42, 0.3);
  plane(r.y1 - p.y, 0.22, 0.45);
  plane(p.x - r.x0); plane(r.x1 - p.x); plane(p.z - r.z0); plane(r.z1 - p.z);
  return Math.max(0.42, a);
}

const C = {
  trim: 0xfbf3e2, ceiling: 0xfff6e8, door: 0xf3e6cc,
  sofa: 0xe2a65a, sofaCushion: 0xecb96c, lounge: 0x5f8f86, loungeDark: 0x4b746d,
  darkWood: 0x8a5a36, midWood: 0xb98256, lightWood: 0xd8a877,
  cabinet: 0xb87a46, cabinetDoor: 0xc98a52, cabinetPanel: 0xd39860, counter: 0xe9dfcd, brass: 0xd9a54a, steel: 0xc9ccd0,
};

export function buildHouse({ quality = 'high' } = {}) {
  const b = new Builder(roomAO);
  const ext = new Builder(() => 1);
  const colliders = [];
  const anchors = new Map();
  const lamps = [], halos = [];
  const camBlockers = [];
  let cid = 0;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const col = (id, x0, y0, z0, x1, y1, z1, kind = 'solid', extra = {}) => {
    const c = { id: id || `h${cid++}`, min: V(x0, y0, z0), max: V(x1, y1, z1), kind, enabled: true, ...extra };
    colliders.push(c);
    return c;
  };
  const anchor = (name, x, y, z, rotY = 0, extra = {}) => anchors.set(name, { pos: V(x, y, z), rotY, ...extra });
  const hi = quality === 'high';

  // ---------- walls ----------
  const sideStyle = {
    living: { lower: 'wainscot', upper: 'wallpaperLiving', rail: 0.95, color: 0xffffff },
    kitchen: { upper: 'kitchenWall', color: 0xffffff },
    bedroom: { upper: 'bedroomWall', color: 0xffffff },
    landing: { lower: 'wainscot', upper: 'paint', rail: 0.95, color: 0xf3dcb4 },
    // upper half of the stairwell wall: the living-room wallpaper carries on up, no skirting/rail bands
    stairwell: { upper: 'wallpaperLiving', color: 0xffffff, noSkirt: true },
    lyman: { upper: 'paint', color: 0xf3dcb2 },
  };

  // axis 'x': wall runs along x, plane at z in [c0,c1]. axis 'z': runs along z, plane at x in [c0,c1].
  function wall(w) {
    const { axis, a0, a1, c0, c1, y0, y1, holes = [], idPrefix } = w;
    let wk = 0;
    const wid = () => idPrefix ? idPrefix + wk++ : null;
    const P = (u, v, c) => axis === 'x' ? V(u, v, c) : V(c, v, u);
    for (const [side, c, sgn] of [['neg', c0, -1], ['pos', c1, 1]]) {
      const s0 = w[side];
      if (!s0) continue;
      const normal = axis === 'x' ? V(0, 0, sgn) : V(sgn, 0, 0);
      const hs = holes.map(h => ({ u0: h.a0, u1: h.a1, v0: h.y0, v1: h.y1 }));
      if (s0 === 'ext') {
        ext.layer = 'exterior';
        ext.grid('siding', a0, a1, y0, y1, hs, (u, v) => P(u, v, c), normal, w.extColor || 0xf2e2bc, { step: 3, receive: true });
        continue;
      }
      for (const e of (Array.isArray(s0) ? s0 : [{ s: s0, a0, a1 }])) {
        const st = sideStyle[e.s];
        const fy = w.floorY ?? y0;
        const split = st.lower ? fy + st.rail : null;
        const cl = (lo, hi2) => hs.filter(h => h.v1 > lo && h.v0 < hi2);
        b.layer = fy > 1 ? 'upperShell' : 'groundShell';
        if (split) {
          b.grid(st.lower, e.a0, e.a1, y0, split, cl(y0, split), (u, v) => P(u, v, c), normal, 0xffffff, { step: 0.3 });
          b.grid(st.upper, e.a0, e.a1, split, y1, cl(split, y1), (u, v) => P(u, v, c), normal, st.color, { step: 0.3 });
        } else b.grid(st.upper, e.a0, e.a1, y0, y1, hs, (u, v) => P(u, v, c), normal, st.color, { step: 0.3 });
        const ceilY = fy > 1 ? CEIL2 : CEIL1;
        const strips = [];
        if (!st.noSkirt) strips.push([fy, fy + 0.12, 0.022]);
        if (!e.noCrown) strips.push([ceilY - 0.09, ceilY, 0.045], [ceilY - 0.12, ceilY - 0.09, 0.02]);
        if (split) strips.push([split - 0.03, split + 0.03, 0.03]);
        for (const [sy0, sy1, depth] of strips) {
          let segs = [[e.a0, e.a1]];
          for (const h of holes) if (h.y0 < sy1 && h.y1 > sy0) {
            segs = segs.flatMap(([p, q]) => (h.a1 <= p || h.a0 >= q) ? [[p, q]] : [[p, h.a0], [h.a1, q]].filter(([x, y]) => y - x > 0.02));
          }
          for (const [p, q] of segs) {
            const cc = c + sgn * depth / 2;
            if (axis === 'x') b.box('paint', p, sy0, cc - depth / 2, q, sy1, cc + depth / 2, C.trim, { cast: false });
            else b.box('paint', cc - depth / 2, sy0, p, cc + depth / 2, sy1, q, C.trim, { cast: false });
          }
        }
      }
    }
    // reveals + casings for holes
    for (const h of holes) {
      b.layer = y0 > 1 ? 'upperShell' : 'groundShell';
      const th = c1 - c0, cw = 0.08, cd = 0.025;
      const box = (u0, v0, u1, v1, cA, cB, color = C.trim, mat = 'paint') => axis === 'x'
        ? b.box(mat, u0, v0, cA, u1, v1, cB, color, { cast: false })
        : b.box(mat, cA, v0, u0, cB, v1, u1, color, { cast: false });
      if (h.kind === 'arch') {
        box(h.a0 - cw, h.y0, h.a0, h.y1 + cw, c0 - cd, c1 + cd);
        box(h.a1, h.y0, h.a1 + cw, h.y1 + cw, c0 - cd, c1 + cd);
        box(h.a0 - cw, h.y1, h.a1 + cw, h.y1 + cw, c0 - cd, c1 + cd);
        box(h.a0, h.y0, h.a0 + 0.001, h.y1, c0, c1);
        continue;
      }
      if (h.kind === 'door') {
        box(h.a0 - cw, h.y0, h.a0, h.y1 + cw, c0 - cd, c1 + cd);
        box(h.a1, h.y0, h.a1 + cw, h.y1 + cw, c0 - cd, c1 + cd);
        box(h.a0 - cw, h.y1, h.a1 + cw, h.y1 + cw, c0 - cd, c1 + cd);
        box(h.a0, h.y0, h.a0 + 0.02, h.y1, c0, c1);
        box(h.a1 - 0.02, h.y0, h.a1, h.y1, c0, c1);
        box(h.a0, h.y1 - 0.02, h.a1, h.y1, c0, c1);
      } else {
        // window: reveal lining, casing on interior side(s), outside sill
        box(h.a0, h.y0, h.a0 + 0.02, h.y1, c0, c1);
        box(h.a1 - 0.02, h.y0, h.a1, h.y1, c0, c1);
        box(h.a0, h.y1 - 0.02, h.a1, h.y1, c0, c1);
        if (!h.deepSill) box(h.a0 - 0.04, h.y0 - 0.03, h.a1 + 0.04, h.y0, c0 - 0.06, c1 + 0.06, C.trim, 'gloss');
        const inner = w.innerSide === 'neg' ? [c0 - cd, c0] : [c1, c1 + cd];
        box(h.a0 - cw, h.y0, h.a0, h.y1 + cw, ...inner);
        box(h.a1, h.y0, h.a1 + cw, h.y1 + cw, ...inner);
        box(h.a0 - cw, h.y1, h.a1 + cw, h.y1 + cw, ...inner);
        if (!h.propWindow) windowSash(axis, h, (c0 + c1) / 2);
      }
    }
    // colliders: split around holes
    const brk = [...new Set([a0, a1, ...holes.flatMap(h => [h.a0, h.a1])])].filter(x => x >= a0 && x <= a1).sort((p, q) => p - q);
    for (let i = 0; i < brk.length - 1; i++) {
      const p = brk[i], q = brk[i + 1];
      const cover = holes.filter(h => h.a0 <= p + 1e-6 && h.a1 >= q - 1e-6).sort((m, n) => m.y0 - n.y0);
      let y = y0;
      const segs = [];
      for (const h of cover) { if (h.y0 > y) segs.push([y, h.y0]); y = Math.max(y, h.y1); }
      if (y < y1) segs.push([y, y1]);
      for (const [s0, s1] of segs) {
        if (axis === 'x') col(wid(), p, s0, c0, q, s1, c1, 'solid', { wall: true });
        else col(wid(), c0, s0, p, c1, s1, q, 'solid', { wall: true });
      }
      for (const h of cover) if (h.block) {
        const blk = axis === 'x' ? col(h.block, p, h.y0, c0, q, h.y1, c1) : col(h.block, c0, h.y0, p, c1, h.y1, q);
        blk.wall = true;
      }
    }
  }

  function windowSash(axis, h, c) {
    const fr = 0.05, depth = 0.06;
    const box = (u0, v0, u1, v1, mat = 'gloss', color = C.trim, dd = depth) => axis === 'x'
      ? b.box(mat, u0, v0, c - dd / 2, u1, v1, c + dd / 2, color, { cast: false })
      : b.box(mat, c - dd / 2, v0, u0, c + dd / 2, v1, u1, color, { cast: false });
    box(h.a0, h.y0, h.a0 + fr, h.y1); box(h.a1 - fr, h.y0, h.a1, h.y1);
    box(h.a0, h.y0, h.a1, h.y0 + fr); box(h.a0, h.y1 - fr, h.a1, h.y1);
    const mu = (h.a0 + h.a1) / 2, mv = (h.y0 + h.y1) / 2;
    box(mu - 0.02, h.y0, mu + 0.02, h.y1); box(h.a0, mv - 0.02, h.a1, mv + 0.02);
    box(h.a0, h.y0, h.a1, h.y1, 'windowGlass', 0xffffff, 0.01);
  }

  // Ground floor exterior walls run 0..UF so the stairwell has no gap; upper ones UF..CEIL2+T.
  const winGF = { a0: 2.4, a1: 3.6, y0: 0.9, y1: 2.1, block: 'windowBlock', propWindow: true, deepSill: true };
  const frontDoorHole = { a0: 6.65, a1: 7.55, y0: 0, y1: 2.05, kind: 'door', block: 'frontDoorBlock' };
  wall({ axis: 'x', a0: -T, a1: W + T, c0: -T, c1: 0, y0: 0, y1: UF, holes: [winGF, frontDoorHole, { a0: 0.7, a1: 1.5, y0: 1.0, y1: 2.1, block: 'w' + cid++ }], neg: 'ext', pos: 'living', innerSide: 'pos' });
  wall({ axis: 'x', a0: -T, a1: W + T, c0: D, c1: D + T, y0: 0, y1: UF, holes: [{ a0: 1.8, a1: 3.0, y0: 1.3, y1: 2.2, block: 'w' + cid++ }], neg: 'kitchen', pos: 'ext', innerSide: 'neg' });
  wall({ axis: 'z', a0: 0, a1: D, c0: -T, c1: 0, y0: 0, y1: UF, holes: [{ a0: 6.6, a1: 7.6, y0: 1.0, y1: 2.1, block: 'w' + cid++ }], neg: 'ext', pos: [{ s: 'living', a0: 0, a1: 5.5 }, { s: 'kitchen', a0: 5.5, a1: D }], innerSide: 'pos' });
  wall({ axis: 'z', a0: 0, a1: D, c0: W, c1: W + T, y0: 0, y1: UF, holes: [{ a0: 7.3, a1: 8.5, y0: 1.0, y1: 2.1, block: 'w' + cid++ }], neg: [{ s: 'living', a0: 0, a1: ST_Z0 }, { s: 'living', a0: ST_Z0, a1: ST_Z1, noCrown: true }, { s: 'living', a0: ST_Z1, a1: 5.5 }, { s: 'kitchen', a0: 5.5, a1: D }], pos: 'ext', innerSide: 'neg' });
  // living/kitchen partition: archway + doorway
  wall({ axis: 'x', a0: 0, a1: W, c0: 5.4, c1: 5.6, y0: 0, y1: CEIL1, holes: [{ a0: 1.5, a1: 4.5, y0: 0, y1: 2.3, kind: 'arch' }, { a0: 6.4, a1: 7.4, y0: 0, y1: 2.1, kind: 'door' }], neg: 'living', pos: 'kitchen' });
  // upper floor
  wall({ axis: 'x', a0: -T, a1: W + T, c0: -T, c1: 0, y0: UF, y1: CEIL2 + T, floorY: UF, holes: [{ a0: 2.4, a1: 3.6, y0: UF + 0.9, y1: UF + 2.0, block: 'w' + cid++ }, { a0: 6.9, a1: 7.8, y0: UF + 0.9, y1: UF + 2.0, block: 'w' + cid++ }], neg: 'ext', pos: [{ s: 'bedroom', a0: -T, a1: 6.4 }, { s: 'landing', a0: 6.4, a1: W + T }], innerSide: 'pos' });
  wall({ axis: 'x', a0: -T, a1: W + T, c0: D, c1: D + T, y0: UF, y1: CEIL2 + T, floorY: UF, holes: [{ a0: 3.0, a1: 3.8, y0: UF + 1.1, y1: UF + 2.0, block: 'w' + cid++ }], neg: 'lyman', pos: 'ext', innerSide: 'neg' });
  wall({ axis: 'z', a0: 0, a1: D, c0: -T, c1: 0, y0: UF, y1: CEIL2 + T, floorY: UF, holes: [{ a0: 3.9, a1: 4.9, y0: UF + 0.9, y1: UF + 2.0, block: 'w' + cid++ }], neg: 'ext', pos: [{ s: 'bedroom', a0: 0, a1: 6.9 }, { s: 'lyman', a0: 6.9, a1: D }], innerSide: 'pos' });
  wall({ axis: 'z', a0: 0, a1: D, c0: W, c1: W + T, y0: UF, y1: CEIL2 + T, floorY: UF, holes: [], neg: [{ s: 'landing', a0: 0, a1: ST_Z0 }, { s: 'stairwell', a0: ST_Z0, a1: ST_Z1 }, { s: 'landing', a0: ST_Z1, a1: 6.9 }, { s: 'lyman', a0: 6.9, a1: D }], pos: 'ext' });
  wall({ axis: 'z', a0: 0, a1: 6.9, c0: 6.3, c1: 6.5, y0: UF, y1: CEIL2, floorY: UF, holes: [{ a0: 5.25, a1: 6.15, y0: UF, y1: UF + 2.05, kind: 'door' }], neg: 'bedroom', pos: 'landing' });
  wall({ axis: 'x', a0: 0, a1: W, c0: 6.9, c1: 7.1, y0: UF, y1: CEIL2, floorY: UF, holes: [{ a0: LY_DOOR[0], a1: LY_DOOR[1], y0: UF, y1: UF + 2.05, kind: 'door' }], neg: [{ s: 'bedroom', a0: 0, a1: 6.4 }, { s: 'landing', a0: 6.4, a1: W }], pos: 'lyman', idPrefix: 'lymanWall' });
  cid++;
  // ---------- floors, ceilings, slab ----------
  const up = V(0, 1, 0), down = V(0, -1, 0);
  const XZ = (y) => (u, v) => V(u, y, v);
  b.layer = 'groundShell';
  b.grid('woodFloor', 0, W, 0, 5.4, [], XZ(0), up, 0xffffff, { step: 0.4, receive: true });
  b.grid('woodFloor', 1.5, 4.5, 5.4, 5.6, [], XZ(0), up, 0xffffff, { step: 0.4 });
  b.grid('woodFloor', 6.4, 7.4, 5.4, 5.6, [], XZ(0), up, 0xffffff, { step: 0.4 });
  b.grid('checker', 0, W, 5.6, D, [], XZ(0), up, 0xffffff, { step: 0.4 });
  const hole = [{ u0: ST_X0, u1: ST_X1, v0: ST_Z0, v1: ST_Z1 }];
  b.grid('ceiling', 0, W, 0, D, hole, XZ(CEIL1), down, C.ceiling, { step: 0.5 });
  col('floorGF', -T, -0.3, -T, W + T, 0, D + T, 'solid', { floor: true });
  b.layer = 'upperShell';
  b.grid('woodFloor', 0, 6.3, 0, 6.9, [], XZ(UF), up, 0xd2bca8, { step: 0.4 });
  b.grid('woodFloor', 6.3, 6.5, 5.25, 6.15, [], XZ(UF), up, 0xd2bca8, { step: 0.4 });
  b.grid('woodFloor', 6.5, W, 0, 6.9, hole, XZ(UF), up, 0xffffff, { step: 0.4 });
  b.grid('woodFloor', 0, W, 7.1, D, [], XZ(UF), up, 0xd8cfc0, { step: 0.8 });
  b.grid('ceiling', 0, W, 0, D, [], XZ(CEIL2), down, C.ceiling, { step: 0.5 });
  // slab pieces around the stairwell
  col('floorUF_a', -T, CEIL1, -T, ST_X0, UF, D + T, 'solid', { floor: true });
  col('floorUF_b', ST_X0, CEIL1, ST_Z1, W + T, UF, D + T, 'solid', { floor: true });
  col('floorUF_c', ST_X0, CEIL1, -T, W + T, UF, ST_Z0, 'solid', { floor: true });
  col('ceilUF', -T, CEIL2, -T, W + T, CEIL2 + 0.3, D + T, 'solid');
  // stairwell slab edge fascia
  b.box('paint', ST_X0 - 0.02, CEIL1, ST_Z0, ST_X0, UF, ST_Z1, C.trim, { cast: false });
  b.box('paint', ST_X0, CEIL1, ST_Z0 - 0.02, ST_X1, UF, ST_Z0, C.trim, { cast: false });
  b.box('paint', ST_X0, CEIL1, ST_Z1, ST_X1, UF, ST_Z1 + 0.02, C.trim, { cast: false });

  // ---------- stairs ----------
  b.layer = 'groundShell';
  for (let i = 1; i <= STEPS; i++) {
    const z0 = ST_Z0 + (i - 1) * RUN, z1 = z0 + RUN, y = i * RISE;
    b.box('woodGloss', ST_X0, y - 0.04, z0 - 0.025, ST_X1, y, z1, C.midWood, { cast: false });
    b.box('fabric', ST_X0 + 0.25, y, z0 - 0.03, ST_X1 - 0.25, y + 0.008, z1 - 0.02, 0x9a3a32, { cast: false });
    b.box('fabric', ST_X0 + 0.25, (i - 1) * RISE + 0.02, z0 - 0.002, ST_X1 - 0.25, y - 0.04, z0 + 0.006, 0x9a3a32, { cast: false });
    b.box('paint', ST_X0 + 0.01, (i - 1) * RISE, z0, ST_X1, y - 0.04, z0 + 0.02, C.trim, { cast: false });
    const hollow = i >= CUPBOARD.s0 && i <= CUPBOARD.s1, under = y - CUPBOARD.slab;
    if (hollow) {
      // cupboard side wall with the door hole cut out; stepped ceiling inside
      const [d0, d1] = CUPBOARD.door, dh = CUPBOARD.doorH;
      for (const [a, c] of [[z0, Math.min(z1, d0)], [Math.max(z0, d1), z1]]) if (c > a) b.box('paint', ST_X0, 0, a, ST_X0 + 0.01, y - 0.04, c, C.trim, { cast: false });
      if (z1 > d0 && z0 < d1) b.box('paint', ST_X0, dh, Math.max(z0, d0), ST_X0 + 0.01, y - 0.04, Math.min(z1, d1), C.trim, { cast: false });
      b.box('paint', ST_X0 + 0.01, under, z0, ST_X1, under + 0.02, z1, 0xe8dcc4, { cast: false });
    } else b.box('paint', ST_X0, 0, z0, ST_X0 + 0.01, y - 0.04, z1, C.trim, { cast: false });
    col(`stair${i}`, ST_X0, hollow ? under : 0, z0, ST_X1, y, i === STEPS ? ST_Z1 + 0.02 : z1, 'solid', { stairs: true });
  }
  // stringer + banister
  const railH = 0.9;
  for (let i = 1; i <= STEPS; i++) {
    const z = ST_Z0 + (i - 0.5) * RUN, y = i * RISE;
    b.cyl('paint', null, ST_X0 + 0.06, y + railH / 2, z, 0.018, 0.018, railH, C.trim, { radial: 6, cast: true });
  }
  {
    const len = Math.hypot(STEPS * RUN, UF), ang = Math.atan2(UF, STEPS * RUN);
    const m = new THREE.Matrix4().makeTranslation(ST_X0 + 0.06, UF / 2 + railH + 0.02, (ST_Z0 + ST_Z1) / 2).multiply(new THREE.Matrix4().makeRotationX(-ang));
    b.box('woodGloss', -0.035, -0.03, -len / 2 - 0.1, 0.035, 0.03, len / 2 + 0.05, C.darkWood, { matrix: m, r: 0.02, cast: true });
    b.box('woodGloss', ST_X0 + 0.0, 0, ST_Z0 - 0.06, ST_X0 + 0.12, railH + 0.3, ST_Z0 + 0.06, C.darkWood, { r: 0.02 });
    b.sphere('woodGloss', null, ST_X0 + 0.06, railH + 0.36, ST_Z0, 0.06, C.darkWood);
    col('newel', ST_X0, 0, ST_Z0 - 0.06, ST_X0 + 0.12, railH + 0.3, ST_Z0 + 0.06);
  }
  // under-stair cupboard (door is the cupboardDoor prop): casing, end walls, shelf + clutter
  {
    const { door: [z0, z1], doorH: h, s0, s1 } = CUPBOARD, x = ST_X0 - 0.012;
    b.box('paint', x - 0.03, 0, z0 - 0.06, x, h + 0.06, z0, C.trim, { cast: false });
    b.box('paint', x - 0.03, 0, z1, x, h + 0.06, z1 + 0.06, C.trim, { cast: false });
    b.box('paint', x - 0.03, h, z0 - 0.06, x, h + 0.06, z1 + 0.06, C.trim, { cast: false });
    const zA = ST_Z0 + (s0 - 1) * RUN, zB = ST_Z0 + s1 * RUN;
    b.box('paint', ST_X0 + 0.01, 0, zA - 0.01, ST_X1, (s0 - 1) * RISE, zA, 0xe8dcc4, { cast: false });
    b.box('paint', ST_X0 + 0.01, 0, zB, ST_X1, s1 * RISE, zB + 0.01, 0xe8dcc4, { cast: false });
    b.box('fabric', ST_X0 + 0.1, 0, zA + 0.1, ST_X1 - 0.1, 0.008, zB - 0.15, 0x7a6a58, { r: 0.004, cast: false });
    // high shelf along the back wall + mop, bucket, boxes
    b.box('woodGloss', ST_X1 - 0.3, 0.95, zB - 1.3, ST_X1, 0.98, zB - 0.05, C.midWood, { r: 0.006 });
    b.box('paint', ST_X1 - 0.28, 0.98, zB - 0.6, ST_X1 - 0.04, 1.2, zB - 0.12, 0xc9a271, { r: 0.01 });
    b.cyl('paint', null, ST_X1 - 0.2, 0.15, zB - 0.25, 0.13, 0.11, 0.3, 0x4f88b8, { radial: 14 });
    b.cyl('wood', null, ST_X1 - 0.12, 0.8, zB - 0.5, 0.012, 0.012, 1.5, C.lightWood, { radial: 6, rot: [0.15, 0, -0.12] });
    b.box('paint', ST_X1 - 0.5, 0, zB - 0.42, ST_X1 - 0.1, 0.32, zB - 0.02, 0xb98a5a, { r: 0.01 });
    col('cupBox', ST_X1 - 0.5, 0, zB - 0.42, ST_X1 - 0.08, 0.32, zB);
    // side wall colliders (the door hole stays open; cupboardDoor's blocker closes it)
    for (let i = s0, k = 0; i <= s1; i++) {
      const a = ST_Z0 + (i - 1) * RUN, c = a + RUN, top = i * RISE - CUPBOARD.slab + 0.01;
      for (const [p0, p1] of [[a, Math.min(c, z0)], [Math.max(a, z1), c]]) if (p1 > p0) col('cupWall' + k++, ST_X0 - 0.02, 0, p0, ST_X0 + 0.04, top, p1, 'solid', { wall: true });
      if (c > z0 && a < z1) col('cupWall' + k++, ST_X0 - 0.02, h, Math.max(a, z0), ST_X0 + 0.04, top, Math.min(c, z1), 'solid', { wall: true });
    }
    anchor('cupboardDoor', ST_X0 - 0.01, 0, (z0 + z1) / 2, -Math.PI / 2, { w: z1 - z0, h });
    anchor('cupboardFront', ST_X0 - 0.55, 0, (z0 + z1) / 2, Math.PI / 2);
    anchor('cupboardInside', (ST_X0 + ST_X1) / 2 + 0.05, 0, (z0 + z1) / 2 + 0.25, 0);
    anchor('biscuitBox', (ST_X0 + ST_X1) / 2 + 0.15, 0, zA + 0.55, 0);
  }
  // upstairs railing around the stairwell
  b.layer = 'upperShell';
  {
    const rail = (x0, z0, x1, z1) => {
      b.box('woodGloss', x0 - 0.035, UF + railH - 0.03, z0 - 0.035, x1 + 0.035, UF + railH + 0.03, z1 + 0.035, C.darkWood, { r: 0.015 });
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.14);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        b.cyl('paint', null, x0 + (x1 - x0) * t, UF + railH / 2, z0 + (z1 - z0) * t, 0.016, 0.016, railH, C.trim, { radial: 6 });
      }
    };
    rail(ST_X0 - 0.04, ST_Z0, ST_X0 - 0.04, ST_Z1);
    rail(ST_X0, ST_Z0 - 0.04, ST_X1, ST_Z0 - 0.04);
    col('railA', ST_X0 - 0.08, UF, ST_Z0 - 0.08, ST_X0, UF + railH + 0.03, ST_Z1);
    col('railB', ST_X0, UF, ST_Z0 - 0.08, ST_X1, UF + railH + 0.03, ST_Z0);
  }
  anchor('stairsBottom', 8.65, 0, 0.45, 0);
  anchor('stairsTop', 8.65, UF, ST_Z1 + 0.35, 0);
  anchor('landing', 7.2, UF, 5.7, Math.PI / 2);
  anchor('bedroomInside', 5.6, UF, 5.7, -Math.PI / 2);

  // ---------- living room ----------
  b.layer = 'ground';
  // deep window seat / sill under the front window
  {
    const x0 = 2.2, x1 = 3.8, d = 0.48, top = 0.9;
    b.box('woodGloss', x0 - 0.03, top - 0.05, 0, x1 + 0.03, top, d + 0.03, C.lightWood, { r: 0.015 });
    b.box('paint', x0, 0, 0, x1, top - 0.05, d - 0.02, C.trim);
    b.box('paint', x0 + 0.08, 0.14, d - 0.02, (x0 + x1) / 2 - 0.04, top - 0.14, d - 0.005, 0xf4e8d0);
    b.box('paint', (x0 + x1) / 2 + 0.04, 0.14, d - 0.02, x1 - 0.08, top - 0.14, d - 0.005, 0xf4e8d0);
    b.box('paint', x0, 0, d - 0.02, x1, 0.1, d, C.trim);
    // reveal side walls between the wider ledge and the narrower window hole
    b.box('wallpaperLiving', x0 - 0.001, top, 0, winGF.a0, winGF.y1, 0.003, 0xffffff, { cast: false });
    col('windowsill', x0 - 0.03, 0, 0, x1 + 0.03, top, d + 0.03, 'solid');
    anchor('windowsill', 3.0, top, 0.24, 0);
    anchor('vase', 2.55, top, 0.22, 0);
    anchor('window', 3.0, 1.5, 0, 0, { w: 1.2, h: 1.2 });
    anchor('curtains', 3.0, 2.3, 0.12, 0, { w: 2.0, h: 2.3 });
    // curtain rod (props own the cloth)
    b.cyl('metal', null, 3.0, 2.32, 0.1, 0.014, 0.014, 2.2, C.brass, { rot: [0, 0, Math.PI / 2], radial: 8 });
    b.sphere('metal', null, 1.88, 2.32, 0.1, 0.035, C.brass); b.sphere('metal', null, 4.12, 2.32, 0.1, 0.035, C.brass);
  }
  // window seat cushion
  b.box('fabric', 2.28, 0.9, 0.06, 3.72, 0.95, 0.44, 0xd98e5c, { r: 0.025, cast: true });

  // TV stand (CRT TV is a prop on top)
  {
    const f = frameAt(0.38, 0, 2.75, Math.PI / 2);
    b.lbox('wood', f, 0, 0.3, 0, 1.15, 0.5, 0.56, C.midWood, { r: 0.03 });
    b.lbox('woodGloss', f, 0, 0.535, 0, 1.2, 0.035, 0.6, C.darkWood, { r: 0.012 });
    for (const sx of [-0.29, 0.29]) for (let i = 0; i < 3; i++) {
      const y = 0.13 + i * 0.125;
      b.lbox('woodGloss', f, sx, y, 0.285, 0.52, 0.105, 0.015, 0xc89563, { r: 0.008 });
      b.sphere('metal', f, sx, y, 0.3, 0.016, C.brass);
    }
    for (const [x, z] of [[-0.52, -0.22], [0.52, -0.22], [-0.52, 0.22], [0.52, 0.22]]) b.cyl('wood', f, x, 0.03, z, 0.025, 0.02, 0.06, C.darkWood, { radial: 8 });
    col('tvStand', 0.08, 0, 2.15, 0.68, 0.55, 3.35);
    anchor('tv', 0.38, 0.55, 2.75, Math.PI / 2);
    lamps.push({ pos: V(0.95, 0.85, 2.75), color: 0xffd6a8, intensity: 0.9, distance: 3, prio: 3, room: 'living' });
  }
  // sofa (faces -x, toward the TV)
  {
    const cx = 3.85, cz = 2.75, f = frameAt(cx, 0, cz, -Math.PI / 2);
    const Wd = 1.9, Dp = 0.92;
    b.lbox('fabric', f, 0, 0.21, 0, Wd, 0.3, Dp, C.sofa, { r: 0.07, seg: 3 });
    b.lbox('fabric', f, 0, 0.62, -Dp / 2 + 0.13, Wd - 0.1, 0.62, 0.26, C.sofa, { r: 0.11, seg: 3 });
    for (const s of [-1, 1]) {
      b.lbox('fabric', f, s * (Wd / 2 - 0.1), 0.36, 0.02, 0.2, 0.4, Dp - 0.06, C.sofa, { r: 0.08, seg: 3 });
      b.cyl('fabric', f, s * (Wd / 2 - 0.08), 0.53, 0.03, 0.12, 0.12, Dp - 0.04, C.sofa, { rot: [Math.PI / 2, 0, 0], radial: 16 });
      b.sphere('fabric', f, s * (Wd / 2 - 0.08), 0.53, Dp / 2 - 0.01, 0.12, C.sofaCushion, { scale: [1, 1, 0.25] });
    }
    for (const s of [-1, 1]) {
      b.lbox('fabric', f, s * 0.41, 0.42, 0.08, 0.8, 0.15, 0.72, C.sofaCushion, { r: 0.07, seg: 3 });
      b.lbox('fabric', f, s * 0.41, 0.64, -0.24, 0.76, 0.42, 0.16, C.sofaCushion, { r: 0.07, seg: 3, rot: [-0.18, 0, 0] });
    }
    b.lbox('fabric', f, -0.55, 0.62, -0.08, 0.36, 0.32, 0.12, 0xb8563a, { r: 0.06, seg: 3, rot: [-0.3, 0.25, 0.1] });
    b.lbox('fabric', f, 0.6, 0.6, -0.1, 0.34, 0.3, 0.12, 0x5f8f86, { r: 0.06, seg: 3, rot: [-0.3, -0.2, -0.1] });
    for (const [x, z] of [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]]) b.cyl('wood', f, x, 0.03, z, 0.03, 0.022, 0.06, C.darkWood, { radial: 8 });
    // colliders (world frame: sofa spans x cx±Dp/2, z cz±Wd/2)
    col('sofaSeat', cx - Dp / 2, 0, cz - Wd / 2, cx + Dp / 2, 0.49, cz + Wd / 2);
    col('sofaBack', cx + Dp / 2 - 0.27, 0, cz - Wd / 2, cx + Dp / 2, 0.92, cz + Wd / 2);
    col('sofaArmA', cx - Dp / 2, 0, cz - Wd / 2, cx + Dp / 2, 0.63, cz - Wd / 2 + 0.21);
    col('sofaArmB', cx - Dp / 2, 0, cz + Wd / 2 - 0.21, cx + Dp / 2, 0.63, cz + Wd / 2);
    anchor('sofa', cx - 0.05, 0.49, cz, -Math.PI / 2);
  }
  // lounge chair near the window (faces -x)
  {
    const cx = 4.45, cz = 0.95, f = frameAt(cx, 0, cz, -Math.PI / 2 + 0.25);
    b.lbox('fabric', f, 0, 0.22, 0.02, 0.62, 0.3, 0.7, C.lounge, { r: 0.07, seg: 3 });
    b.lbox('fabric', f, 0, 0.42, 0.06, 0.6, 0.12, 0.62, 0x77a79c, { r: 0.05, seg: 3 });
    b.lbox('fabric', f, 0, 0.66, -0.3, 0.8, 0.82, 0.2, C.lounge, { r: 0.09, seg: 3, rot: [-0.12, 0, 0] });
    for (const s of [-1, 1]) b.lbox('fabric', f, s * 0.36, 0.4, 0.02, 0.16, 0.42, 0.74, C.loungeDark, { r: 0.07, seg: 3 });
    for (const [x, z] of [[-0.34, -0.32], [0.34, -0.32], [-0.34, 0.34], [0.34, 0.34]]) b.cyl('wood', f, x, 0.04, z, 0.025, 0.02, 0.08, C.darkWood, { radial: 8 });
    col('loungeSeat', cx - 0.4, 0, cz - 0.42, cx + 0.36, 0.48, cz + 0.42);
    col('loungeBack', cx + 0.28, 0, cz - 0.42, cx + 0.5, 1.0, cz + 0.42);
    anchor('loungeChair', cx - 0.05, 0.48, cz, -Math.PI / 2 + 0.25);
  }
  // coffee table
  {
    const cx = 2.05, cz = 2.75;
    b.box('woodGloss', cx - 0.42, 0.37, cz - 0.6, cx + 0.42, 0.42, cz + 0.6, C.midWood, { r: 0.025 });
    b.box('wood', cx - 0.36, 0.12, cz - 0.52, cx + 0.36, 0.15, cz + 0.52, C.darkWood, { r: 0.01 });
    for (const [x, z] of [[-0.36, -0.54], [0.36, -0.54], [-0.36, 0.54], [0.36, 0.54]]) b.cyl('wood', null, cx + x, 0.185, cz + z, 0.03, 0.022, 0.37, C.darkWood, { radial: 8 });
    col('coffeeTable', cx - 0.42, 0.37, cz - 0.6, cx + 0.42, 0.42, cz + 0.6, 'surface');
    // magazines + mug + remote
    b.box('paint', cx - 0.2, 0.42, cz - 0.4, cx + 0.12, 0.43, cz - 0.08, 0xd35a4a, { r: 0.003 });
    b.box('paint', cx - 0.18, 0.43, cz - 0.36, cx + 0.14, 0.44, cz - 0.1, 0x4f88b8, { r: 0.003 });
    b.cyl('ceramic', null, cx + 0.15, 0.47, cz + 0.25, 0.04, 0.04, 0.09, 0xf2e6d0, { radial: 12 });
    b.box('gloss', cx - 0.12, 0.42, cz + 0.2, cx - 0.06, 0.445, cz + 0.38, 0x333333, { r: 0.01 });
  }
  // rug under the coffee table
  {
    const g = new THREE.PlaneGeometry(3.0, 2.2);
    g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);
    b.geom('rugLiving', g, new THREE.Matrix4().makeTranslation(2.35, 0.004, 2.75), 0xffffff, { uv: 'keep', cast: false });
  }
  // bookshelf (left wall, near the archway)
  {
    const x0 = 0, x1 = 0.36, z0 = 4.1, z1 = 5.25, h = 1.8;
    b.box('wood', x0, 0, z0, x1, 0.06, z1, C.darkWood);
    b.box('wood', x0, h - 0.04, z0 - 0.02, x1 + 0.02, h, z1 + 0.02, C.darkWood, { r: 0.01 });
    b.box('wood', x0, 0, z0, x1, h, z0 + 0.03, C.midWood); b.box('wood', x0, 0, z1 - 0.03, x1, h, z1, C.midWood);
    b.box('wood', x0, 0, z0, 0.02, h, z1, C.midWood);
    const shelves = [0.06, 0.48, 0.9, 1.32];
    const bookCols = [0xb8463a, 0x3f6e9a, 0xd9a440, 0x5c8a4e, 0x7d4a8a, 0xe4d6b8, 0x2f5a5a, 0xc96d3b];
    let k = 0;
    for (const sy of shelves) {
      if (sy > 0.1) b.box('wood', x0, sy - 0.025, z0, x1, sy, z1, C.midWood);
      let z = z0 + 0.05;
      while (z < z1 - 0.12) {
        const t = 0.03 + ((k * 37) % 7) * 0.008, bh = 0.24 + ((k * 13) % 5) * 0.03;
        if ((k * 7) % 11 === 3) { z += 0.08; k++; continue; }
        b.box('paint', 0.05, sy, z, 0.29, sy + bh, z + t, bookCols[k % bookCols.length], { r: 0.004 });
        z += t + 0.004; k++;
      }
    }
    col('bookshelf', x0, 0, z0, x1 + 0.02, h, z1);
  }
  // side table + table lamp by the sofa
  {
    const cx = 3.85, cz = 4.1;
    b.cyl('woodGloss', null, cx, 0.55, cz, 0.24, 0.24, 0.035, C.midWood, { radial: 20 });
    b.cyl('wood', null, cx, 0.27, cz, 0.035, 0.05, 0.54, C.darkWood, { radial: 10 });
    b.cyl('wood', null, cx, 0.02, cz, 0.18, 0.2, 0.04, C.darkWood, { radial: 16 });
    b.lathe('ceramic', null, cx, 0.567, cz, [[0, 0], [0.08, 0], [0.1, 0.08], [0.07, 0.2], [0.025, 0.26], [0.02, 0.33], [0, 0.33]], 0x5d9a8c, { radial: 16 });
    b.lathe('glowShade', null, cx, 0.82, cz, [[0.17, 0], [0.11, 0.2]], 0xfff1d6, { radial: 20, cast: false });
    b.box('metal', cx - 0.004, 0.82, cz - 0.004, cx + 0.004, 0.86, cz + 0.004, C.brass);
    col('sideTable', cx - 0.24, 0, cz - 0.24, cx + 0.24, 0.57, cz + 0.24, 'surface');
    lamps.push({ pos: V(cx, 0.95, cz), color: 0xffa850, intensity: 4.5, distance: 7, prio: 1, room: 'living' });
    halos.push([cx, 0.92, cz, 0.8]);
  }
  // floor lamp in the corner by the TV
  {
    const cx = 0.45, cz = 0.45;
    b.cyl('metal', null, cx, 0.02, cz, 0.16, 0.18, 0.04, C.brass, { radial: 16 });
    b.cyl('metal', null, cx, 0.8, cz, 0.015, 0.015, 1.56, C.brass, { radial: 8 });
    b.lathe('glowShade', null, cx, 1.42, cz, [[0.23, 0], [0.15, 0.28]], 0xfff1d6, { radial: 24, cast: false });
    col('floorLamp', cx - 0.06, 0, cz - 0.06, cx + 0.06, 1.7, cz + 0.06);
    lamps.push({ pos: V(cx, 1.5, cz), color: 0xffa850, intensity: 8, distance: 8, prio: 2, room: 'living' });
    halos.push([cx, 1.56, cz, 0.9]);
  }
  // doormat + coat hooks by the front door
  b.box('fabric', 6.65, 0, 0.08, 7.55, 0.012, 0.65, 0x8a5a3a, { r: 0.005, cast: false });
  {
    b.box('woodGloss', 5.75, 1.55, 0, 6.35, 1.64, 0.03, C.darkWood, { r: 0.01 });
    for (const x of [5.85, 6.05, 6.25]) b.cyl('metal', null, x, 1.6, 0.06, 0.012, 0.012, 0.08, C.brass, { rot: [Math.PI / 2, 0, 0], radial: 6 });
    // Jon's coat + scarf
    b.lbox('fabric', null, 5.92, 1.3, 0.08, 0.26, 0.55, 0.08, 0x6b7f4a, { r: 0.04, rot: [0, 0, 0.05] });
    b.lbox('fabric', null, 6.25, 1.36, 0.075, 0.08, 0.45, 0.05, 0xc84a3a, { r: 0.025 });
  }
  // entry: runner rug, umbrella stand, Jon's sneakers
  b.box('fabric', 6.8, 0, 0.75, 7.4, 0.008, 2.6, 0x9a5a44, { r: 0.004, cast: false });
  b.box('fabric', 6.86, 0.008, 0.81, 7.34, 0.011, 2.54, 0xc9a06a, { r: 0.004, cast: false });
  b.cyl('ceramic', null, 6.35, 0.25, 0.25, 0.12, 0.11, 0.5, 0x3f6e9a, { radial: 14 });
  b.cyl('wood', null, 6.32, 0.62, 0.25, 0.012, 0.012, 0.5, 0x2a2a2a, { radial: 6, rot: [0.1, 0, 0.12] });
  b.box('gloss', 6.38, 0.55, 0.2, 6.43, 0.85, 0.3, 0xd2513e, { r: 0.02 });
  col('umbrellaStand', 6.22, 0, 0.12, 6.48, 0.5, 0.38);
  for (const [x, rz] of [[5.95, 0.2], [6.1, -0.15]]) {
    const f = frameAt(x, 0, 0.45, rz);
    b.lbox('fabric', f, 0, 0.04, 0, 0.1, 0.08, 0.27, 0x4f6f9a, { r: 0.035 });
    b.lbox('gloss', f, 0, 0.012, 0, 0.11, 0.024, 0.29, 0xf2eee4, { r: 0.01 });
  }
  // potted plant in front-right corner of living room
  plant(5.55, 0, 0.35, 0.75);
  // wall clock above the TV
  {
    const f = frameAt(0.0, 0, 2.75, Math.PI / 2);
    b.cyl('woodGloss', f, 0, 1.9, 0.03, 0.2, 0.2, 0.05, C.darkWood, { rot: [Math.PI / 2, 0, 0], radial: 24, cast: false });
    b.cyl('paint', f, 0, 1.9, 0.056, 0.17, 0.17, 0.004, 0xfff6e0, { rot: [Math.PI / 2, 0, 0], radial: 24, cast: false });
    b.lbox('paint', f, 0.0, 1.95, 0.062, 0.012, 0.1, 0.004, 0x222222, { cast: false });
    b.lbox('paint', f, 0.04, 1.9, 0.062, 0.08, 0.012, 0.004, 0x222222, { cast: false });
  }

  // ---------- kitchen ----------
  // back counter run x 0..5.3, z 10.38..11, top 0.92
  const ctrZ = 10.38, ctrTop = 0.92;
  function cabinetRun(x0, x1, z0, z1, face) {
    // face: 'z-' or 'x+' (direction doors face)
    b.box('paint', x0, 0, z0, x1, 0.1, z1, 0x6e5440, { cast: false });
    const kick = 0.06;
    if (face === 'z-') b.box('wood', x0, 0.1, z0 + kick, x1, ctrTop - 0.04, z1, C.cabinet);
    else b.box('wood', x0, 0.1, z0, x1 - kick, ctrTop - 0.04, z1, C.cabinet);
    b.box('gloss', x0, ctrTop - 0.04, z0 - (face === 'z-' ? 0.03 : 0), x1 + (face === 'x+' ? 0.03 : 0), ctrTop, z1, 0xf0e4cc, { r: 0.012 });
    const n = Math.max(1, Math.round(((face === 'z-' ? x1 - x0 : z1 - z0)) / 0.55));
    for (let i = 0; i < n; i++) {
      if (face === 'z-') {
        const a = x0 + (x1 - x0) * i / n + 0.025, c = x0 + (x1 - x0) * (i + 1) / n - 0.025;
        b.box('woodGloss', a, 0.14, z0 + kick - 0.02, c, ctrTop - 0.2, z0 + kick, C.cabinetDoor, { r: 0.012 });
        b.box('woodGloss', a + 0.06, 0.2, z0 + kick - 0.03, c - 0.06, ctrTop - 0.26, z0 + kick - 0.02, C.cabinetPanel, { r: 0.01 });
        b.box('woodGloss', a, ctrTop - 0.18, z0 + kick - 0.02, c, ctrTop - 0.06, z0 + kick, C.cabinetDoor, { r: 0.01 });
        b.box('metal', (a + c) / 2 - 0.05, ctrTop - 0.13, z0 + kick - 0.04, (a + c) / 2 + 0.05, ctrTop - 0.11, z0 + kick - 0.02, C.brass, { r: 0.006 });
        b.sphere('metal', null, i % 2 ? a + 0.06 : c - 0.06, ctrTop - 0.32, z0 + kick - 0.03, 0.018, C.brass);
      } else {
        const a = z0 + (z1 - z0) * i / n + 0.025, c = z0 + (z1 - z0) * (i + 1) / n - 0.025;
        b.box('woodGloss', x1 - kick, 0.14, a, x1 - kick + 0.02, ctrTop - 0.2, c, C.cabinetDoor, { r: 0.012 });
        b.box('woodGloss', x1 - kick + 0.02, 0.2, a + 0.06, x1 - kick + 0.03, ctrTop - 0.26, c - 0.06, C.cabinetPanel, { r: 0.01 });
        b.box('woodGloss', x1 - kick, ctrTop - 0.18, a, x1 - kick + 0.02, ctrTop - 0.06, c, C.cabinetDoor, { r: 0.01 });
        b.sphere('metal', null, x1 - kick + 0.03, ctrTop - 0.32, i % 2 ? a + 0.06 : c - 0.06, 0.018, C.brass);
      }
    }
  }
  b.layer = 'ground';
  cabinetRun(0, 5.3, ctrZ, D, 'z-');
  col('counterBack', 0, 0, ctrZ - 0.03, 5.3, ctrTop, D, 'solid', { counter: true });
  cabinetRun(0, 0.62, 7.6, ctrZ, 'x+');
  col('counterLeft', 0, 0, 7.6, 0.65, ctrTop, ctrZ, 'solid', { counter: true });
  anchor('counter', 3.6, ctrTop, 10.7, Math.PI);
  // tile backsplash
  b.grid('tile', 0, 5.3, ctrTop, 1.45, [{ u0: 1.8, u1: 3.0, v0: 1.3, v1: 2.2 }], (u, v) => V(u, v, D - 0.004), V(0, 0, -1), 0xffffff, { step: 0.5 });
  b.grid('tile', 7.6, ctrZ, ctrTop, 1.45, [], (u, v) => V(0.004, v, u), V(1, 0, 0), 0xffffff, { step: 0.5 });
  // sink under the back window
  {
    const sx = 2.4;
    b.box('metal', sx - 0.42, ctrTop - 0.002, 10.48, sx + 0.42, ctrTop + 0.004, 10.92, C.steel);
    b.box('metal', sx - 0.36, ctrTop - 0.16, 10.54, sx + 0.36, ctrTop - 0.15, 10.86, 0x9aa0a6);
    b.cyl('metal', null, sx, ctrTop + 0.17, 10.92, 0.018, 0.022, 0.34, C.steel, { radial: 10 });
    b.cyl('metal', null, sx, ctrTop + 0.33, 10.83, 0.016, 0.016, 0.2, C.steel, { rot: [Math.PI / 2, 0, 0], radial: 10 });
    for (const dx of [-0.12, 0.12]) b.cyl('metal', null, sx + dx, ctrTop + 0.03, 10.9, 0.025, 0.025, 0.05, C.steel, { radial: 10 });
    // window sill plant + dish rack
    plantPot(sx - 0.45, 1.3, 10.92, 0.18);
    b.box('metal', sx + 0.5, ctrTop, 10.5, sx + 0.9, ctrTop + 0.02, 10.85, 0xdadada);
    for (let i = 0; i < 4; i++) b.cyl('ceramic', null, sx + 0.56 + i * 0.09, ctrTop + 0.13, 10.68, 0.11, 0.11, 0.015, [0xf7f1e4, 0xe4a96e, 0xf7f1e4, 0x9cc5d6][i], { rot: [0, 0, Math.PI / 2 - 0.15], radial: 20 });
  }
  // microwave next to the fridge: climbing step (top 1.27)
  {
    const x0 = 4.62, x1 = 5.25, z0 = 10.5, z1 = 10.98, y0 = ctrTop, y1 = ctrTop + 0.35;
    b.box('gloss', x0, y0, z0, x1, y1, z1, 0xeee4cf, { r: 0.03 });
    b.box('gloss', x0 + 0.04, y0 + 0.05, z0 - 0.005, x0 + 0.44, y1 - 0.05, z0 + 0.01, 0x2d2a26, { r: 0.01 });
    b.box('gloss', x0 + 0.48, y0 + 0.05, z0 - 0.005, x1 - 0.03, y1 - 0.05, z0 + 0.01, 0xd9cfb8, { r: 0.008 });
    for (let i = 0; i < 3; i++) b.cyl('gloss', null, x0 + 0.54, y1 - 0.11 - i * 0.07, z0 - 0.005, 0.018, 0.018, 0.02, 0x7a6a5a, { rot: [Math.PI / 2, 0, 0], radial: 10 });
    col('microwave', x0, y0, z0, x1, y1, z1, 'solid');
    anchor('microwaveTop', (x0 + x1) / 2, y1, (z0 + z1) / 2, Math.PI);
  }
  // bread bin + kettle + utensils + fruit bowl on the counter
  b.box('gloss', 3.35, ctrTop, 10.55, 3.8, ctrTop + 0.22, 10.92, 0xd2513e, { r: 0.06 });
  b.lathe('metal', null, 1.0, ctrTop, 10.7, [[0, 0], [0.1, 0], [0.11, 0.08], [0.09, 0.2], [0.04, 0.24], [0, 0.25]], 0xd9d4cc, { radial: 16 });
  b.cyl('ceramic', null, 0.62 + 0.0, ctrTop + 0.08, 10.75, 0.06, 0.055, 0.16, 0xf0e6d4, { radial: 12 });
  for (let i = 0; i < 4; i++) b.cyl('wood', null, 0.6 + (i % 2) * 0.04, ctrTop + 0.24, 10.73 + (i >> 1) * 0.04, 0.008, 0.008, 0.2, C.lightWood, { radial: 6, rot: [0.1 * (i - 1.5), 0, 0.12 * (i - 1.5)] });
  b.lathe('ceramic', null, 0.33, ctrTop, 9.2, [[0, 0], [0.08, 0], [0.16, 0.08], [0.17, 0.09]], 0x5d8fb0, { radial: 20 });
  for (const [dx, dz, c] of [[0, 0, 0xd6452f], [0.07, 0.04, 0xe8b32c], [-0.06, 0.05, 0x9bbf3a], [0.02, -0.07, 0xd6452f]]) b.sphere('gloss', null, 0.33 + dx, ctrTop + 0.1, 9.2 + dz, 0.045, c);
  // stove on the left counter
  {
    const z0 = 8.35, z1 = 9.05;
    b.box('gloss', 0.02, 0.1, z0, 0.6, ctrTop + 0.01, z1, 0xf1eadb, { r: 0.02 });
    b.box('gloss', 0.6, 0.2, z0 + 0.06, 0.61, 0.7, z1 - 0.06, 0x2d2a26, { r: 0.01 });
    b.cyl('metal', null, 0.61, 0.75, (z0 + z1) / 2, 0.012, 0.012, 0.55, C.steel, { rot: [Math.PI / 2, 0, 0], radial: 8 });
    for (const [x, z] of [[0.17, z0 + 0.17], [0.42, z0 + 0.17], [0.17, z1 - 0.17], [0.42, z1 - 0.17]]) b.cyl('metal', null, x, ctrTop + 0.015, z, 0.09, 0.09, 0.012, 0x3a3a3a, { radial: 16 });
    // range hood
    b.box('gloss', 0, 1.75, z0 - 0.02, 0.5, 1.95, z1 + 0.02, 0xf1eadb, { r: 0.03 });
    b.box('gloss', 0, 1.95, z0 + 0.15, 0.3, CEIL1, z1 - 0.15, 0xf1eadb);
    // saucepan
    b.cyl('metal', null, 0.42, ctrTop + 0.08, z0 + 0.17, 0.1, 0.09, 0.13, 0xc0453a, { radial: 16 });
    b.box('metal', 0.5, ctrTop + 0.12, z0 + 0.15, 0.7, ctrTop + 0.14, z0 + 0.19, 0x2a2a2a, { r: 0.008 });
  }
  // upper cabinets (kept clear of the microwave → fridge climb)
  for (const [x0, x1] of [[0, 1.65], [3.15, 3.98]]) {
    b.box('wood', x0, 1.5, D - 0.34, x1, 2.2, D, C.cabinet, { r: 0.012 });
    const n = Math.round((x1 - x0) / 0.42);
    for (let i = 0; i < n; i++) {
      const a = x0 + (x1 - x0) * i / n + 0.02, c = x0 + (x1 - x0) * (i + 1) / n - 0.02;
      b.box('woodGloss', a, 1.53, D - 0.36, c, 2.17, D - 0.34, C.cabinetDoor, { r: 0.012 });
      b.box('woodGloss', a + 0.05, 1.6, D - 0.37, c - 0.05, 2.1, D - 0.36, C.cabinetPanel, { r: 0.01 });
      b.sphere('metal', null, i % 2 ? a + 0.05 : c - 0.05, 1.6, D - 0.37, 0.016, C.brass);
    }
    col(null, x0, 1.5, D - 0.34, x1, 2.2, D);
  }
  // open shelf with jars on the left wall above the stove side
  {
    b.box('woodGloss', 0, 1.55, 9.3, 0.26, 1.58, 10.2, C.midWood, { r: 0.008 });
    const jc = [0xe7c26a, 0xc9563e, 0x8db06a, 0xe8dcc4];
    for (let i = 0; i < 4; i++) {
      b.cyl('glass', null, 0.12, 1.66, 9.4 + i * 0.22, 0.06, 0.06, 0.16, 0xffffff, { radial: 12, cast: false });
      b.cyl('paint', null, 0.12, 1.63, 9.4 + i * 0.22, 0.055, 0.055, 0.1, jc[i], { radial: 12 });
      b.cyl('woodGloss', null, 0.12, 1.75, 9.4 + i * 0.22, 0.062, 0.062, 0.025, C.darkWood, { radial: 12 });
    }
  }
  // dresser/hutch on the right wall with plates
  {
    const x0 = W - 0.48, z0 = 9.1, z1 = 10.6;
    b.box('paint', x0, 0, z0, W, 0.86, z1, 0xe9c99a, { r: 0.015 });
    b.box('woodGloss', x0 - 0.03, 0.86, z0 - 0.02, W, 0.9, z1 + 0.02, C.midWood, { r: 0.01 });
    for (let i = 0; i < 3; i++) {
      const a = z0 + 0.04 + i * 0.48, c = a + 0.44;
      b.box('gloss', x0 - 0.02, 0.12, a, x0, 0.8, c, 0xf2d6aa, { r: 0.01 });
      b.sphere('metal', null, x0 - 0.03, 0.62, (a + c) / 2, 0.018, C.brass);
    }
    b.box('paint', W - 0.28, 0.9, z0, W, 2.1, z0 + 0.03, 0xe9c99a);
    b.box('paint', W - 0.28, 0.9, z1 - 0.03, W, 2.1, z1, 0xe9c99a);
    b.box('woodGloss', W - 0.3, 2.08, z0 - 0.02, W, 2.14, z1 + 0.02, C.midWood);
    for (const sy of [1.35, 1.75]) {
      b.box('paint', W - 0.28, sy, z0, W, sy + 0.025, z1, 0xe9c99a);
      for (let i = 0; i < 5; i++) b.cyl('ceramic', null, W - 0.12, sy + 0.16, z0 + 0.18 + i * 0.28, 0.13, 0.13, 0.015, i % 2 ? 0x5d8fb0 : 0xf3ece0, { rot: [0, 0, Math.PI / 2 - 0.18], radial: 20 });
    }
    col('dresser', x0 - 0.03, 0, z0, W, 0.9, z1);
    col('hutch', W - 0.3, 0.9, z0, W, 2.14, z1);
  }
  // kitchen pendant lamp over the table
  {
    const x = 4.6, z = 8.45, y = 2.22, k = 1.3;
    const dome = [[0.0, 0.26], [0.04, 0.255], [0.13, 0.22], [0.2, 0.15], [0.24, 0.06], [0.255, 0], [0.25, -0.005]].map(([r, h]) => [r * k, h * k]);
    b.cyl('metal', null, x, (y + CEIL1) / 2 + 0.15, z, 0.006, 0.006, CEIL1 - y - 0.3, 0x333333, { radial: 4 });
    b.cyl('metal', null, x, y + 0.36, z, 0.035, 0.05, 0.1, 0xe8b54a, { radial: 12, cast: false });
    b.lathe('glowShade', null, x, y, z, dome, 0xf6e2b0, { radial: 28, cast: false, receive: false });
    b.lathe('glowShade', null, x, y + 0.01, z, [[0.24 * k, 0], [0.0, 0.0]], 0xffffff, { radial: 28, cast: false });
    b.sphere('glowWarm', null, x, y + 0.05, z, 0.075, 0xffffff, { cast: false });
    b.cyl('metal', null, x, CEIL1 - 0.01, z, 0.07, 0.07, 0.02, 0xe8b54a, { radial: 16 });
    // spot aimed down from the shade mouth (point fallback on low): the shade keeps the ceiling dim like the ref
    lamps.push({ pos: V(x, y + 0.06, z), color: 0xffb060, intensity: 12, distance: 9.5, prio: 0, room: 'kitchen', spot: true });
    halos.push([x, y - 0.02, z, 1.5]);
  }
  // table, bench, Jon's chair are props; anchors:
  anchor('tableTop', 4.4, 0.76, 8.8, 0, { w: 1.5, d: 0.9 });
  anchor('kitchenBench', 4.4, 0, 9.62, 0);
  anchor('jonChair', 4.4, 0, 7.98, 0);
  anchor('jonSeat', 4.4, 0.46, 8.0, 0);
  anchor('plateSpot', 4.4, 0.76, 8.58, 0);
  anchor('panSpot', 4.0, 0.76, 8.95, 0);
  anchor('underTable', 4.4, 0, 8.8, 0);
  anchor('fridgeFront', 5.675, 0, 10.3, Math.PI);
  anchor('fridgeTop', 5.675, 1.85, 10.65, Math.PI);
  anchor('catBowl', 6.7, 0, 9.7, Math.PI);
  anchor('kitchenCentre', 6.6, 0, 7.6, 0);
  anchor('livingCentre', 5.9, 0, 2.6, 0);
  anchor('frontDoor', 7.1, 0, 0, 0, { w: 0.9, h: 2.05 });
  anchor('playerSpawn', 6.75, 0, 9.05, Math.PI);
  anchor('jonSpawn', 7.2, 0, 7.4, Math.PI);
  // kitchen island (extra high ground for chases)
  {
    const x0 = 7.05, x1 = 8.35, z0 = 7.75, z1 = 8.75;
    b.box('paint', x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, 0.1, z1 - 0.05, 0x6e5440, { cast: false });
    b.box('wood', x0 + 0.04, 0.1, z0 + 0.04, x1 - 0.04, ctrTop - 0.04, z1 - 0.04, C.cabinet);
    for (const [zz, sg] of [[z0 + 0.04, -1], [z1 - 0.04, 1]]) for (let i = 0; i < 2; i++) {
      const a = x0 + 0.08 + i * 0.6, c = a + 0.54;
      b.box('woodGloss', a, 0.14, zz + sg * 0.0 - (sg < 0 ? 0.02 : 0), c, ctrTop - 0.1, zz + (sg > 0 ? 0.02 : 0), C.cabinetDoor, { r: 0.012 });
      b.sphere('metal', null, (a + c) / 2, ctrTop - 0.2, zz + sg * 0.03, 0.018, C.brass);
    }
    b.box('woodGloss', x0, ctrTop - 0.05, z0, x1, ctrTop, z1, 0xd9a877, { r: 0.015 });
    col('island', x0, 0, z0, x1, ctrTop, z1, 'solid', { counter: true });
    b.lathe('ceramic', null, 7.4, ctrTop, 8.25, [[0, 0], [0.12, 0], [0.18, 0.06], [0.19, 0.07]], 0xe8d8b8, { radial: 20 });
    for (const [dx, dz] of [[0, 0], [0.06, 0.05], [-0.05, 0.04]]) b.lathe('gloss', null, 7.4 + dx, ctrTop + 0.03, 8.25 + dz, [[0, 0], [0.035, 0.01], [0.05, 0.06], [0.03, 0.11], [0, 0.12]], 0xf2c84a, { radial: 10 });
    b.cyl('woodGloss', null, 8.0, ctrTop + 0.012, 8.3, 0.18, 0.18, 0.025, 0xc98a52, { radial: 20 });
  }
  // braided oval rug under the dining table
  {
    const g = new THREE.CircleGeometry(1, 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4().makeTranslation(4.4, 0.004, 8.8).multiply(new THREE.Matrix4().makeScale(1.55, 1, 1.25));
    b.geom('rugBraid', g, m, 0xffffff, { uv: 'keep', cast: false });
  }
  // back door (decor, locked) between fridge and the right wall
  {
    const x0 = 7.3, x1 = 8.2, z = D;
    b.box('paint', x0, 0, z - 0.04, x1, 2.05, z, 0xb8d0c0, { r: 0.01 });
    b.box('windowGlass', x0 + 0.15, 1.15, z - 0.045, x1 - 0.15, 1.85, z - 0.04, 0xffffff, { cast: false });
    b.box('paint', x0 + 0.12, 0.15, z - 0.05, x1 - 0.12, 0.95, z - 0.04, 0xc8dccd, { r: 0.008 });
    b.box('paint', (x0 + x1) / 2 - 0.015, 1.15, z - 0.05, (x0 + x1) / 2 + 0.015, 1.85, z - 0.045, 0xf3f0e6);
    b.box('paint', x0 + 0.15, 1.485, z - 0.05, x1 - 0.15, 1.515, z - 0.045, 0xf3f0e6);
    b.sphere('metal', null, x1 - 0.1, 1.0, z - 0.08, 0.03, C.brass);
    b.box('paint', x0 - 0.08, 0, z - 0.06, x0, 2.13, z, C.trim);
    b.box('paint', x1, 0, z - 0.06, x1 + 0.08, 2.13, z, C.trim);
    b.box('paint', x0 - 0.08, 2.05, z - 0.06, x1 + 0.08, 2.13, z, C.trim);
    b.box('fabric', x0 - 0.05, 0, z - 0.7, x1 + 0.05, 0.01, z - 0.1, 0x6a7f4a, { r: 0.004, cast: false });
  }
  // radiator under the right-wall window
  {
    const x = W - 0.12, z0 = 7.35, z1 = 8.45;
    for (let z = z0; z < z1; z += 0.07) b.box('gloss', x - 0.05, 0.12, z, x + 0.05, 0.75, z + 0.05, 0xefe8da, { r: 0.02, cast: false });
    b.box('gloss', x - 0.03, 0.18, z0, x + 0.03, 0.22, z1, 0xe4dccc, { cast: false });
    col('radiator', x - 0.06, 0, z0, W, 0.75, z1);
  }
  // pedal bin beside the fridge + tall plant in the corner by the doorway
  b.cyl('metal', null, 6.35, 0.3, 10.7, 0.16, 0.15, 0.6, 0xd2513e, { radial: 18 });
  b.cyl('metal', null, 6.35, 0.61, 10.7, 0.165, 0.165, 0.03, 0xc8c8c8, { radial: 18 });
  col('bin', 6.18, 0, 10.53, 6.52, 0.62, 10.87);
  plant(W - 0.35, 0, 5.95, 0.9);
  // calendar on the back wall right of the fridge
  b.box('paint', 6.4, 1.3, D - 0.012, 6.85, 1.95, D - 0.004, 0xfff8ea, { cast: false });
  b.box('paint', 6.42, 1.62, D - 0.016, 6.83, 1.92, D - 0.012, 0xe8891c, { cast: false });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) b.box('paint', 6.44 + j * 0.08, 1.34 + i * 0.065, D - 0.016, 6.5 + j * 0.08, 1.39 + i * 0.065, D - 0.012, (i * 5 + j) % 7 === 3 ? 0xd2513e : 0xd8d0c0, { cast: false });
  // little floor mat under the cat bowl
  b.box('fabric', 6.45, 0, 9.5, 6.95, 0.008, 9.9, 0xd9534a, { r: 0.004, cast: false });
  // kitchen wall decor: clock + calendar + cat picture
  {
    b.cyl('woodGloss', null, 5.3, 2.35, 5.6 + 0.02, 0.17, 0.17, 0.04, 0xd2513e, { rot: [Math.PI / 2, 0, 0], radial: 24, cast: false });
    b.cyl('paint', null, 5.3, 2.35, 5.6 + 0.042, 0.14, 0.14, 0.004, 0xfff6e0, { rot: [Math.PI / 2, 0, 0], radial: 24, cast: false });
    b.box('paint', 5.29, 2.35, 5.645, 5.31, 2.45, 5.65, 0x222222, { cast: false });
    b.box('paint', 5.3, 2.34, 5.645, 5.38, 2.36, 5.65, 0x222222, { cast: false });
  }

  // ---------- upstairs: bedroom ----------
  b.layer = 'upper';
  anchor('jonBed', 1.05, UF, 3.2, Math.PI / 2, { w: 1.5, l: 2.05 });
  anchor('garfieldBed', 4.6, UF, 1.3, 0);
  anchor('bedroomDoor', 6.4, UF, 5.7, -Math.PI / 2, { w: 0.85, h: 2.05 });
  anchor('bedroomCentre', 3.4, UF, 4.2, 0);
  // nightstands + lamp
  for (const z of [1.95, 4.45]) {
    b.box('wood', 0.02, UF, z - 0.24, 0.48, UF + 0.52, z + 0.24, C.midWood, { r: 0.02 });
    b.box('woodGloss', 0.02, UF + 0.52, z - 0.26, 0.5, UF + 0.56, z + 0.26, C.darkWood, { r: 0.012 });
    b.box('gloss', 0.48, UF + 0.3, z - 0.18, 0.49, UF + 0.44, z + 0.18, 0xc89563, { r: 0.005 });
    b.sphere('metal', null, 0.5, UF + 0.37, z, 0.016, C.brass);
    col(null, 0.02, UF, z - 0.26, 0.5, UF + 0.56, z + 0.26);
  }
  {
    const x = 0.25, z = 1.95;
    b.lathe('ceramic', null, x, UF + 0.56, z, [[0, 0], [0.07, 0], [0.09, 0.1], [0.05, 0.2], [0.02, 0.24], [0, 0.24]], 0xe8b54a, { radial: 16 });
    b.lathe('glowShade', null, x, UF + 0.78, z, [[0.14, 0], [0.09, 0.17]], 0xfff1d6, { radial: 20, cast: false });
    lamps.push({ pos: V(x + 0.1, UF + 0.9, 3.2), color: 0xffa850, intensity: 5, distance: 8, prio: 1, room: 'bedroom' });
    halos.push([x, UF + 0.86, z, 0.6]);
    // second lamp + alarm clock on the other nightstand
    b.lathe('ceramic', null, x, UF + 0.56, 4.45, [[0, 0], [0.07, 0], [0.09, 0.1], [0.05, 0.2], [0.02, 0.24], [0, 0.24]], 0xe8b54a, { radial: 16 });
    b.lathe('glowShade', null, x, UF + 0.78, 4.45, [[0.14, 0], [0.09, 0.17]], 0xfff1d6, { radial: 20, cast: false });
    b.box('gloss', 0.3, UF + 0.56, 4.6, 0.42, UF + 0.66, 4.68, 0xd2513e, { r: 0.025 });
  }
  // wardrobe (back wall)
  {
    const x0 = 0.3, x1 = 1.7, z0 = 6.3, z1 = 6.9, h = 2.1;
    b.box('wood', x0, UF, z0, x1, UF + h, z1, C.midWood, { r: 0.02 });
    b.box('woodGloss', x0 - 0.03, UF + h, z0 - 0.03, x1 + 0.03, UF + h + 0.06, z1, C.darkWood, { r: 0.015 });
    for (const [a, c] of [[x0 + 0.04, (x0 + x1) / 2 - 0.01], [(x0 + x1) / 2 + 0.01, x1 - 0.04]]) {
      b.box('wood', a, UF + 0.1, z0 - 0.015, c, UF + h - 0.06, z0, 0xc89563, { r: 0.01 });
      b.box('wood', a + 0.08, UF + 0.25, z0 - 0.025, c - 0.08, UF + h - 0.25, z0 - 0.015, 0xd6a571, { r: 0.008 });
    }
    b.cyl('metal', null, (x0 + x1) / 2 - 0.06, UF + 1.1, z0 - 0.03, 0.012, 0.012, 0.18, C.brass, { radial: 8 });
    b.cyl('metal', null, (x0 + x1) / 2 + 0.06, UF + 1.1, z0 - 0.03, 0.012, 0.012, 0.18, C.brass, { radial: 8 });
    col('wardrobe', x0, UF, z0, x1, UF + h + 0.06, z1);
    // a box on top
    b.box('paint', x0 + 0.2, UF + h + 0.06, z0 + 0.1, x0 + 0.65, UF + h + 0.3, z1 - 0.05, 0xc9a271, { r: 0.01 });
  }
  // Jon's dresser (the 'dresser' prop draws the chest + drawers; collider + mirror + knick-knacks stay here)
  {
    const x0 = 3.5, x1 = 4.7, z0 = 6.4, z1 = 6.9, h = 0.85;
    anchor('dresser', (x0 + x1) / 2, UF, z0, Math.PI, { w: x1 - x0, d: z1 - z0, h });
    anchor('sockDrawer', (x0 + x1) / 2, UF + 0.62, z0 - 0.2, Math.PI);
    anchor('breakDrawer', (x0 + x1) / 2, UF + 0.12, z0 - 0.3, Math.PI);
    b.box('woodGloss', 3.75, UF + h + 0.04, z1 - 0.04, 4.45, UF + h + 0.86, z1, C.darkWood, { r: 0.02 });
    b.box('metal', 3.8, UF + h + 0.09, z1 - 0.045, 4.4, UF + h + 0.81, z1 - 0.04, 0xdde6ea);
    col('drawers', x0 - 0.02, UF, z0 - 0.03, x1 + 0.02, UF + h + 0.04, z1);
    // trophy + photo frame on top (Jon's knick-knacks)
    b.lathe('metal', null, 3.75, UF + h + 0.04, 6.6, [[0, 0], [0.05, 0], [0.05, 0.03], [0.015, 0.05], [0.015, 0.12], [0.06, 0.18], [0.06, 0.22], [0, 0.2]], 0xe8b54a, { radial: 14 });
  }
  // bedroom rug
  {
    const g = new THREE.PlaneGeometry(2.4, 1.7);
    g.rotateX(-Math.PI / 2);
    b.geom('rugBed', g, new THREE.Matrix4().makeTranslation(2.85, UF + 0.004, 3.2), 0xffffff, { uv: 'keep', cast: false });
  }
  plant(5.8, UF, 0.4, 0.6);
  // desk + chair + old computer by the front wall (cat can climb chair → desk)
  {
    const x0 = 0.75, x1 = 2.05, z0 = 0.02, z1 = 0.62, top = UF + 0.74;
    b.box('woodGloss', x0, top - 0.04, z0, x1, top, z1, C.midWood, { r: 0.015 });
    b.box('wood', x0 + 0.03, UF, z0 + 0.03, x0 + 0.45, top - 0.04, z1 - 0.03, C.midWood, { r: 0.01 });
    for (let i = 0; i < 3; i++) {
      b.box('woodGloss', x0 + 0.05, UF + 0.06 + i * 0.21, z1 - 0.035, x0 + 0.43, UF + 0.24 + i * 0.21, z1 - 0.02, 0xc89563, { r: 0.008 });
      b.sphere('metal', null, x0 + 0.24, UF + 0.15 + i * 0.21, z1 - 0.015, 0.014, C.brass);
    }
    for (const x of [x1 - 0.06]) for (const z of [z0 + 0.06, z1 - 0.06]) b.box('wood', x - 0.03, UF, z - 0.03, x + 0.03, top - 0.04, z + 0.03, C.midWood);
    col('desk', x0, UF, z0, x1, top, z1);
    // CRT monitor + keyboard + lamp
    b.box('gloss', 1.25, top, 0.12, 1.7, top + 0.36, 0.48, 0xe6dcc8, { r: 0.05 });
    b.box('screen', 1.31, top + 0.06, 0.479, 1.64, top + 0.31, 0.49, 0xffffff, { r: 0.02, cast: false });
    b.box('gloss', 1.22, top, 0.5, 1.72, top + 0.025, 0.6, 0xe6dcc8, { r: 0.008 });
    b.cyl('metal', null, 0.95, top + 0.2, 0.25, 0.012, 0.012, 0.4, 0xd2513e, { radial: 6 });
    b.lathe('gloss', null, 0.95, top + 0.33, 0.33, [[0.0, 0.08], [0.05, 0.07], [0.09, 0.0]], 0xd2513e, { radial: 14 });
    // chair
    const f = frameAt(1.5, UF, 1.0, Math.PI);
    b.lbox('woodGloss', f, 0, 0.45, 0, 0.44, 0.04, 0.42, C.midWood, { r: 0.015 });
    b.lbox('fabric', f, 0, 0.48, 0, 0.4, 0.03, 0.38, 0x5d8fb0, { r: 0.012 });
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) b.lbox('wood', f, x, 0.22, z, 0.035, 0.44, 0.035, C.midWood);
    b.lbox('woodGloss', f, 0, 0.75, -0.19, 0.42, 0.3, 0.035, C.midWood, { r: 0.015 });
    col('deskChair', 1.28, UF, 0.79, 1.72, UF + 0.47, 1.21);
  }
  // toy box + laundry basket + reading lamp corner
  {
    b.box('paint', 5.4, UF, 6.35, 6.2, UF + 0.45, 6.88, 0x6f9a8a, { r: 0.03 });
    b.box('paint', 5.38, UF + 0.45, 6.33, 6.22, UF + 0.5, 6.9, 0xe2a65a, { r: 0.02 });
    col('toybox', 5.38, UF, 6.33, 6.22, UF + 0.5, 6.9);
    b.lathe('fabric', null, 2.5, UF, 6.5, [[0, 0], [0.2, 0], [0.24, 0.42], [0.25, 0.44], [0, 0.42]], 0xd8c49a, { radial: 18 });
    b.sphere('fabric', null, 2.48, UF + 0.44, 6.5, 0.18, 0x5d8fb0, { scale: [1, 0.35, 1] });
    col('basket', 2.25, UF, 6.25, 2.75, UF + 0.44, 6.75);
  }
  // bedroom wall pictures + shelf
  b.box('woodGloss', 0, UF + 1.7, 5.0, 0.24, UF + 1.73, 5.9, C.midWood, { r: 0.008 });
  for (let i = 0; i < 6; i++) b.box('paint', 0.04, UF + 1.73, 5.05 + i * 0.07, 0.2, UF + 1.95 + (i % 3) * 0.03, 5.1 + i * 0.07, [0xd2513e, 0x3f6e9a, 0xe8b54a, 0x5c8a4e, 0x7d4a8a, 0xe4d6b8][i], { r: 0.003 });
  // bedroom ceiling lamp (flush)
  b.lathe('glowShade', null, 3.2, CEIL2 - 0.12, 3.4, [[0.0, 0], [0.18, 0.02], [0.25, 0.1], [0.25, 0.12]], 0xfff1d6, { radial: 24, cast: false });
  // landing runner
  b.box('fabric', 6.75, UF, 1.0, 7.65, UF + 0.008, 6.3, 0x9a3a32, { r: 0.004, cast: false });
  b.box('fabric', 6.82, UF + 0.008, 1.07, 7.58, UF + 0.011, 6.23, 0xd9b26a, { r: 0.004, cast: false });
  // landing: small table + bathroom door (decor, always closed)
  {
    b.box('wood', 6.6, UF, 6.4, 7.4, UF + 0.75, 6.88, C.midWood, { r: 0.02 });
    col(null, 6.6, UF, 6.4, 7.4, UF + 0.75, 6.88);
    plantPot(7.0, UF + 0.75, 6.65, 0.3);
    // landing ceiling light
    b.lathe('glowShade', null, 7.8, CEIL2 - 0.1, 3.0, [[0.0, 0], [0.14, 0.02], [0.2, 0.08], [0.2, 0.1]], 0xfff1d6, { radial: 20, cast: false });
    lamps.push({ pos: V(7.8, CEIL2 - 0.4, 3.0), color: 0xffb870, intensity: 5, distance: 8, prio: 0, room: 'landing' });
    halos.push([7.8, CEIL2 - 0.12, 3.0, 0.7]);
  }

  // ---------- upstairs: Lyman's room (x 0..W, z 7.1..D; door from the landing) ----------
  b.layer = 'upper';
  {
    const dz = 7.1, dc = (LY_DOOR[0] + LY_DOOR[1]) / 2;
    anchor('lymanDoor', dc, UF, dz - 0.1, 0, { w: LY_DOOR[1] - LY_DOOR[0], h: 2.05 });
    anchor('lymanDoorOut', dc, UF, 6.3, Math.PI);
    anchor('lymanInside', dc - 0.3, UF, 8.1, Math.PI);
    anchor('lymanRoom', 4.6, UF, 9.0, 0);
    anchor('lymanBed', 1.0, UF, 9.3, Math.PI / 2, { w: 1.0, l: 2.0, top: UF + 0.55 });
    anchor('suitcaseSpot', 2.55, UF, 8.15, -Math.PI / 2);
    anchor('odieBed', 4.9, UF, 10.0, Math.PI);
    anchor('cam_lymanRoom', 7.6, UF + 1.9, 7.6, 0, {});
    anchors.get('cam_lymanRoom').look = V(2.2, UF + 0.4, 10.0);
    anchors.get('cam_lymanRoom').fov = 60;
    // pine single bed with round knob posts + pastel striped blanket (refs/lyman_bedroom.png), headboard on the left wall
    const bx0 = 0.02, bx1 = 2.02, bz0 = 8.8, bz1 = 9.8, pine = 0xd9a466;
    b.box('woodGloss', bx0 + 0.05, UF + 0.14, bz0, bx1, UF + 0.32, bz1, pine, { r: 0.03 });
    for (const [x, z, h] of [[bx0 + 0.05, bz0 + 0.02, 1.0], [bx0 + 0.05, bz1 - 0.02, 1.0], [bx1 - 0.04, bz0 + 0.02, 0.72], [bx1 - 0.04, bz1 - 0.02, 0.72]]) {
      b.cyl('woodGloss', null, x, UF + h / 2, z, 0.04, 0.045, h, pine, { radial: 12 });
      b.sphere('woodGloss', null, x, UF + h + 0.04, z, 0.06, pine);
    }
    b.box('woodGloss', bx0 + 0.02, UF + 0.35, bz0 + 0.04, bx0 + 0.08, UF + 0.86, bz1 - 0.04, pine, { r: 0.025 });
    b.geom('woodGloss', new THREE.CylinderGeometry(0.2, 0.2, 0.06, 24), new THREE.Matrix4().makeTranslation(bx0 + 0.05, UF + 0.84, (bz0 + bz1) / 2).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 1, 2.2)), pine);
    b.box('woodGloss', bx1 - 0.07, UF + 0.3, bz0 + 0.04, bx1 - 0.01, UF + 0.6, bz1 - 0.04, pine, { r: 0.02 });
    b.box('fabric', bx0 + 0.1, UF + 0.32, bz0 + 0.03, bx1 - 0.08, UF + 0.48, bz1 - 0.03, 0xf6f0e2, { r: 0.05 });
    // blanket: stripes across the bed (peach, sage, cream, rose, blue-grey), draped over the sides
    {
      const cols = [0xf2b48a, 0xb8c89a, 0xf6ead0, 0xe89a8a, 0xa8b8c4, 0xf2c890];
      const x0 = 0.55, x1 = 1.98, n = 12;
      for (let i = 0; i < n; i++) {
        const xa = x0 + (x1 - x0) * i / n, xc = x0 + (x1 - x0) * (i + 1) / n, c = cols[i % cols.length];
        b.box('fabric', xa, UF + 0.48, bz0 - 0.02, xc, UF + 0.54, bz1 + 0.02, c, { r: 0.01 });
        for (const zz of [bz0 - 0.05, bz1 + 0.02]) b.box('fabric', xa, UF + 0.22, zz, xc, UF + 0.53, zz + 0.03, c, { cast: false });
      }
    }
    for (const z of [9.08, 9.52]) b.lbox('fabric', null, 0.3, UF + 0.57, z, 0.3, 0.12, 0.42, 0xfbf3e2, { r: 0.055, rot: [0, 0, -0.3] });
    col('lymanBed', bx0, UF, bz0, bx1, UF + 0.55, bz1);
    col('lymanHeadboard', bx0, UF, bz0, bx0 + 0.09, UF + 1.1, bz1);
    // pine nightstand (two drawers) + cream lamp
    b.box('woodGloss', 0.02, UF, 10.0, 0.5, UF + 0.56, 10.46, pine, { r: 0.02 });
    for (const y of [0.12, 0.33]) { b.box('woodGloss', 0.5, UF + y, 10.04, 0.515, UF + y + 0.18, 10.42, 0xe2b276, { r: 0.008 }); b.sphere('woodGloss', null, 0.53, UF + y + 0.09, 10.23, 0.018, 0xb98256); }
    col('lymanNightstand', 0.02, UF, 9.98, 0.5, UF + 0.56, 10.48);
    b.lathe('ceramic', null, 0.25, UF + 0.56, 10.23, [[0, 0], [0.07, 0], [0.095, 0.08], [0.07, 0.17], [0.025, 0.22], [0, 0.22]], 0xf2c48a, { radial: 16 });
    b.lathe('glowShade', null, 0.25, UF + 0.76, 10.23, [[0.15, 0], [0.1, 0.18]], 0xfff1d6, { radial: 20, cast: false });
    lamps.push({ pos: V(0.6, UF + 1.0, 9.6), color: 0xffa850, intensity: 5, distance: 8, prio: 2, room: 'lyman' });
    halos.push([0.25, UF + 0.86, 10.23, 0.6]);
    // old wardrobe on the back wall + stacked moving boxes by the door + a chair with a jacket
    {
      const x0 = 5.5, x1 = 6.7, z0 = 10.45, z1 = D;
      b.box('wood', x0, UF, z0, x1, UF + 1.9, z1, 0xc98a52, { r: 0.02 });
      b.box('woodGloss', x0 - 0.03, UF + 1.9, z0 - 0.03, x1 + 0.03, UF + 1.96, z1, C.darkWood, { r: 0.015 });
      for (const [a, c] of [[x0 + 0.04, (x0 + x1) / 2 - 0.01], [(x0 + x1) / 2 + 0.01, x1 - 0.04]]) b.box('wood', a, UF + 0.1, z0 - 0.015, c, UF + 1.84, z0, 0xd9a466, { r: 0.01 });
      b.sphere('metal', null, (x0 + x1) / 2 - 0.06, UF + 1.0, z0 - 0.03, 0.02, C.brass);
      b.sphere('metal', null, (x0 + x1) / 2 + 0.06, UF + 1.0, z0 - 0.03, 0.02, C.brass);
      col('lymanWardrobe', x0, UF, z0, x1, UF + 1.96, z1);
    }
    for (const [x0, z0, w, d, h, c] of [[8.45, 10.3, 0.62, 0.55, 0.42, 0xc9a271], [8.5, 10.35, 0.5, 0.44, 0.34, 0xb98a5a], [8.6, 9.6, 0.5, 0.5, 0.4, 0xd2b07e]]) {
      const y0 = c === 0xb98a5a ? UF + 0.42 : UF;
      b.box('paint', x0, y0, z0, x0 + w, y0 + h, z0 + d, c, { r: 0.012 });
      b.box('paint', x0 + w * 0.47, y0 + h, z0 - 0.002, x0 + w * 0.53, y0 + h + 0.003, z0 + d + 0.002, 0xe8d8a8, { cast: false });
    }
    col('lymanBoxes', 8.45, UF, 9.6, W, UF + 0.76, 10.85);
    // coat rack with Lyman's grey coat, beside the window
    {
      const x = 4.6, z = 10.6;
      b.cyl('woodGloss', null, x, UF + 0.85, z, 0.025, 0.03, 1.7, 0xc98a52, { radial: 10 });
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; b.cyl('woodGloss', null, x + Math.cos(a) * 0.17, UF + 0.04, z + Math.sin(a) * 0.17, 0.018, 0.018, 0.36, 0xc98a52, { radial: 8, rot: [Math.sin(a) * 1.35, 0, -Math.cos(a) * 1.35] }); }
      for (let i = 0; i < 3; i++) { const a = i * 2.1; b.cyl('woodGloss', null, x + Math.cos(a) * 0.08, UF + 1.68, z + Math.sin(a) * 0.08, 0.014, 0.014, 0.22, 0xc98a52, { radial: 8, rot: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] }); b.sphere('woodGloss', null, x + Math.cos(a) * 0.16, UF + 1.76, z + Math.sin(a) * 0.16, 0.022, 0xc98a52); }
      b.lbox('fabric', null, x - 0.02, UF + 1.28, z - 0.08, 0.34, 0.68, 0.12, 0x8a8f92, { r: 0.05, rot: [0.08, 0.2, 0.04] });
      b.lbox('fabric', null, x - 0.02, UF + 1.6, z - 0.08, 0.2, 0.12, 0.14, 0x7a7f82, { r: 0.05 });
      col('coatRack', x - 0.2, UF, z - 0.2, x + 0.2, UF + 1.8, z + 0.2, 'solid', { decor: true });
    }
    // floor clutter: chew bone + stray socks
    b.lbox('ceramic', null, 3.1, UF + 0.02, 8.3, 0.2, 0.035, 0.04, 0xf3e6c8, { r: 0.017, rot: [0, 0.6, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sphere('ceramic', null, 3.1 + Math.cos(0.6) * sx * 0.1 + Math.sin(0.6) * sz * 0.025, UF + 0.025, 8.3 - Math.sin(0.6) * sx * 0.1 + Math.cos(0.6) * sz * 0.025, 0.028, 0xf3e6c8);
    b.lbox('fabric', null, 2.6, UF + 0.012, 7.75, 0.2, 0.025, 0.08, 0x8a8f92, { r: 0.012, rot: [0, -0.4, 0] });
    b.lbox('fabric', null, 6.3, UF + 0.012, 8.4, 0.18, 0.025, 0.08, 0xa8b8c4, { r: 0.012, rot: [0, 0.9, 0] });
    // rug + round dog cushion for Odie
    {
      const g = new THREE.PlaneGeometry(2.2, 1.5);
      g.rotateX(-Math.PI / 2);
      b.geom('rugBed', g, new THREE.Matrix4().makeTranslation(4.2, UF + 0.004, 9.0), 0xffffff, { uv: 'keep', cast: false });
      b.lathe('fabric', null, 4.9, UF, 10.0, [[0, 0.04], [0.28, 0.035], [0.38, 0.08], [0.42, 0.16], [0.4, 0.22], [0.33, 0.23], [0.28, 0.12], [0, 0.07]], 0xcdb48e, { radial: 24 });
      // plush toy dog in the dog bed
      b.sphere('fabric', null, 4.95, UF + 0.14, 10.0, 0.08, 0xa8703e, { scale: [1, 0.85, 1.2] });
      b.sphere('fabric', null, 4.95, UF + 0.24, 9.92, 0.065, 0xa8703e);
      for (const sx of [-1, 1]) b.sphere('fabric', null, 4.95 + sx * 0.06, UF + 0.24, 9.92, 0.03, 0x6a4024, { scale: [0.6, 1.4, 0.8] });
      b.sphere('fabric', null, 4.95, UF + 0.23, 9.86, 0.03, 0xe8cfa8);
    }
    // simple curtains at the back window
    for (const x of [2.85, 3.95]) b.lbox('fabric', null, x, UF + 1.5, D - 0.07, 0.3, 1.15, 0.04, 0xf2e2c4, { r: 0.015, cast: false });
    b.cyl('metal', null, 3.4, UF + 2.1, D - 0.06, 0.012, 0.012, 1.6, C.brass, { rot: [0, 0, Math.PI / 2], radial: 8 });
    // ceiling light
    b.lathe('glowShade', null, 4.6, CEIL2 - 0.12, 9.0, [[0.0, 0], [0.16, 0.02], [0.22, 0.09], [0.22, 0.11]], 0xfff1d6, { radial: 22, cast: false });
  }

  // ---------- Chapter Two anchors ----------
  anchor('lymanChair', 3.27, 0, 8.8, Math.PI / 2);
  anchor('lymanSeat', 3.29, 0.46, 8.8, Math.PI / 2);
  anchor('plateSpot2', 3.9, 0.76, 8.8, Math.PI / 2);
  anchor('soupSpot', 4.4, 0.76, 8.58, 0);
  anchor('odieBowl', 7.35, 0, 9.75, Math.PI);
  anchor('sofaSeatL', 3.78, 0.49, 2.3, -Math.PI / 2);
  anchor('sofaSeatR', 3.78, 0.49, 3.2, -Math.PI / 2);
  anchor('sofaFoot', 3.0, 0, 2.75, -Math.PI / 2);
  anchor('oldTvSpot', 1.17, 0.012, 2.75, Math.PI / 2);
  anchor('carpet', 1.17, 0, 2.85, -Math.PI / 2, { w: 1.7, d: 0.9 });
  anchor('carpetEdge', 1.12, 0, 3.98, Math.PI);
  anchor('tvBoxSpot', 5.6, 0, 1.3, Math.PI);
  anchor('mugSpot', 1.88, 0.42, 2.45, 0);
  anchor('doorStep', 7.1, 0, -0.95, 0);
  anchor('doorInside', 7.1, 0, 1.0, Math.PI);
  anchor('furPileSpot', 5.6, 0, 3.2, 0);
  anchor('whistleSpot', 2.75, UF, 5.35, 0.6);
  anchor('arenaCentre', 4.1, UF, 4.0, 0);
  anchor('arenaBounds', 4.1, UF, 4.0, 0, { min: V(2.35, UF, 2.15), max: V(5.85, UF, 5.8) });
  anchor('shedBed', 1.05, UF + 0.62, 3.2, Math.PI / 2);
  anchor('shedSofa', 3.85, 0.5, 2.75, -Math.PI / 2);
  anchor('shedArmchair', 4.45, 0.49, 0.95, -Math.PI / 2 + 0.25);
  anchor('shedTable', 4.4, 0.765, 8.8, 0);
  // extra anchors for the game lane (Ch2 levels)
  anchor('odieTableEdge', 4.4, 0.76, 8.45, Math.PI);
  anchor('odieSill', 2.55, 0, 0.78, Math.PI);
  anchor('odieTableSide', 4.4, 0, 7.55, Math.PI);
  anchor('wallBelowWindow', 3.0, 0.5, 0.52, 0);
  anchor('outsideWindow', 3.0, -0.3, -3.6, Math.PI);
  anchor('tvFloorSpot', 1.17, 0.012, 2.75, Math.PI / 2);
  anchor('deliverySpot', 7.1, 0, -0.95, 0);
  anchor('lymanSpawn', 7.1, 0, -0.95, 0);
  const cam = (n, p, l, fov) => anchor(n, p[0], p[1], p[2], Math.atan2(l[0] - p[0], l[2] - p[2]), { look: V(...l), fov });
  cam('cam_frontDoorIn', [5.6, 1.55, 3.4], [7.1, 1.0, 0.0], 55);
  cam('cam_sofa', [1.2, 1.4, 1.2], [3.8, 0.7, 2.75], 55);
  cam('cam_cupboard', [6.2, 1.1, 2.0], [8.4, 0.5, 3.0], 55);
  cam('cam_dresser', [4.1, UF + 1.4, 4.4], [4.1, UF + 0.6, 6.5], 55);
  cam('cam_arena', [6.0, UF + 2.0, 1.0], [3.8, UF + 0.2, 4.4], 62);
  cam('cam_lymanDoor', [7.4, UF + 1.6, 4.6], [8.2, UF + 1.0, 7.1], 55);
  const holes = [[0, 1.42, Math.PI / 2], [W, 6.85, -Math.PI / 2], [5.55, 5.4, Math.PI], [6.95, D, Math.PI]];
  holes.forEach(([x, z, r], i) => anchor('mouseHole' + i, x, 0, z, r));
  anchors.set('mouseHoles', holes.map((_, i) => anchors.get('mouseHole' + i)));
  const cheese = [[0.55, 1.42], [8.6, 6.85], [5.55, 4.85], [6.95, 10.45], [2.0, 6.2], [6.2, 2.0]];
  cheese.forEach(([x, z], i) => anchor('cheese' + i, x, 0, z, 0));
  anchors.set('cheeseSpots', cheese.map((_, i) => anchors.get('cheese' + i)));

  // ---------- pictures ----------
  const pics = [
    // [x, y, z, rotY, w, h, artIndex, layer]
    [1.1, 1.75, 5.4, Math.PI, 0.7, 0.5, 0, 'ground'],
    [6.0, 1.65, 0, 0, 0.0, 0, -1, 'ground'],
    [0, 1.7, 1.3, Math.PI / 2, 0.55, 0.7, 1, 'ground'],
    [5.55, 1.7, 5.4, Math.PI, 0.5, 0.4, 2, 'ground'],
    [W, 1.75, 6.5, -Math.PI / 2, 0.6, 0.45, 3, 'ground'],
    [0, UF + 1.55, 3.2, Math.PI / 2, 1.0, 0.6, 4, 'upper'],
    [3.0, UF + 1.6, 6.9, Math.PI, 0.45, 0.6, 5, 'upper'],
    [W, UF + 1.6, 5.8, -Math.PI / 2, 0.6, 0.45, 6, 'upper'],
    [6.9, 2.38, 5.6, 0, 0.42, 0.27, 7, 'ground'],
    // Lyman's room
    [0, UF + 1.55, 9.3, Math.PI / 2, 0.8, 0.5, 4, 'upper'],
    [7.4, UF + 1.6, D, Math.PI, 0.45, 0.6, 1, 'upper'],
  ];
  for (const [x, y, z, ry, w, h, art, layer] of pics) {
    if (art < 0) continue;
    b.layer = layer;
    const f = frameAt(x, y, z, ry);
    const fw = 0.045;
    b.lbox('woodGloss', f, 0, h / 2 + fw / 2, 0.02, w + fw * 2, fw, 0.035, C.darkWood, { r: 0.008, cast: false });
    b.lbox('woodGloss', f, 0, -h / 2 - fw / 2, 0.02, w + fw * 2, fw, 0.035, C.darkWood, { r: 0.008, cast: false });
    b.lbox('woodGloss', f, -w / 2 - fw / 2, 0, 0.02, fw, h, 0.035, C.darkWood, { r: 0.008, cast: false });
    b.lbox('woodGloss', f, w / 2 + fw / 2, 0, 0.02, fw, h, 0.035, C.darkWood, { r: 0.008, cast: false });
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv, cu = art % 4, cv = (art / 4) | 0;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cu + uv.getX(i)) / 4, 1 - (cv + 1 - uv.getY(i)) / 2);
    b.geom('art', g, f.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.012)), 0xffffff, { uv: 'keep', cast: false });
    col(null, ...((Math.abs(Math.sin(ry)) > 0.5)
      ? [x - 0.05, y - h / 2 - fw, z - w / 2 - fw, x + 0.05, y + h / 2 + fw, z + w / 2 + fw]
      : [x - w / 2 - fw, y - h / 2 - fw, z - 0.05, x + w / 2 + fw, y + h / 2 + fw, z + 0.05]), 'solid', { decor: true, noWalk: true });
  }

  // ---------- contact shadow blobs ----------
  const blob = (x, y, z, sx, sz, op = 1) => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    b.geom('blob', g, new THREE.Matrix4().makeTranslation(x, y + 0.006, z).multiply(new THREE.Matrix4().makeScale(sx, 1, sz)), 0xffffff, { uv: 'keep', cast: false, ao: false, receive: false });
  };
  b.layer = 'ground';
  blob(3.85, 0, 2.75, 1.5, 2.6); blob(4.45, 0, 0.95, 1.25, 1.25); blob(0.38, 0, 2.75, 0.9, 1.6);
  blob(2.05, 0, 2.75, 1.25, 1.65); blob(3.85, 0, 4.1, 0.75, 0.75); blob(0.45, 0, 0.45, 0.5, 0.5);
  blob(4.4, 0, 8.8, 2.1, 1.5); blob(4.4, 0, 9.62, 1.6, 0.6); blob(4.4, 0, 7.98, 0.75, 0.75); blob(5.68, 0, 10.55, 1.2, 1.1);
  blob(W - 0.24, 0, 9.85, 0.9, 1.9); blob(3.0, 0, 0.3, 1.9, 0.8); blob(0.2, 0, 4.7, 0.7, 1.4); blob(W - 0.35, 0, 5.95, 0.6, 0.6);
  b.layer = 'upper';
  blob(1.05, UF, 3.2, 2.7, 2.1); blob(1.4, UF, 0.45, 1.8, 0.9); blob(1.5, UF, 1.0, 0.7, 0.7); blob(5.8, UF, 6.6, 1.1, 0.8); blob(1.0, UF, 6.6, 1.8, 1.0); blob(4.1, UF, 6.65, 1.6, 0.8); blob(4.6, UF, 1.3, 1.0, 1.0);
  blob(1.02, UF, 9.3, 2.4, 1.4); blob(6.1, UF, 10.72, 1.5, 0.8); blob(0.25, UF, 10.23, 0.7, 0.7); blob(8.8, UF, 10.2, 1.0, 1.4);

  function leaf(x, y, z, yaw, tilt, len, wid, color) {
    const g = new THREE.SphereGeometry(1, 10, 6);
    const m = new THREE.Matrix4().makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(-tilt))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, len * 0.5))
      .multiply(new THREE.Matrix4().makeScale(wid, 0.018, len * 0.5));
    b.geom('gloss', g, m, color);
  }
  function plant(x, y, z, h) {
    b.lathe('ceramic', null, x, y, z, [[0, 0], [0.13, 0], [0.17, 0.26], [0.19, 0.27], [0.19, 0.3], [0.16, 0.3], [0, 0.28]], 0xc96d3b, { radial: 18 });
    b.cyl('paint', null, x, y + 0.275, z, 0.16, 0.16, 0.01, 0x5a3a24, { radial: 16 });
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, t = i / n;
      const stemH = h * (0.25 + 0.75 * ((i * 7) % 5) / 4);
      const lx = x + Math.sin(a) * 0.04, lz = z + Math.cos(a) * 0.04;
      b.cyl('gloss', null, lx, y + 0.28 + stemH / 2, lz, 0.006, 0.008, stemH, 0x5a8a3a, { radial: 4, cast: false });
      leaf(lx, y + 0.28 + stemH, lz, a, 0.15 + t * 0.7, 0.22 + 0.1 * ((i * 3) % 4) / 3, 0.07, i % 3 ? 0x4f8f3e : 0x67a84a);
    }
    col(null, x - 0.18, y, z - 0.18, x + 0.18, y + 0.3, z + 0.18);
  }
  function plantPot(x, y, z, s) {
    b.lathe('ceramic', null, x, y, z, [[0, 0], [0.06 * s / 0.18, 0], [0.08 * s / 0.18, 0.1 * s / 0.18], [0, 0.1 * s / 0.18]], 0xc96d3b, { radial: 12 });
    for (let i = 0; i < 5; i++) b.sphere('gloss', null, x + Math.cos(i * 1.3) * 0.04 * s / 0.18, y + 0.14 * s / 0.18, z + Math.sin(i * 1.3) * 0.04 * s / 0.18, 0.055 * s / 0.18, 0x5f9a4a, { scale: [1, 0.6, 1], ws: 8, hs: 6 });
  }

  const group = b.build('house');
  const extGroup = ext.build('houseExterior');
  group.traverse(o => { if (o.isMesh && /:(paint|wallpaperLiving|wainscot|kitchenWall|bedroomWall|checker|woodFloor|carpet|siding)$/.test(o.name)) camBlockers.push(o); });
  return { group, extGroup, colliders, anchors, lamps, halos, camBlockers };
}
