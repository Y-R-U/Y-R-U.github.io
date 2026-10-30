// Fantasy Bishop — "Wizard" (polish rebuild). A robed wizard: a long ivory/ebony coat split open
// below the belt over a side-colour underrobe, a stole hanging either side of a long beard, a
// floor-length mantle with a gold border and a rolled hood, wide bell sleeves with gold cuffs, a
// gold belt with a buckle, a spellbook held at the hip, and a staff with a crescent cradling a
// glowing orb. The face is a fine-cell sculpt (face.js) under a wide-brimmed hat pushed back on
// the head so the face reads at an angle.
// Cloth is drape shells (drape.js: crisp gold borders); arms/sleeves/hands are a small SDF sculpt;
// hat, slot, belt, book and staff are plain geometry. One material per side (common.js).
// Overhead read (MODEL_GUIDE §4): the hat brim (a disc) crossed by the bishop's SLOT — a thin,
// constant-width dark line running front to back over the crown (crisp from straight above) — with
// a gold tip bead and the staff orb beside it.
import { drape, rows, inBands } from './drape.js';
import { head } from './face.js';
import { PAL, rgb, mixRGB, scaleRGB, sstep, prep, paintAbs, plinth, assemble } from './common.js';

const U = (u, v, x = 0) => [x, v, -u];            // author in (u forward = -z, v up, x = figure's right)
const { sin, cos, abs, PI } = Math;
const BASE = 0.13, BELT = 0.405, NECK = 0.612;
const STAFF = { x: 0.19, u: 0.07 };
const HEAD = { u: 0.016, y: 0.652, R: 0.05 };
const HAT = { y: 0.683, u: -0.004, tilt: 0.14, s: 0.9 };

// coat radius (round sweep; the top is squashed front-to-back afterwards)
const COAT = [[BASE, 0.212], [0.2, 0.186], [0.3, 0.148], [BELT, 0.112], [0.48, 0.117], [0.55, 0.124], [0.585, 0.106], [NECK, 0.064]];
const rCoat = y => {
  for (let i = 1; i < COAT.length; i++) if (y <= COAT[i][0]) {
    const [y0, r0] = COAT[i - 1], [y1, r1] = COAT[i], t = (y - y0) / (y1 - y0);
    return r0 + (r1 - r0) * (t * t * (3 - 2 * t));
  }
  return COAT[COAT.length - 1][1];
};
const squash = y => 1 - 0.24 * sstep(0.44, 0.56, y);          // shoulders wider than deep
const openCoat = y => (y < 0.44 ? 0.56 * sstep(0.425, 0.15, y) : 0.4 * sstep(0.5, NECK, y));
const folds = (phi, y) => 0.011 * sin(phi * 9 + 0.6) * sstep(0.42, 0.16, y);

/**
 * A sleeve/arm segment as a lathe tube from a to b: prof = [[t, r], ...] along the segment.
 * open: hollow bell end (inner lip + dark inside). hang: the underside of the far end droops.
 */
