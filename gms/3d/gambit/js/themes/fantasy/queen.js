// Fantasy Queen — "Sorceress": a regal sorceress in a layered gown — a side-colour underskirt
// panel with gold brocade, an ivory/ebony overskirt split open at the front (inverted V) with
// gold edges and a dagged hem, and a floor-length mantle (side colour, gold border, pale lining)
// hanging from the shoulders — plus hanging sleeves, a scalloped fan collar behind the head, a
// sceptre in her right hand and a glowing orb hovering in a gold armillary ring over her left palm.
// The gown layers are lathe shells (folds displaced per vertex, the front opening warped per
// height) so their edges stay crisp and cheap; the upper body (bodice, arms, sleeves, head, hair)
// is a small signed-distance sculpt (surface nets, see sdf.js). One material per side (common.js).
// Overhead read (MODEL_GUIDE §4): a tall coronet — eight points tipped with glowing gem beads
// around a side-colour cap and a gold centre finial (the queen's dotted circle) — inside the
// fan collar, over a wide side-colour mantle.
// The figure is turned toward its owner (YAW) like the squire.
import { sdf, P, mirrorX, colorize } from './sdf.js';
import { drape, rows, inBands } from './drape.js';
import { head } from './face.js';
import { PAL, rgb, mixRGB, scaleRGB, sstep, prep, paintAbs, plinth, assemble } from './common.js';

const L = { bodice: 1, trim: 2, skin: 3, hair: 4, sleeve: 5, cuff: 6 };
const U = (u, v, x = 0) => [x, v, -u];            // author in (u forward = -z, v up, x = figure's right)
const { sin, cos, atan2, hypot, abs, PI } = Math;
const TAU = PI * 2;
export const YAW = 0.55;
const BASE = 0.13;                                // plinth top
const WAIST = 0.6;
const SCEPTRE = { x: 0.14, u: 0.075 };
const ORB = U(0.125, 0.75, -0.17);
const HEAD = { u: 0.006, y: 0.9, r: 0.052 };

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
/** bell radius of the underskirt */
const rSkirt = y => 0.076 + 0.15 * (1 - clamp01((y - BASE) / (WAIST - BASE))) ** 1.8;
const rOver = y => rSkirt(y) + 0.016 + 0.012 * sstep(0.35, BASE, y);
/** mantle: wide at the floor, narrowing to the shoulders */
const rMantle = y => 0.112 + 0.152 * (1 - clamp01((y - BASE) / 0.64)) ** 1.25;
const openOver = y => 0.22 + 0.5 * sstep(0.58, 0.16, y);         // overskirt opening half-angle (from the front)
const openMantle = y => 0.98 + 0.4 * sstep(0.3, 0.76, y);       // mantle covers |a| > this

let cache = null;
function field(THREE) {
  if (cache) return cache;
  const S = sdf();
  // ---- bodice: narrow waist, chest, shoulders
  S.add(P.ellipsoid(...U(0.006, 0.685), 0.072, 0.105, 0.054), L.bodice);
  S.add(P.ellipsoid(...U(0.0, 0.775), 0.1, 0.034, 0.058), L.bodice, 0.04);
  S.add(P.capsule(U(0, WAIST + 0.01), U(0, WAIST - 0.05), 0.07, 0.074), L.bodice, 0.03);   // hips into the skirt
  S.add(P.torusY(0, WAIST + 0.006, 0, 0.074, 0.0105), L.trim, 0.008);                     // girdle
  // ---- neck (the head is a separate fine sculpt: face.js)
  S.add(P.capsule(U(0, 0.79), U(0.002, 0.86), 0.026, 0.022), L.skin, 0.02);
  // puffed sleeve heads
  S.add(mirrorX(P.ellipsoid(...U(0.0, 0.768, 0.1), 0.038, 0.034, 0.036)), L.sleeve, 0.012);
  // ---- right arm: shoulder -> elbow -> hand round the sceptre
  S.add(P.chain([[...U(0, 0.77, 0.098), 0.029], [...U(-0.006, 0.68, 0.13), 0.025], [...U(SCEPTRE.u - 0.02, 0.64, SCEPTRE.x - 0.012), 0.021]]), L.bodice, 0.02);
  S.add(P.sphere(...U(SCEPTRE.u, 0.635, SCEPTRE.x - 0.004), 0.02), L.skin, 0.008);
  // ---- left arm: reaching forward, palm up under the orb
  S.add(P.chain([[...U(0, 0.77, -0.098), 0.029], [...U(0.01, 0.68, -0.138), 0.025], [...U(0.1, 0.665, -0.162), 0.021]]), L.bodice, 0.02);
  S.add(P.ellipsoid(...U(0.126, 0.668, -0.168), 0.027, 0.011, 0.022), L.skin, 0.01);
  // gold cuffs
  S.add(P.capsule(U(SCEPTRE.u - 0.032, 0.645, SCEPTRE.x - 0.016), U(SCEPTRE.u - 0.024, 0.643, SCEPTRE.x - 0.014), 0.025), L.cuff, 0.004);
  S.add(P.capsule(U(0.088, 0.667, -0.158), U(0.096, 0.667, -0.16), 0.025), L.cuff, 0.004);
  // ---- bell sleeves: flaring from the elbow, open over the wrist
  S.add(P.capsule(U(0.0, 0.672, 0.133), U(SCEPTRE.u - 0.04, 0.643, SCEPTRE.x - 0.018), 0.027, 0.04, 0.85), L.sleeve, 0.012);
  S.add(P.capsule(U(0.02, 0.678, -0.142), U(0.074, 0.664, -0.156), 0.027, 0.04, 0.85), L.sleeve, 0.012);
  cache = S.mesh(THREE, { min: [-0.2, WAIST - 0.004, -0.2], max: [0.2, 0.89, 0.12], cell: 0.022 });
  return cache;
}

