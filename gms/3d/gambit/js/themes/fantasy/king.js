// Fantasy King — "High King": an armoured king standing with both gauntlets resting on the pommel
// of a great sword planted point-down before him. Plate cuirass with a gold-edged breastplate,
// layered pauldrons, a side-colour surcoat split at the front over armoured legs, a thick ermine
// collar, and a long royal cloak (side colour, gold edges, ermine hem). Bearded, under an arched
// crown with fleurons, a velvet cap, a monde and a tall 3D cross.
// Body is a signed-distance sculpt (surface nets, see sdf.js); surcoat and cloak are drape shells
// (drape.js); crown, cross and sword are plain geometry. One material per side (common.js).
// Overhead read (MODEL_GUIDE §4): the cross — a post with two crossing arms along the board axes —
// is a clear "+" (it is NOT turned with the figure), on a ring of crown points inside a pale
// ermine collar over a wide side-colour cloak. The tallest piece (1.40).
import { sdf, P, mirrorX, colorize } from './sdf.js';
import { drape, rows, inBands } from './drape.js';
import { PAL, rgb, mixRGB, scaleRGB, sstep, prep, paintAbs, plinth, assemble } from './common.js';

const L = { plate: 1, trim: 2, skin: 3, hair: 4, fur: 5, mail: 6, glove: 7, boot: 8, cloth: 9 };
const U = (u, v, x = 0) => [x, v, -u];            // author in (u forward = -z, v up, x = figure's right)
const { sin, cos, atan2, hypot, abs, floor, PI } = Math;
const TAU = PI * 2;
export const YAW = 0.5;
const BASE = 0.14;                                // plinth top
const WAIST = 0.6;
const SWORD = { u: 0.19, top: 0.645 };
const HEAD = { u: 0.008, y: 1.0, r: 0.056 };
const CROWN_Y = HEAD.y + 0.024;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const rSkirt = y => 0.098 + 0.07 * (1 - clamp01((y - 0.33) / (WAIST - 0.33))) ** 1.2;
const rCloak = y => 0.122 + 0.165 * (1 - clamp01((y - BASE) / 0.73)) ** 1.3;
const openCloak = y => 1.08 + 0.34 * sstep(0.35, 0.85, y);
const hash = (a, b, c) => { const s = sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - floor(s); };