function tube(THREE, kit, a, b, prof, { seg = 9, open = 0, hang = 0, paint } = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const pts = prof.map(([t, r]) => new THREE.Vector2(r, t * len));
  if (open) { const [, r] = prof[prof.length - 1]; pts.push(new THREE.Vector2(r - 0.006, len), new THREE.Vector2(r * 0.55, len - open)); }
  const g = prep(THREE, kit.lathe(pts, { segments: seg }), [1, 1, 1]);
  if (paint) paintAbs(g, (x, y, z) => paint(y / len, Math.hypot(x, z)));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(A.x, A.y, A.z);
  if (hang) {
    const p = g.attributes.position, dir = d.clone().normalize(), q = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < p.count; i++) {
      q.set(p.getX(i), p.getY(i), p.getZ(i)).sub(A);
      const t = q.dot(dir) / len; if (t < 0.45) continue;
      const rad = q.clone().addScaledVector(dir, -q.dot(dir)), under = Math.max(0, -rad.normalize().dot(up));
      p.setY(i, p.getY(i) - hang * ((t - 0.45) / 0.55) ** 1.5 * under);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Both arms: upper sleeve, elbow, wide bell forearm sleeve with a gold cuff, hand; rolled hood. */
function arms(THREE, kit, K) {
  const out = [];
  const sleeveCol = (t, r) => (t > 0.9 && r > 0.03 ? { c: K.trim, metal: 1 } : t > 0.97 ? K.lining : mixRGB(K.shade, K.body, 0.55 + 0.45 * t));
  const arm = (S, E, W, H, hang) => {
    out.push(tube(THREE, kit, S, E, [[-0.15, 0.03], [0, 0.043], [0.6, 0.041], [1.05, 0.038]], { seg: 9, paint: () => mixRGB(K.shade, K.body, 0.7) }));
    out.push(prep(THREE, kit.place(kit.sphere(0.039, 9, 6), { x: E[0], y: E[1], z: E[2] }), mixRGB(K.shade, K.body, 0.7)));
    out.push(tube(THREE, kit, E, W, [[0, 0.038], [0.45, 0.044], [0.8, 0.054], [1, 0.06]], { seg: 10, open: 0.04, hang, paint: sleeveCol }));
    out.push(prep(THREE, kit.place(kit.sphere(0.024, 8, 6), { x: H[0], y: H[1], z: H[2], sy: 1.15 }), K.hand));
  };
  arm(U(0, 0.555, 0.108), U(0.0, 0.468, 0.166), U(STAFF.u - 0.032, 0.497, STAFF.x - 0.04), U(STAFF.u, 0.5, STAFF.x - 0.012), 0.022);
  arm(U(0, 0.555, -0.108), U(-0.012, 0.452, -0.166), U(0.05, 0.398, -0.13), U(0.072, 0.385, -0.112), 0.02);
  // rolled hood behind the neck: a fat torus arc round the back
  const hood = prep(THREE, new THREE.TorusGeometry(0.072, 0.028, 5, 10, PI * 1.15), K.cloth);
  paintAbs(hood, (x, y, z) => mixRGB(K.deep, K.cloth, 0.5 + 0.5 * Math.max(0, z / 0.03)));
  kit.place(hood, { rx: -PI / 2, rz: PI / 2 - PI * 0.575 });
  kit.place(hood, { y: 0.597, z: 0.018, sz: 0.85 });
  out.push(hood);
  return out;
}

function coat(THREE, K) {
  const hem = [[BASE + 0.004, 0.152]];
  const ys = rows(BASE + 0.004, NECK, 6, hem);
  const n = ys.length, top = NECK, bot = BASE + 0.004;
  // the inner face repeats every outer row, so the end caps follow the (varying) opening edge exactly
  const sec = [...ys.map(y => [rCoat(y), y]), [rCoat(top), top], ...ys.slice().reverse().map(y => [rCoat(y) - 0.011, y]), [rCoat(bot), bot]];
  const c = drape(THREE, {
    sec, open: openCoat, cols: 15, band: 0.022, folds,
    paint: ({ row, edge, cap, y }) => {
      if (row >= n && !cap) return K.lining;                                   // inner face: side colour lining
      if (cap || edge < 0.023 || inBands(y, hem)) return { c: K.trim, metal: 1 };
      return mixRGB(K.shade, K.body, sstep(0.14, 0.42, y));
    },
  });
  for (const g of [c.body, ...c.caps]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * squash(p.getY(i)));
    g.computeVertexNormals();
  }
  return [c.body, ...c.caps];
}

/** Underrobe in the side colour: only the front panel shows through the coat's split. */
function underrobe(THREE, kit, K) {
  const b = [[0.17, 0.184], [0.205, 0.212]];
  const pts = rows(BASE - 0.002, 0.44, 4, b).map(y => new THREE.Vector2(rCoat(y) - 0.01 + (y < 0.2 ? 0.006 : 0), y));
  const g = prep(THREE, kit.lathe(pts, { segments: 8, phiStart: PI - 0.75, phiLength: 1.5 }), K.cloth);
  paintAbs(g, (x, y) => (inBands(y, b) ? { c: K.trim, metal: 1 } : mixRGB(K.deep, K.cloth, sstep(0.14, 0.4, y))));
  return g;
}

/** Mantle from the shoulders to the floor at the back: side colour, gold border, pale lining. */
function mantle(THREE, K) {
  const rM = y => rCoat(y) + 0.018 + 0.02 * sstep(0.45, 0.15, y);
  const bM = [[BASE + 0.004, 0.152]];
  const ys = rows(BASE + 0.004, 0.575, 7, bM);
  const sec = [...ys.map(y => [rM(y), y]), [0.1, 0.6], [0.086, 0.606], [0.086, 0.606], [0.078, 0.592],
    [rM(0.5) - 0.014, 0.5], [rM(0.3) - 0.014, 0.3], [rM(BASE) - 0.014, BASE + 0.004], [rM(BASE + 0.004), BASE + 0.004]];
  const n = ys.length + 2;
  const m = drape(THREE, {
    sec, open: y => 1.3 + 0.32 * sstep(0.32, 0.58, y), cols: 10, band: 0.035, z: 0.012,
    folds: (phi, y) => 0.024 * sin(phi * 6 + 0.3) * sstep(0.56, 0.18, y),
    paint: ({ row, edge, cap, y }) => {
      if (row >= n + 1 && !cap) return K.mantleLining;
      if (cap || edge < 0.036 || inBands(y, bM)) return { c: K.trim, metal: 1 };
      return mixRGB(K.deep, K.cloth, sstep(0.16, 0.56, y));
    },
  });
  for (const g of [m.body, ...m.caps]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, 0.012 + (p.getZ(i) - 0.012) * (1 - 0.26 * sstep(0.42, 0.58, y))); }
    g.computeVertexNormals();
  }
  return [m.body, ...m.caps];
}