function gown(THREE, kit, K) {
  const out = [];
  // underskirt: full bell (only the front panel shows), two gold brocade bands
  const bU = [[0.165, 0.18]];
  const under = prep(THREE, kit.lathe(rows(BASE - 0.004, WAIST, 5, bU).map(y => new THREE.Vector2(rSkirt(y), y)), { segments: 8, phiStart: PI - 1.0, phiLength: 2.0 }), K.cloth);
  paintAbs(under, (x, y) => (inBands(y, bU) ? { c: K.trim, metal: 1 } : mixRGB(K.deep, K.cloth, sstep(0.15, 0.55, y))));
  out.push(under);
  // overskirt: split open at the front, gold edges + hem band, folds
  const bO = [[0.148, 0.168]];
  const ysO = rows(0.148, WAIST, 6, bO);
  const secO = [...ysO.map(y => [rOver(y), y]), [rOver(WAIST), WAIST], [rOver(WAIST) - 0.012, WAIST], [rOver(0.148) - 0.014, 0.148], [rOver(0.148), 0.148]];
  const nO = ysO.length;
  const over = drape(THREE, {
    sec: secO, open: openOver, cols: 14, band: 0.035,
    folds: (phi, y) => 0.009 * sin(phi * 7 + 1) * sstep(0.55, 0.2, y),
    paint: ({ row, edge, cap, y }) => {
      if (cap || edge < 0.036 || row >= nO || inBands(y, bO)) return { c: K.trim, metal: 1 };
      return mixRGB(K.shade, K.body, sstep(0.15, 0.5, y));
    },
  });
  out.push(over.body, ...over.caps);
  // mantle: shoulders to floor at the back, deep folds; gold border + hem, pale lining
  const bM = [[BASE + 0.004, 0.158]];
  const ysM = rows(BASE + 0.004, 0.765, 7, bM);
  const secM = [...ysM.map(y => [rMantle(y), y]), [0.096, 0.792], [0.078, 0.8], [0.078, 0.8], [0.068, 0.786],
    [rMantle(0.7) - 0.016, 0.7], [rMantle(0.45) - 0.016, 0.45], [rMantle(BASE) - 0.016, BASE + 0.004], [rMantle(BASE + 0.004), BASE + 0.004]];
  const nM = ysM.length + 2;
  const mantle = drape(THREE, {
    sec: secM, open: openMantle, cols: 14, band: 0.03, z: 0.02,
    folds: (phi, y) => 0.03 * sin(phi * 6.5 + 0.4) * sstep(0.74, 0.2, y),
    paint: ({ row, edge, cap, y }) => {
      if (row >= nM + 1 && !cap) return K.lining;
      if (cap || edge < 0.031 || inBands(y, bM)) return { c: K.trim, metal: 1 };
      return mixRGB(K.deep, K.cloth, sstep(0.18, 0.75, y));
    },
  });
  // shoulders are wider than deep: squash the top of the mantle front-to-back
  for (const g of [mantle.body, ...mantle.caps]) {
    const pm = g.attributes.position;
    for (let i = 0; i < pm.count; i++) { const y = pm.getY(i), k = 1 - 0.3 * sstep(0.55, 0.8, y); pm.setZ(i, 0.02 + (pm.getZ(i) - 0.02) * k); }
    g.computeVertexNormals();
  }
  out.push(mantle.body, ...mantle.caps);
  return out;
}

