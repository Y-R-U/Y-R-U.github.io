// Fantasy Rook — "Watchtower": a round keep of individually cut stone blocks (staggered
// courses, real joints), a gold-banded footing, an arched door in a gold frame, glowing arrow
// slits, a ring of corbels carrying an overhanging parapet, six merlons with gold coping around
// a dark well, and two heraldic banners (side colour, gold border + tower badge) on gold rods.
// All plain geometry (lathes / capped lathe wedges / extrudes) in the single fantasy material.
// Overhead read (MODEL_GUIDE §4): a ring of battlements with gold coping around a dark well.
// The door faces -x so that, after the board's side yaw, it faces the owning player's camera.
import { PAL, rgb, mixRGB, scaleRGB, sstep, prep, paintAbs, plinth, assemble } from './common.js';

const { sin, cos, PI, abs } = Math;
const TAU = PI * 2;
const DOOR = -PI / 2;                              // lathe angle (x = r sin φ, z = r cos φ) → -x
const Y0 = 0.172, COURSES = 8, CH = 0.065;         // stone courses
const YT = Y0 + COURSES * CH;                      // top of the shaft (0.692)
const rOut = y => 0.266 - 0.026 * (y - Y0) / (YT - Y0);   // slight taper

// tiny deterministic hash for stone colour jitter
const hash = (a, b) => { const s = sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const wrap = a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };

/** Shared look per side. */
function look(THREE, color) {
  const w = color === 'w', p = PAL[color], C = h => rgb(THREE, h);
  return {
    w, p,
    stoneA: C(w ? '#f2e8d4' : '#2e2d35'), stoneB: C(w ? '#d9cbad' : '#3c3a44'),
    mortar: C(w ? '#8a7a5e' : '#0c0b0f'),
    trim: C(p.trim), cloth: C(p.cloth), deep: C(p.clothDeep),
    well: C(w ? '#24190f' : '#060507'),
    wood: C(w ? '#5a3b22' : '#1c1214'),
    coping: C(w ? p.trim : '#b4b8c4'),                // gold vs steel: a light ring from above on dark squares
    slit: C(p.rune),
  };
}

/** Wedge of a lathe from angle a0..a1 with a closed (r,y) section. */
function wedge(THREE, kit, section, a0, a1, seg) {
  return kit.latheSegment(section.map(([r, y]) => new THREE.Vector2(r, y)), a0, a1 - a0, seg);
}

function stones(THREE, kit, K) {
  const parts = [];
  const N = 9, step = TAU / N, gapA = 0.024, gapY = 0.0045;
  const doorHalf = 0.21, doorTop = Y0 + 3 * CH;   // the door cuts courses 0..2
  for (let i = 0; i < COURSES; i++) {
    const y0 = Y0 + i * CH + gapY, y1 = Y0 + (i + 1) * CH - gapY;
    // open outer face only (bevelled top + bottom edge): the joints show the mortar core behind
    const ro0 = rOut(y0), ro1 = rOut(y1), rc = rOut(y0) - 0.012;
    const sec = [[rc, y0 - gapY], [ro0, y0 + 0.003], [ro1, y1 - 0.006], [ro1 - 0.009, y1]].map(([r, y]) => new THREE.Vector2(r, y));
    const off = (i % 2) * step / 2 + 0.07 * (hash(i, 3) - 0.5);
    for (let k = 0; k < N; k++) {
      let ranges = [[off + k * step + gapA / 2, off + (k + 1) * step - gapA / 2]];
      if (y0 < doorTop) {
        // clip around the door opening
        ranges = ranges.flatMap(([a, b]) => {
          const ca = wrap(a - DOOR), cb = ca + (b - a);
          if (cb < -doorHalf || ca > doorHalf) return [[a, b]];
          const out = [];
          if (ca < -doorHalf - 0.05) out.push([a, a + (-doorHalf - ca)]);
          if (cb > doorHalf + 0.05) out.push([b - (cb - doorHalf), b]);
          return out;
        });
      }
      for (const [a, b] of ranges) {
        const g = kit.lathe(sec, { segments: (b - a) > 0.45 ? 3 : 2, phiStart: a, phiLength: b - a });
        const h = hash(i, k);
        const col = scaleRGB(mixRGB(K.stoneA, K.stoneB, h), 0.86 + 0.14 * sstep(0, 3, i) + 0.05 * hash(k, i));
        prep(THREE, g, col);
        // faint grime toward the bottom edge of each block, light catches the top edge
        paintAbs(g, (x, y) => scaleRGB(col, 0.9 + 0.12 * sstep(y0, y1, y)));
        parts.push(g);
      }
    }
  }
  // mortar core behind the blocks
  const core = kit.lathe([new THREE.Vector2(rOut(Y0) - 0.012, Y0 - 0.002), new THREE.Vector2(rOut(YT) - 0.012, YT + 0.01)], { segments: 24 });
  parts.push(prep(THREE, core, K.mortar));
  return parts;
}