/** Stole: two side-colour strips hanging from the neck either side of the beard, gold ends. */
function stole(THREE, kit, K) {
  const out = [];
  for (const s of [1, -1]) {
    const g = prep(THREE, new THREE.BoxGeometry(0.036, 1, 0.006, 1, 10, 1), K.cloth);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = 0.5 - p.getY(i);                                 // 0 at the neck … 1 at the end
      const y = 0.6 - v * 0.33, x = s * (0.04 + 0.012 * v) + p.getX(i);
      const r = rCoat(y) * squash(y);
      p.setXYZ(i, x, y, -Math.sqrt(Math.max(0, r * r - x * x)) - 0.006 + p.getZ(i) - 0.012 * sstep(0.45, 0.62, y));
    }
    g.computeVertexNormals();
    paintAbs(g, (x, y) => (y < 0.3 ? { c: K.trim, metal: 1 } : abs(y - 0.335) < 0.012 ? { c: K.trim, metal: 1 } : mixRGB(K.deep, K.cloth, sstep(0.3, 0.55, y))));
    out.push(g);
  }
  return out;
}

function belt(THREE, kit, K) {
  const r = rCoat(BELT) + 0.004;
  return [
    prep(THREE, kit.place(kit.torus(r, 0.011, 3, 20), { y: BELT, rx: PI / 2 }), K.trim, { metal: 1 }),
    prep(THREE, kit.place(kit.bevelBox(0.04, 0.034, 0.014, 0.004, 1), { y: BELT, z: -r - 0.006 }), K.trim, { metal: 1 }),
    prep(THREE, kit.place(kit.sphere(0.009, 6, 4), { y: BELT, z: -r - 0.014 }), K.gem, { glow: 0.6 }),
  ];
}