/** Fan collar behind the head: flaring wedge, scalloped top, gold ribs + rim, gem beads on the points. */
function collar(THREE, kit, K) {
  const A = 1.2, N = 6, R = y => 0.072 + (y - 0.785) * 0.5;
  const ys = rows(0.785, 0.93, 2, [[0.912, 0.93]]);
  const sec = [...ys.map(y => [R(y) + 0.004, y]), [R(0.93) + 0.004, 0.93], [R(0.93) - 0.003, 0.932], [R(0.785) - 0.003, 0.785]];
  const c = drape(THREE, {
    sec, open: () => PI - A, cols: N * 3, band: 0,
    paint: ({ phi, y }) => {
      const rib = abs(sin((phi / A) * PI * N / 2));
      if (y > 0.911 || (rib < 0.2 && y > 0.8)) return { c: K.trim, metal: 1 };
      return scaleRGB(K.lace, 0.72 + 0.28 * sstep(0.79, 0.93, y));
    },
  });
  for (const g of [c.body, ...c.caps]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y < 0.92) continue;
      const a = atan2(p.getX(i), p.getZ(i)), s = abs(cos((a / A) * PI * N / 2));
      p.setY(i, y - 0.026 * (1 - s));
    }
    g.computeVertexNormals();
  }
  return [c.body, ...c.caps];
}

/** Tall coronet: jewelled band, side-colour cap, eight flaring points with gem beads, centre finial. */
function coronet(THREE, kit, K) {
  const y0 = HEAD.y + 0.022, out = [];
  const band = kit.profile().pt(0.046, y0).pt(0.056, y0 - 0.001).pt(0.059, y0 + 0.012)
    .pt(0.061, y0 + 0.026).pt(0.066, y0 + 0.034).pt(0.05, y0 + 0.04);
  const b = prep(THREE, kit.lathe(band.points(), { segments: 16 }), K.trim, { metal: 1 });
  paintAbs(b, (x, y, z) => (y > y0 + 0.013 && y < y0 + 0.025 && abs(sin(atan2(x, z) * 8)) < 0.5 ? { c: K.coronetGem, glow: 0.5, metal: 0.2 } : null));
  out.push(b);
  const cap = kit.profile().pt(0.052, y0 + 0.034).bez(0.05, y0 + 0.07, 0.0, y0 + 0.078, 3);
  out.push(prep(THREE, kit.lathe(cap.points(), { segments: 16 }), K.cap));
  const N = 8, h = 0.09, r0 = 0.058, r1 = 0.1;
  for (let k = 0; k < N; k++) {
    const a = (k + 0.5) * TAU / N;
    const spike = kit.place(kit.cylinder(0.003, 0.012, h, 5), { rx: atan2(r1 - r0, h) });
    kit.place(spike, { y: y0 + 0.036 + h / 2, z: (r0 + r1) / 2 });
    out.push(prep(THREE, kit.place(spike, { ry: a }), K.trim, { metal: 1 }));
    const bead = kit.place(kit.sphere(0.02, 6, 4), { y: y0 + 0.04 + h + 0.008, z: r1 + 0.002 });
    out.push(prep(THREE, kit.place(bead, { ry: a }), K.pearl, { glow: K.w ? 0.12 : 0.2, metal: 0.1 }));
  }
  // a thin gold circlet through the tips: from overhead the beads + circlet are the queen's dotted circle
  out.push(prep(THREE, kit.place(kit.torus(r1 + 0.002, 0.0042, 3, 24), { y: y0 + 0.04 + h + 0.004, rx: PI / 2 }), K.trim, { metal: 1 }));
  // centre finial: stem, collar ring, glowing orb, spike
  const fy = y0 + 0.074;
  out.push(prep(THREE, kit.place(kit.cylinder(0.008, 0.014, 0.1, 8), { y: fy + 0.05 }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.torus(0.016, 0.0055, 3, 10), { y: fy + 0.1, rx: PI / 2 }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.sphere(0.026, 8, 6), { y: fy + 0.128 }), K.coronetGem, { glow: 0.6, metal: 0.15 }));
  out.push(prep(THREE, kit.place(kit.cylinder(0.0, 0.009, 0.07, 6), { y: fy + 0.185 }), K.trim, { metal: 1 }));
  return out;
}