let cache = null;
function field(THREE) {
  if (cache) return cache;
  const S = sdf();
  // ---- legs: plate greaves, knee cops, sabatons (only the lower legs show below the surcoat)
  for (const sx of [1, -1]) {
    S.add(P.chain([[...U(0, 0.5, sx * 0.052), 0.036], [...U(0.012, 0.33, sx * 0.06), 0.031], [...U(0.0, BASE + 0.04, sx * 0.064), 0.026]]), L.plate, 0.01);
    S.add(P.ellipsoid(...U(0.03, 0.33, sx * 0.062), 0.03, 0.03, 0.03), L.trim, 0.006);
    S.add(P.capsule(U(-0.01, BASE + 0.022, sx * 0.068), U(0.065, BASE + 0.016, sx * 0.072), 0.026, 0.017), L.boot, 0.015);
  }
  // ---- torso: cuirass (chest forward), waist, gold-edged fauld
  S.add(P.ellipsoid(...U(0.012, 0.735), 0.102, 0.135, 0.078), L.plate, 0.0);
  S.add(P.capsule(U(0.0, 0.62), U(0, 0.56), 0.088, 0.094), L.plate, 0.03);
  S.add(P.torusY(0, 0.6, -0.002, 0.092, 0.013), L.trim, 0.008);                        // sword belt
  // ---- pauldrons: two layered lames each
  S.add(mirrorX(P.ellipsoid(...U(0, 0.855, 0.118), 0.062, 0.044, 0.062)), L.plate, 0.012);
  S.add(mirrorX(P.ellipsoid(...U(0.004, 0.818, 0.138), 0.054, 0.034, 0.052)), L.trim, 0.008);
  // ---- arms: upper arm, couter, vambrace to the gauntlets on the pommel
  for (const sx of [1, -1]) {
    S.add(P.chain([[...U(0, 0.83, sx * 0.13), 0.034], [...U(0.05, 0.7, sx * 0.152), 0.03], [...U(SWORD.u - 0.035, SWORD.top - 0.032, sx * 0.05), 0.026]]), L.plate, 0.015);
    S.add(P.sphere(...U(0.05, 0.7, sx * 0.152), 0.034), L.trim, 0.006);               // elbow cop
    S.add(P.ellipsoid(...U(SWORD.u - 0.004, SWORD.top - 0.03, sx * 0.026), 0.032, 0.03, 0.026), L.glove, 0.012);
  }
  // ---- neck, head, nose, beard, moustache, hair
  S.add(P.capsule(U(0, 0.9), U(0.004, 0.97), 0.03, 0.026), L.skin, 0.02);
  S.add(P.sphere(...U(HEAD.u, HEAD.y), HEAD.r), L.skin, 0.02);
  S.add(P.ellipsoid(...U(HEAD.u + 0.055, HEAD.y - 0.008), 0.011, 0.015, 0.012), L.skin, 0.006);
  S.add(P.capsule(U(HEAD.u + 0.036, HEAD.y - 0.03), U(HEAD.u + 0.058, 0.875), 0.044, 0.016, 0.9), L.hair, 0.02);
  S.add(mirrorX(P.capsule(U(HEAD.u + 0.058, HEAD.y - 0.024, 0.006), U(HEAD.u + 0.048, HEAD.y - 0.036, 0.04), 0.011, 0.008)), L.hair, 0.008);
  S.add(P.ellipsoid(...U(HEAD.u - 0.012, HEAD.y + 0.004), 0.06, 0.057, 0.06), L.hair, 0.01);
  S.add(P.capsule(U(-0.03, HEAD.y - 0.01), U(-0.04, 0.92), 0.05, 0.05), L.hair, 0.02);
  // ---- ermine collar: a thick fur roll round the shoulders, deeper at the back
  S.add((x, y, z) => P.torusY(0, 0.895 - 0.012 * sstep(0, 0.1, -z), 0.012, 0.094, 0.036)(x * 0.95, y, z), L.fur, 0.02);
  cache = S.mesh(THREE, { min: [-0.22, BASE - 0.005, -0.22], max: [0.22, 1.07, 0.15], cell: 0.025 });
  return cache;
}

/** Surcoat: knee-length, split at the front, gold hem; a gold pale down each front edge. */
function surcoat(THREE, K) {
  const band = [[0.33, 0.352]];
  const ys = rows(0.33, WAIST + 0.01, 5, band);
  const sec = [...ys.map(y => [rSkirt(y), y]), [rSkirt(WAIST + 0.01) - 0.012, WAIST + 0.01], [rSkirt(0.33) - 0.012, 0.33], [rSkirt(0.33), 0.33]];
  const n = ys.length;
  const s = drape(THREE, {
    sec, open: y => 0.3 + 0.25 * sstep(0.5, 0.33, y), cols: 16, band: 0.04,
    folds: (phi, y) => 0.008 * sin(phi * 8) * sstep(0.55, 0.36, y),
    paint: ({ row, edge, cap, y }) => {
      if (cap || edge < 0.041 || row >= n || inBands(y, band)) return { c: K.trim, metal: 1 };
      return mixRGB(K.deep, K.cloth, sstep(0.33, 0.58, y));
    },
  });
  return [s.body, ...s.caps];
}