/** Spellbook held against the left hip: side-colour cover, ivory page edges, gold corners + clasp. */
function book(THREE, kit, K) {
  const t = { x: -0.118, y: 0.37, z: -0.118, ry: -1.0, rz: 0.1 };
  const cover = prep(THREE, kit.bevelBox(0.03, 0.112, 0.086, 0.005, 1), K.cover);
  const pages = prep(THREE, kit.place(kit.bevelBox(0.026, 0.1, 0.08, 0.002, 1), { x: 0.0, z: -0.008 }), K.pages);
  const band = prep(THREE, kit.place(kit.bevelBox(0.034, 0.016, 0.07, 0.003, 1), { z: 0.004 }), K.trim, { metal: 1 });
  const gem = prep(THREE, kit.place(kit.sphere(0.011, 6, 4), { x: -0.017, y: 0.02 }), K.gem, { glow: 0.55 });
  return [cover, pages, band, gem].map(g => kit.place(g, t));
}

/** Pointed hat: brim + crooked crown, side-colour band, the slot line, gold tip bead. Tilted back. */
function hat(THREE, kit, K) {
  const prof = kit.profile()
    .pt(0.0, 0.0).pt(0.14, 0.006).bez(0.168, 0.008, 0.182, -0.006, 2)
    .arc(0.18, 0.0, 0.0075, -60, 110, 2)
    .bez(0.15, 0.021, 0.096, 0.024, 2)
    .pt(0.092, 0.05).bez(0.078, 0.17, 0.046, 0.27, 6).bez(0.022, 0.34, 0.0, 0.39, 4);
  const g = prep(THREE, kit.lathe(prof.points(), { segments: 18 }), K.hat);
  paintAbs(g, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (y > 0.03 && y < 0.078 && r < 0.1) return y > 0.068 ? { c: K.trim, metal: 1 } : K.hatBand;
    if (r > 0.165 && y > -0.012) return { c: K.brimEdge, metal: K.w ? 1 : 0 };
    if (y < 0.008 && r < 0.17) return scaleRGB(K.hat, 0.55);                    // brim underside in shade
    return null;
  });
  // the slot: a constant-width ribbon lying on the brim top and the crown, front and back (x = 0 plane)
  const path = [[0.172, 0.0175], [0.13, 0.0225], [0.097, 0.0255], [0.093, 0.05]];
  for (const v of prof.points()) if (v.y > 0.06) path.push([v.x, v.y]);
  const W = 0.0105, lift = 0.0035;
  const pos = [], idx = [];
  const side = (sz) => {
    const base = pos.length / 3;
    for (let i = 0; i < path.length; i++) {
      const [r, y] = path[i], [r2, y2] = path[Math.min(path.length - 1, i + 1)], [r0, y0] = path[Math.max(0, i - 1)];
      let nx = y2 - y0, ny = -(r2 - r0); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;   // outward normal in (r,y)
      if (ny < 0) { nx = -nx; ny = -ny; }
      const rr = r + nx * lift, yy = y + ny * lift;
      pos.push(-W, yy, sz * rr, W, yy, sz * rr);
      if (i) { const a = base + (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  };
  side(-1); side(1);
  const slot = new THREE.BufferGeometry();
  slot.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  slot.setIndex(idx);
  const sl = prep(THREE, slot.toNonIndexed(), K.slot, { glow: K.slotGlow });
  fixUp(sl);
  const bead = prep(THREE, kit.place(kit.sphere(0.022, 8, 6), { y: 0.39 }), K.trim, { metal: 1 });
  const parts = [g, sl, bead];
  // crook the tip backward (+z) so the silhouette is a wizard's, not a dunce cap
  for (const m of parts) {
    const p = m.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y < 0.17) continue;
      const t = (y - 0.17) / 0.22;
      p.setZ(i, p.getZ(i) + 0.085 * t * t); p.setY(i, y - 0.028 * t * t);
    }
    m.computeVertexNormals();
    if (m === sl) fixUp(m);
    kit.place(m, { s: HAT.s, rx: HAT.tilt });
    kit.place(m, { y: HAT.y, z: -HAT.u });
  }
  return parts;
}
/** One-sided ribbon lying on the hat: wind every triangle so it faces up/outward (non-indexed). */
function fixUp(g) {
  const p = g.attributes.position;
  const v = k => [p.getX(k), p.getY(k), p.getZ(k)];
  for (let i = 0; i < p.count; i += 3) {
    const a = v(i), b = v(i + 1), c = v(i + 2);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
    if (ny * 0.3 + nx * mx * 6 + nz * mz * 6 < 0) { p.setXYZ(i + 1, ...c); p.setXYZ(i + 2, ...b); }
  }
  g.computeVertexNormals();
}