/** Sceptre in the right hand: gold shaft, a ring cradling a glowing gem, a point on top. */
function sceptre(THREE, kit, K) {
  const x = SCEPTRE.x, z = -SCEPTRE.u, out = [];
  out.push(prep(THREE, kit.place(kit.cylinder(0.0075, 0.0075, 0.44, 6), { x, y: 0.73, z }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.sphere(0.014, 6, 4), { x, y: 0.51, z }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.cylinder(0.02, 0.008, 0.03, 8), { x, y: 0.94, z }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.torus(0.031, 0.0055, 3, 12), { x, y: 0.99, z, ry: 0.3 }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.sphere(0.02, 8, 5), { x, y: 0.99, z }), K.gem, { glow: 0.65 }));
  out.push(prep(THREE, kit.place(kit.cylinder(0.0, 0.008, 0.045, 5), { x, y: 1.042, z }), K.trim, { metal: 1 }));
  return out;
}

/** The orb hovering above the left palm, in a tilted gold armillary ring. */
function orb(THREE, kit, K) {
  const [x, y, z] = ORB;
  return [
    prep(THREE, kit.place(kit.sphere(0.036, 10, 8), { x, y, z }), K.gem, { glow: 0.75 }),
    prep(THREE, kit.place(kit.torus(0.05, 0.0045, 3, 16), { x, y, z, rx: 1.15, rz: 0.4 }), K.trim, { metal: 1 }),
  ];
}

function look(THREE, color) {
  const w = color === 'w', p = PAL[color], C = h => rgb(THREE, h);
  return {
    w, p,
    body: C(p.body), shade: C(p.bodyShade), cloth: C(p.cloth), deep: C(p.clothDeep), trim: C(p.trim),
    gem: C(p.gem), coronetGem: C(w ? '#3d8dff' : '#ff3a24'), pearl: C(w ? '#fff4dc' : '#dcdee8'),
    lace: C(w ? '#f6efe0' : '#4a4452'), cap: C(w ? p.cloth : '#b3141f'),
    lining: C(w ? '#f3ead8' : '#6a6570'),
    bodice: C(w ? p.body : '#2a2830'),
    hair: C(w ? '#d4a95c' : '#6a4038'), hairShade: C(w ? '#9a7038' : '#2a1a18'),
    skin: mixRGB(C(p.body), C(w ? '#e8c9a8' : '#4a3d42'), 0.6),
    face: w
      ? { skin: C('#f0caa6'), skinShade: C('#c08a68'), brow: C('#8a5a2a'), lip: C('#c4545a'), eye: C('#1f2c52'), eyeGlow: 0,
          hair: C('#e0b45e'), hairShade: C('#8e6226'), beard: C('#e0b45e'), beardShade: C('#8e6226') }
      : { skin: C('#8c7b80'), skinShade: C('#4a3c40'), brow: C('#1a1012'), lip: C('#8a1a28'), eye: C('#ff3a24'), eyeGlow: 0.6,
          hair: C('#3a2226'), hairShade: C('#120a0c'), beard: C('#3a2226'), beardShade: C('#120a0c') },
  };
}

export function queen(THREE, kit, { color }) {
  const K = look(THREE, color);
  const f = field(THREE);
  const body = colorize(THREE, { geom: f.geom.clone(), labels: f.labels }, (l, x, y, z) => {
    switch (l) {
      case L.trim: case L.cuff: return [...K.trim, 0, 1];
      case L.skin: return [...K.skin, 0, 0];
      case L.hair: return [...mixRGB(K.hairShade, K.hair, sstep(0.84, 0.94, y)), 0, 0];
      case L.sleeve: {
        return [...K.cloth, 0, 0];
      }
      default: {
        // bodice: body colour with a side-colour stomacher (a V down the front), gold neckline
        const v = abs(x) - 0.012 - (y - WAIST) * 0.36;
        if (-z > 0.02 && y < 0.8) return [...mixRGB(mixRGB(scaleRGB(K.bodice, 0.8), K.bodice, sstep(WAIST, 0.75, y)), K.cloth, sstep(0.007, -0.007, v)), 0, 0];
        if (y > 0.79 && hypot(x, z) < 0.05) return [...K.trim, 0, 1];
        return [...mixRGB(scaleRGB(K.bodice, 0.8), K.bodice, sstep(WAIST, 0.75, y)), 0, 0];
      }
    }
  });
  const face = head(THREE, { key: 'queen', R: HEAD.r, at: U(HEAD.u, HEAD.y), hair: 'queen', beard: null, clipY: HEAD.y + 0.03, cell: 0.0112 }, K.face);
  const parts = [body, face, ...gown(THREE, kit, K), ...collar(THREE, kit, K), ...coronet(THREE, kit, K), ...sceptre(THREE, kit, K), ...orb(THREE, kit, K)];
  for (const m of parts) m.rotateY(YAW);
  return assemble(kit, color, [...plinth(THREE, kit, color, { R: 0.36, H: BASE, seg: 20 }), ...parts]);
}