/** Royal cloak: shoulders to floor, deep folds, gold edges, an ermine band at the hem. */
function cloak(THREE, kit, K) {
  const fur = [[BASE + 0.004, 0.2]], gold = [[0.2, 0.212]];
  const ys = rows(BASE + 0.004, 0.84, 6, [...fur, ...gold]);
  const sec = [...ys.map(y => [rCloak(y), y]), [0.104, 0.875], [0.09, 0.882], [0.09, 0.882], [0.08, 0.868],
    [rCloak(0.75) - 0.016, 0.75], [rCloak(0.45) - 0.016, 0.45], [rCloak(BASE) - 0.016, BASE + 0.004], [rCloak(BASE + 0.004), BASE + 0.004]];
  const n = ys.length + 2;
  const fold = (phi, y) => 0.028 * sin(phi * 6.5 + 0.9) * sstep(0.8, 0.22, y);
  const c = drape(THREE, {
    sec, open: openCloak, cols: 16, band: 0.03, z: 0.024, folds: fold,
    paint: ({ row, edge, cap, x, y, z }) => {
      if (inBands(y, fur) && (row < n || cap)) return K.ermine(x, y, z);
      if (row >= n + 1 && !cap) return K.lining;
      if (cap || edge < 0.031 || inBands(y, gold)) return { c: K.trim, metal: 1 };
      return mixRGB(K.deep, K.cloth, sstep(0.2, 0.8, y));
    },
  });
  for (const g of [c.body, ...c.caps]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 - 0.3 * sstep(0.6, 0.86, y); p.setZ(i, 0.024 + (p.getZ(i) - 0.024) * k); }
    g.computeVertexNormals();
  }
  // ermine tails: small dark tufts on the fur hem (geometry: vertex colour can't make dots this small)
  const out = [c.body, ...c.caps];
  for (let k = 0; k < 9; k++) {
    const phi = -2.0 + 4.0 * k / 8 + (k % 2) * 0.12, y = BASE + 0.03 + (k % 2) * 0.03;
    const r = rCloak(y) + fold(phi, y) + 0.001;
    const t = kit.place(kit.bevelBox(0.015, 0.03, 0.006, 0, 1), { y, ry: phi });
    kit.place(t, { x: r * sin(phi), z: 0.024 + r * cos(phi) * (1 - 0.3 * sstep(0.6, 0.86, y)) });
    out.push(prep(THREE, t, K.spot));
  }
  return out;
}

/** Great sword planted point-down: blade with a fuller, down-curved quillons, grip, gem pommel. */
function sword(THREE, kit, K) {
  const z = -SWORD.u, out = [];
  const bladeTop = SWORD.top - 0.11, tip = BASE + 0.012, w = 0.021;
  // the flat of the blade faces forward (extruded along z), the crossguard runs side to side (x)
  const blade = prep(THREE, kit.extrude([[-w, bladeTop], [w, bladeTop], [w * 0.86, tip + 0.07], [0, tip], [-w * 0.86, tip + 0.07]], { depth: 0.008, bevel: 0.002, bevelSegments: 1 }), K.steel, { metal: K.steelMetal });
  paintAbs(blade, (x, y) => (abs(x) < 0.0045 && y > tip + 0.06 && y < bladeTop - 0.012 ? { c: scaleRGB(K.steel, 0.55), metal: K.steelMetal } : null));
  kit.place(blade, { z });
  out.push(blade);
  out.push(prep(THREE, kit.place(kit.bevelBox(0.15, 0.02, 0.024, 0.006, 1), { y: bladeTop + 0.008, z }), K.trim, { metal: 1 }));
  for (const s of [-1, 1]) out.push(prep(THREE, kit.place(kit.sphere(0.014, 7, 5), { x: s * 0.078, y: bladeTop + 0.002, z }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.sphere(0.017, 8, 6), { y: bladeTop + 0.012, z }), K.gem, { glow: 0.55 }));
  // grip (mostly under the gauntlets) + pommel gem
  out.push(prep(THREE, kit.place(kit.cylinder(0.011, 0.012, 0.09, 7), { y: bladeTop + 0.06, z }), K.leather));
  out.push(prep(THREE, kit.place(kit.sphere(0.02, 9, 7), { y: SWORD.top + 0.012, z }), K.trim, { metal: 1 }));
  out.push(prep(THREE, kit.place(kit.sphere(0.011, 6, 4), { y: SWORD.top + 0.016, z: z - 0.016 }), K.gem, { glow: 0.6 }));
  return out;
}