function staff(THREE, kit, K) {
  const x = STAFF.x, z = -STAFF.u, out = [];
  const shaft = prep(THREE, kit.place(kit.cylinder(0.011, 0.014, 0.86, 7), { x, y: 0.56, z }), K.wood, { metal: K.woodMetal });
  out.push(shaft);
  for (const y of [0.53, 0.86]) out.push(prep(THREE, kit.place(kit.torus(0.014, 0.0045, 3, 10), { x, y, z, rx: PI / 2 }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.cylinder(0.022, 0.012, 0.03, 8), { x, y: 0.985, z }), K.trim, { metal: 1 }));
  // crescent cradling the orb: a torus arc open at the top
  const arc = 1.45 * PI;
  const cres = prep(THREE, new THREE.TorusGeometry(0.044, 0.0075, 4, 14, arc), K.trim, { metal: 1 });
  kit.place(cres, { rz: PI / 2 - (arc + (2 * PI - arc) / 2) });
  out.push(kit.place(cres, { x, y: 1.04, z, ry: PI / 2 }));
  out.push(prep(THREE, kit.place(kit.sphere(0.03, 10, 7), { x, y: 1.04, z }), K.gem, { glow: 0.55 }));
  return out;
}

function look(THREE, color) {
  const w = color === 'w', p = PAL[color], C = h => rgb(THREE, h);
  return {
    w, p,
    body: C(p.body), shade: C(p.bodyShade), cloth: C(p.cloth), deep: C(p.clothDeep), trim: C(p.trim), gem: C(p.gem),
    lining: C(w ? '#2a5fd2' : '#7a0f17'), mantleLining: C(w ? '#f3ead8' : '#4a3438'),
    hat: C(w ? '#f1e7d2' : '#1d1c22'), hatBand: C(p.cloth), brimEdge: C(w ? p.trim : p.cloth),
    slot: C(w ? '#16203a' : '#ff3a24'), slotGlow: w ? 0 : 0.5,
    cover: C(w ? '#1f3f8f' : '#6a0c14'), wood: C(w ? '#b98d55' : '#3a3540'), woodMetal: w ? 0 : 0.6, pages: C(w ? '#f6eedb' : '#bdb6aa'),
    cuff: C(p.trim), hand: C(w ? '#e3b48c' : '#6a585b'),
    face: w
      ? { skin: C('#e6b88f'), skinShade: C('#b07a58'), brow: C('#c9c3ba'), lip: C('#b86a5c'), eye: C('#1d2a4a'), eyeGlow: 0,
          hair: C('#ece8e0'), hairShade: C('#a39d93'), beard: C('#f6f3ec'), beardShade: C('#9f988d') }
      : { skin: C('#6e5c5f'), skinShade: C('#2e2426'), brow: C('#b9b4ae'), lip: C('#4a3436'), eye: C('#ff3a1a'), eyeGlow: 0.9,
          hair: C('#bdb8b2'), hairShade: C('#625e5a'), beard: C('#c9c4be'), beardShade: C('#5c5854') },
  };
}

export function bishop(THREE, kit, { color }) {
  const K = look(THREE, color);
  const face = head(THREE, { key: 'wizard', R: HEAD.R, at: U(HEAD.u, HEAD.y), hair: 'cap', beard: 'long', clipY: 0.698, cell: 0.0128 }, K.face);
  return assemble(kit, color, [
    ...plinth(THREE, kit, color, { R: 0.34, H: BASE, seg: 18 }),
    ...coat(THREE, K), underrobe(THREE, kit, K), ...mantle(THREE, K), ...stole(THREE, kit, K), ...belt(THREE, kit, K),
    ...arms(THREE, kit, K), face, ...book(THREE, kit, K), ...hat(THREE, kit, K), ...staff(THREE, kit, K),
  ]);
}