function footing(THREE, kit, K) {
  const prof = kit.profile()
    .pt(0, 0.128).pt(0.296, 0.128).pt(0.296, 0.144).pt(0.287, 0.15)
    .arc(0.283, 0.159, 0.009, -70, 80, 3)                 // gold band
    .pt(0.276, 0.168).pt(0.268, Y0 + 0.002).pt(0.2, Y0 + 0.002);
  const g = prep(THREE, kit.lathe(prof.points(), { segments: 24 }), K.stoneB);
  paintAbs(g, (x, y) => (y > 0.149 && y < 0.169 ? { c: K.trim, metal: 1 } : scaleRGB(K.stoneB, 0.82)));
  return [g];
}

function door(THREE, kit, K) {
  const arch = (w, h, s = 1) => {
    const sh = new THREE.Shape(), r = w / 2;
    sh.moveTo(-r, 0); sh.lineTo(r, 0); sh.lineTo(r, h - r);
    sh.absarc(0, h - r, r, 0, PI, false);           // the shape closes itself back to (-r, 0)
    return sh;
  };
  const W = 0.096, H = 0.19;
  // frame: arch ring (outer arch minus inner) in gold
  const ring = arch(W + 0.03, H + 0.015);
  ring.holes.push(arch(W, H));
  const frame = prep(THREE, kit.extrude(ring, { depth: 0.018, bevel: 0.003, bevelSegments: 1, curveSegments: 10 }), K.trim, { metal: 1 });
  // planks: the door leaf, dark wood with three iron bands
  const leaf = prep(THREE, kit.extrude(arch(W + 0.004, H + 0.002), { depth: 0.01, bevel: 0, curveSegments: 10 }), K.wood);
  const bands = [0.04, 0.1].map(y => prep(THREE, kit.place(kit.bevelBox(W * 0.86, 0.01, 0.006, 0.002, 1), { y, z: 0.006 }), K.w ? K.trim : rgb(THREE, '#8a8e9a'), { metal: 1 }));
  const ringPull = prep(THREE, kit.place(kit.torus(0.011, 0.0028, 4, 10), { x: 0.022, y: 0.075, z: 0.008 }), K.trim, { metal: 1 });
  const r = rOut(Y0);
  const out = [];
  for (const [g, rr] of [[frame, r - 0.002], [leaf, r - 0.022], ...bands.map(b => [b, r - 0.022]), [ringPull, r - 0.022]]) {
    kit.place(g, { y: Y0 - 0.002 });
    kit.place(g, { ry: DOOR, x: rr * sin(DOOR), z: rr * cos(DOOR) });
    out.push(g);
  }
  // keystone-ish gold step under the door (threshold)
  return out;
}

function slits(THREE, kit, K) {
  const out = [];
  for (const [a, y] of [[DOOR + PI, 0.45], [DOOR + 2.0, 0.5], [DOOR - 2.0, 0.5], [DOOR, 0.48]]) {
    const r = rOut(y) + 0.001;
    const g = prep(THREE, kit.bevelBox(0.016, 0.085, 0.01, 0.003, 1), K.slit, { glow: 0.55 });
    // a pointed gold lintel over each slit
    const lintel = prep(THREE, kit.place(kit.extrude([[-0.017, 0], [0.017, 0], [0, 0.016]], { depth: 0.01, bevel: 0 }), { y: 0.045 }), K.trim, { metal: 1 });
    for (const m of [g, lintel]) { kit.place(m, { y }); kit.place(m, { ry: a, x: r * sin(a), z: r * cos(a) }); out.push(m); }
  }
  return out;
}