/** Arched crown: jewelled band, fleurons, side-colour cap, two crossing arches, monde. */
function crown(THREE, kit, K) {
  const y0 = CROWN_Y, out = [];
  const band = kit.profile().pt(0.05, y0).pt(0.06, y0 - 0.002).pt(0.064, y0 + 0.014).pt(0.066, y0 + 0.042).pt(0.073, y0 + 0.052).pt(0.054, y0 + 0.056);
  const b = prep(THREE, kit.lathe(band.points(), { segments: 20 }), K.trim, { metal: 1 });
  paintAbs(b, (x, y, z) => (y > y0 + 0.014 && y < y0 + 0.04 && abs(sin(atan2(x, z) * 4)) > 0.82 ? { c: K.crownGem, glow: 0.5, metal: 0.2 } : null));
  out.push(b);
  out.push(prep(THREE, kit.lathe(kit.profile().pt(0.058, y0 + 0.05).bez(0.064, y0 + 0.11, 0.0, y0 + 0.12, 4).points(), { segments: 16 }), K.cap));
  // fleurons: 4 tall (on the arch feet) + 4 small, each a gold leaf point with a bead
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8, tall = k % 2 === 0, h = tall ? 0.05 : 0.032, r = 0.07;
    const leaf = kit.place(kit.cylinder(0.0, 0.016, h, 4), { y: y0 + 0.054 + h / 2, z: r, rx: 0.12 });
    out.push(prep(THREE, kit.place(leaf, { ry: a + PI / 4 }), K.trim, { metal: 1 }));
    const bead = kit.place(kit.sphere(tall ? 0.011 : 0.008, 5, 4), { y: y0 + 0.056 + h, z: r + 0.006 });
    out.push(prep(THREE, kit.place(bead, { ry: a + PI / 4 }), tall ? K.pearl : K.trim, { metal: tall ? 0.1 : 1 }));
  }
  // two arches crossing over the cap (along the board axes, like the cross)
  for (const ry of [0, PI / 2]) {
    const arch = kit.place(kit.torus(0.068, 0.0075, 3, 12, PI), { y: y0 + 0.052, ry });
    // flatten the arch a little so the crown stays compact
    const p = arch.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, y0 + 0.052 + (p.getY(i) - y0 - 0.052) * 0.95);
    arch.computeVertexNormals();
    out.push(prep(THREE, arch, K.trim, { metal: 1 }));
  }
  return out;
}

/** Monde + tall 3D cross (post + two crossing arms along x and z): a "+" from overhead. */
function cross(THREE, kit, K) {
  const ym = CROWN_Y + 0.135, out = [];
  out.push(prep(THREE, kit.place(kit.sphere(0.024, 10, 7), { y: ym }), K.crossCol, { metal: K.crossMetal }));
  out.push(prep(THREE, kit.place(kit.torus(0.024, 0.004, 3, 12), { y: ym, rx: PI / 2 }), K.trim, { metal: 1 }));
  const yTop = 1.4, yArm = 1.315, t = 0.036, arm = 0.19;
  out.push(prep(THREE, kit.place(kit.bevelBox(t, yTop - ym - 0.018, t, 0.007, 1), { y: (yTop + ym + 0.018) / 2 }), K.crossCol, { metal: K.crossMetal }));
  out.push(prep(THREE, kit.place(kit.bevelBox(arm, t, t, 0.007, 1), { y: yArm }), K.crossCol, { metal: K.crossMetal }));
  out.push(prep(THREE, kit.place(kit.bevelBox(t, t, arm, 0.007, 1), { y: yArm }), K.crossCol, { metal: K.crossMetal }));
  // gem at the crossing + small ball terminals on the four arm ends
  out.push(prep(THREE, kit.place(kit.sphere(0.0215, 8, 6), { y: yArm }), K.crownGem, { glow: 0.6, metal: 0.2 }));
  out.push(prep(THREE, kit.place(kit.sphere(0.017, 6, 4), { y: yTop }), K.crossCol, { metal: K.crossMetal }));
  return out;
}

function look(THREE, color) {
  const w = color === 'w', p = PAL[color], C = h => rgb(THREE, h);
  const furA = C(w ? '#fbf8f1' : '#c9c4bd'), furB = C(w ? '#d9d2c4' : '#8f8a86'), spot = C(w ? '#17141a' : '#121014');
  return {
    w, p,
    body: C(p.body), cloth: C(p.cloth), deep: C(p.clothDeep), trim: C(p.trim), gem: C(p.gem),
    plate: C(w ? '#efe6d2' : '#3a3c46'), plateMetal: w ? 0.35 : 0.85,
    steel: C(w ? '#fffaf0' : '#c4c8d4'), steelMetal: w ? 0.3 : 0.55, leather: C(w ? '#6a4626' : '#2a1d1e'),
    crownGem: C(w ? '#3d8dff' : '#ff3a24'), pearl: C(w ? '#fff4dc' : '#dcdee8'), cap: C(w ? p.cloth : '#b3141f'),
    crossCol: C(w ? p.trim : '#d2d6e0'), crossMetal: w ? 1 : 0.6,
    lining: C(w ? '#f3ead8' : '#4a3438'),
    hair: C(w ? '#ece4d6' : '#9d9794'), hairShade: C(w ? '#a39684' : '#4a4644'),
    skin: mixRGB(C(p.body), C(w ? '#e8c9a8' : '#4a3d42'), 0.6),
    // ermine: pale fur with small black tail tips on a jittered grid
    ermine: (x, y, z) => {
      const a = atan2(x, z), gx = floor(a * 4.2), gy = floor(y * 34);
      const spotOn = hash(gx, gy, 1) > 0.55 && abs(((a * 4.2) % 1 + 1) % 1 - 0.5) < 0.17 && abs((y * 34) % 1 - 0.5) < 0.24;
      return spotOn ? spot : mixRGB(furB, furA, 0.5 + 0.5 * sin(a * 23 + y * 90));
    },
    furA, furB, spot,
  };
}

export function king(THREE, kit, { color }) {
  const K = look(THREE, color), w = K.w;
  const f = field(THREE);
  const body = colorize(THREE, { geom: f.geom.clone(), labels: f.labels }, (l, x, y, z) => {
    switch (l) {
      case L.trim: return [...K.trim, 0, 1];
      case L.skin: return [...K.skin, 0, 0];
      case L.hair: return [...mixRGB(K.hairShade, K.hair, sstep(0.86, 0.98, y)), 0, 0];
      case L.glove: return [...(w ? K.trim : C2(K)), 0, 1];
      case L.boot: return [...K.trim, 0, w ? 1 : 0.8];
      case L.fur: {
        // ermine spots: one vertex per cell is about the size of a tail tip at this resolution
        const h = hash(Math.round(x * 60), Math.round(y * 60), Math.round(z * 60));
        const fur = mixRGB(K.furB, K.furA, sstep(0.86, 0.92, y));
        return [...(h > 0.86 ? mixRGB(fur, K.spot, 0.55) : fur), 0, 0];
      }
      default: {
        // plate: gold edges on the breastplate centre ridge + fauld; side-colour tabard panel on the chest
        if (y < 0.56) return [...K.plate, 0, K.plateMetal];
        if (-z > 0.03 && abs(x) < 0.008 && y > 0.62 && y < 0.84) return [...K.trim, 0, 1];
        const k = -z > 0.03 && y > 0.62 && y < 0.82 ? sstep(0.058, 0.042, abs(x)) : 0;   // soft-edged tabard panel
        return [...mixRGB(K.plate, mixRGB(K.deep, K.cloth, sstep(0.62, 0.8, y)), k), 0, K.plateMetal * (1 - k)];
      }
    }
  });
  const figure = [body, ...surcoat(THREE, K), ...cloak(THREE, kit, K), ...sword(THREE, kit, K), ...crown(THREE, kit, K)];
  for (const m of figure) m.rotateY(YAW);
  const parts = [...figure, ...cross(THREE, kit, K)];                     // the cross stays on the board axes
  king.debug = parts.map(g => (g.index ? g.index.count : g.attributes.position.count) / 3);
  return assemble(kit, color, [...plinth(THREE, kit, color, { R: 0.38, H: BASE, seg: 22 }), ...parts]);
}
const C2 = K => K.plate;