function top(THREE, kit, K) {
  const parts = [];
  // corbels: stepped brackets under the overhang
  const NC = 14;
  for (let k = 0; k < NC; k++) {
    const a = (k + 0.5) * TAU / NC, wA = 0.12;
    const sec = [[0.226, YT - 0.002], [0.25, YT - 0.002], [0.28, YT + 0.05], [0.226, YT + 0.05]];
    const g = prep(THREE, wedge(THREE, kit, sec, a - wA / 2, a + wA / 2, 1), scaleRGB(K.stoneB, 0.92));
    parts.push(g);
  }
  // parapet: overhang, gold band, wall, walkway, inner wall, dark well floor
  const prof = kit.profile()
    .pt(0.232, YT + 0.004).pt(0.284, YT + 0.05).pt(0.297, YT + 0.054)
    .arc(0.297, YT + 0.066, 0.011, -90, 90, 3)
    .pt(0.29, YT + 0.08).pt(0.29, 0.852).pt(0.285, 0.858).pt(0.19, 0.858).pt(0.185, 0.852)
    .pt(0.185, 0.8).pt(0.177, 0.792).pt(0, 0.792);
  const g = prep(THREE, kit.lathe(prof.points(), { segments: 26 }), K.stoneA);
  paintAbs(g, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (y < 0.796 && r < 0.18) return { c: K.well, metal: 0 };
    if (y < 0.83 && r < 0.187) return scaleRGB(K.well, 2.2);
    if (y > YT + 0.05 && y < YT + 0.08 && r > 0.29) return { c: K.trim, metal: 1 };
    if (y < YT + 0.052) return scaleRGB(K.stoneB, 0.85);
    return null;
  });
  parts.push(g);
  // merlons with gold coping on top
  const NM = 6;
  for (let k = 0; k < NM; k++) {
    const a = DOOR + (k + 0.5) * TAU / NM, wA = TAU / NM * 0.56;
    const sec = [[0.186, 0.856], [0.288, 0.856], [0.288, 0.934], [0.186, 0.934]];
    const m = prep(THREE, wedge(THREE, kit, sec, a - wA / 2, a + wA / 2, 3), mixRGB(K.stoneA, K.stoneB, hash(k, 9)));
    // gold coping slab, a touch wider than the merlon
    const cap = [[0.18, 0.933], [0.295, 0.933], [0.295, 0.942], [0.289, 0.949], [0.186, 0.949], [0.18, 0.943]];
    const c = prep(THREE, wedge(THREE, kit, cap, a - wA / 2 - 0.02, a + wA / 2 + 0.02, 3), K.coping, { metal: 1 });
    parts.push(m, c);
  }
  return parts;
}

function banners(THREE, kit, K) {
  const out = [];
  const W = 0.104, Hb = 0.29, yTop = YT - 0.012;
  const outline = (s) => [[-W / 2 * s, 0], [W / 2 * s, 0], [W / 2 * s, -Hb * s], [0, -(Hb - 0.045) * s], [-W / 2 * s, -Hb * s]];
  const castle = [[-0.022, -0.17], [0.022, -0.17], [0.022, -0.12], [0.013, -0.12], [0.013, -0.111], [0.0045, -0.111], [0.0045, -0.12],
    [-0.0045, -0.12], [-0.0045, -0.111], [-0.013, -0.111], [-0.013, -0.12], [-0.022, -0.12]];
  for (const side of [-1, 1]) {
    const a = DOOR + side * 0.92, r = rOut(0.5) + 0.016;
    const back = prep(THREE, kit.extrude(outline(1), { depth: 0.004, bevel: 0.0015, bevelSegments: 1 }), K.trim, { metal: 1 });
    const cloth = prep(THREE, kit.place(kit.extrude(outline(0.86).map(([x, y]) => [x, y - 0.012]), { depth: 0.004, bevel: 0 }), { z: 0.003 }), K.cloth);
    paintAbs(cloth, (x, y) => mixRGB(K.cloth, K.deep, sstep(-0.05, -0.26, y)));
    const badge = prep(THREE, kit.place(kit.extrude(castle.map(([x, y]) => [x, y + 0.03]), { depth: 0.003, bevel: 0 }), { z: 0.0062 }), K.trim, { metal: 1 });
    const rod = prep(THREE, kit.place(kit.cylinder(0.006, 0.006, W + 0.03, 6), { rz: PI / 2, y: 0.004, z: -0.004 }), K.trim, { metal: 1 });
    const knobs = [-1, 1].map(s => prep(THREE, kit.place(kit.sphere(0.009, 6, 4), { x: s * (W / 2 + 0.017), y: 0.004, z: -0.004 }), K.trim, { metal: 1 }));
    for (const g of [back, cloth, badge, rod, ...knobs]) {
      // hang slightly away from the (tapering) wall: lean the bottom out a touch
      kit.place(g, { rx: -0.045 });
      kit.place(g, { y: yTop });
      kit.place(g, { ry: a, x: r * sin(a), z: r * cos(a) });
      out.push(g);
    }
  }
  return out;
}

export function rook(THREE, kit, { color }) {
  const K = look(THREE, color);
  return assemble(kit, color, [
    ...plinth(THREE, kit, color, { R: 0.37, H: 0.13, seg: 24 }),
    ...footing(THREE, kit, K), ...stones(THREE, kit, K), ...door(THREE, kit, K), ...slits(THREE, kit, K),
    ...top(THREE, kit, K), ...banners(THREE, kit, K),
  ]);
}
