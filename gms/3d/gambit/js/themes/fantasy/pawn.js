// Fantasy Pawn — "Squire": a young foot-soldier figurine. Pointed spangenhelm with a nasal
// guard, mail hauberk under a side-coloured tabard with a gold hem, gold belt, pauldrons,
// greaves with knee cops, a short cape, a kite shield on the left arm and a spear with a
// pennant in the right hand.
// Body is a signed-distance sculpt (surface nets, see sdf.js); helm, shield and spear are plain
// geometry so their edges stay crisp. One material per side (common.js), 1 draw call per side.
// Overhead read: the smallest plinth of the set + a small round helm (gold / steel) with a point,
// shoulders and cape in the side colour, spear tip and shield as small accents.
// The figure is turned 3/4 toward its owner (YAW): the board then faces it screen-left/right
// like the other fantasy figures, but the shield arm comes round toward the player's camera.
import { sdf, P, inter, offset, union, colorize } from './sdf.js';
import { PAL, rgb, mixRGB, scaleRGB, sstep, prep, paintAbs, plinth, assemble } from './common.js';

const L = { body: 1, mail: 2, cloth: 3, cape: 4, trim: 5, plate: 6, skin: 7, boot: 8, glove: 9 };
const U = (u, v, x = 0) => [x, v, -u];            // author in (u forward = -z, v up, x = figure's right)
const { sin, cos, atan2, hypot, max, min, abs, PI } = Math;
export const YAW = 0.5;                           // 3/4 turn toward the owning player
const SPEAR = { x: 0.128, u: 0.035 };
const BASE = 0.12;                                // plinth top

let cache = null;
let F = null;                                     // shape fns kept for painting
function field(THREE) {
  if (cache) return cache;
  const S = sdf();
  // ---- legs: right leg back, left leg forward (a marching stance); greaves below the knee
  const leg = (sx, uK, uA, uT) => P.chain([[...U(0, 0.36, sx * 0.042), 0.034], [...U(uK, 0.25, sx * 0.047), 0.027], [...U(uA, BASE + 0.035, sx * 0.047), 0.022]]);
  const legR = leg(1, -0.006, -0.025), legL = leg(-1, 0.022, 0.04);
  S.add(legR, L.boot).add(legL, L.boot, 0.01);
  // feet (boots)
  S.add(P.capsule(U(-0.03, BASE + 0.02, 0.048), U(0.02, BASE + 0.016, 0.05), 0.022, 0.018), L.boot, 0.02);
  S.add(P.capsule(U(0.035, BASE + 0.02, -0.048), U(0.085, BASE + 0.016, -0.05), 0.022, 0.018), L.boot, 0.02);
  // knee cops (plate)
  S.add(P.ellipsoid(...U(0.0, 0.252, 0.047), 0.03, 0.028, 0.026), L.plate, 0.008);
  S.add(P.ellipsoid(...U(0.03, 0.252, -0.047), 0.03, 0.028, 0.026), L.plate, 0.008);
  // ---- hauberk skirt: a flared cone with a dagged hem
  const skirtCone = P.capsule(U(0, 0.44), U(0.005, 0.27), 0.07, 0.093);
  const hemY = (x, y, z) => 0.285 + 0.005 * sin(atan2(x, -z) * 10);
  const skirt = (x, y, z) => max(skirtCone(x, y, z), hemY(x, y, z) - y);
  S.add(skirt, L.mail, 0.015);
  // ---- torso (chest forward a touch), belt
  const torso = P.ellipsoid(...U(0.006, 0.5), 0.082, 0.1, 0.06);
  S.add(torso, L.mail, 0.04);
  // tabard: a raised cloth panel front + back (real geometry, so its edge is a crisp step), gold hem
  const body = union([torso, skirt], 0.03);
  const tabW = (y) => 0.05 + 0.022 * sstep(0.42, 0.3, y);
  S.add(inter(offset(body, 0.009), (x, y, z) => max(abs(x) - tabW(y), y - 0.583, 0.296 - y), 0.004), L.cloth, 0.004);
  S.add(inter(offset(body, 0.012), (x, y, z) => max(abs(x) - tabW(y) - 0.004, abs(y - 0.3) - 0.009), 0.003), L.trim, 0.003);
  const ell = (a, b, cy, r) => (x, y, z) => hypot((hypot(x / a, (z + 0.004) / b) - 1) * min(a, b), y - cy) - r;
  S.add(ell(0.083, 0.064, 0.418, 0.012), L.trim, 0.006);
  // ---- cape: a thicker back from the shoulders to just above the hem
  const back = union([torso, skirtCone], 0.04);
  const capeHem = (x, y, z) => 0.31 + 0.012 * sin(x * 70) - 0.02 * sstep(0.02, 0.09, z);
  S.add((x, y, z) => max(offset(back, 0.013)(x, y, z), -z + 0.012, capeHem(x, y, z) - y, y - 0.585), L.cape, 0.006);
  // ---- shoulders: pauldrons over the arms
  S.add(P.ellipsoid(...U(0, 0.566, 0.09), 0.04, 0.027, 0.043), L.plate, 0.012);
  S.add(P.ellipsoid(...U(0.005, 0.566, -0.09), 0.04, 0.027, 0.043), L.plate, 0.012);
  // gorget + neck + head
  S.add(P.capsule(U(0, 0.585), U(0, 0.62), 0.036, 0.024), L.plate, 0.015);
  S.add(P.sphere(...U(0.006, 0.646), 0.039), L.skin, 0.02);
  S.add(P.ellipsoid(...U(0.045, 0.638), 0.01, 0.014, 0.012), L.skin, 0.006);       // nose
  // ---- right arm: shoulder -> elbow -> fist round the spear
  const hand = U(SPEAR.u, 0.45, SPEAR.x);
  S.add(P.chain([[...U(0, 0.555, 0.1), 0.03], [...U(-0.012, 0.48, 0.126), 0.026], [...U(SPEAR.u - 0.01, 0.452, SPEAR.x - 0.012), 0.023]]), L.mail, 0.015);
  S.add(P.capsule(U(-0.006, 0.505, 0.122), U(SPEAR.u - 0.016, 0.455, SPEAR.x - 0.016), 0.028, 0.025), L.plate, 0.004);   // vambrace
  S.add(P.sphere(...hand, 0.021), L.glove, 0.008);
  // ---- left arm: bent forward, holding the shield straps
  S.add(P.chain([[...U(0.005, 0.555, -0.1), 0.03], [...U(-0.005, 0.475, -0.128), 0.026], [...U(0.03, 0.45, -0.13), 0.023]]), L.mail, 0.015);
  S.add(P.sphere(...U(0.036, 0.448, -0.13), 0.02), L.glove, 0.008);
  F = { torso, skirt };
  cache = S.mesh(THREE, { min: [-0.165, BASE - 0.01, -0.15], max: [0.165, 0.7, 0.15], cell: 0.0168 });
  return cache;
}

/** Spangenhelm: gold brow band, dome with four ribs, a point + a gold finial bead. */
function helm(THREE, kit, p, w) {
  const prof = kit.profile()
    .pt(0.0, 0.632).pt(0.047, 0.634).pt(0.052, 0.64).arc(0.049, 0.648, 0.009, -50, 90, 3)
    .pt(0.05, 0.659).bez(0.053, 0.702, 0.026, 0.73, 5).bez(0.012, 0.742, 0.0, 0.76, 3);
  const g = prep(THREE, kit.lathe(prof.points(), { segments: 20 }), rgb(THREE, w ? p.metal : '#aeb2be'), { metal: 1 });
  const trim = rgb(THREE, p.trim), cloth = rgb(THREE, p.cloth);
  paintAbs(g, (x, y, z) => {
    if (y < 0.658) return { c: trim, metal: 1 };                     // brow band
    const a = atan2(x, -z), rib = abs(sin(a * 2));                     // ribs front/back/sides
    if (y < 0.676 && y > 0.662) return { c: cloth, metal: 0 };         // side-colour band (overhead ring)
    if (rib < 0.2 && y < 0.73) return { c: trim, metal: 1 };
    return null;
  });
  // nasal guard (gold strip down the nose) + finial bead
  const nasal = prep(THREE, kit.place(kit.bevelBox(0.014, 0.05, 0.008, 0.003, 1), { y: 0.632, z: -0.05, rx: -0.12 }), trim, { metal: 1 });
  const bead = prep(THREE, kit.place(kit.sphere(0.011, 8, 6), { y: 0.762 }), trim, { metal: 1 });
  return [g, nasal, bead];
}

/** Kite shield on the left arm: gold rim, side-colour field, gold cross + boss. */
function shield(THREE, kit, p, w) {
  const H = 0.215, W = 0.14;
  const kite = (s) => {
    const sh = new THREE.Shape();
    const w2 = W / 2 * s, top = H * 0.38 * s, bot = -H * 0.62 * s;
    sh.moveTo(-w2, top - 0.012 * s);
    sh.quadraticCurveTo(0, top + 0.016 * s, w2, top - 0.012 * s);
    sh.bezierCurveTo(w2 * 1.04, top - 0.07 * s, w2 * 0.75, bot * 0.45, 0, bot);
    sh.bezierCurveTo(-w2 * 0.75, bot * 0.45, -w2 * 1.04, top - 0.07 * s, -w2, top - 0.012 * s);
    return sh;
  };
  const trim = rgb(THREE, p.trim);
  const parts = [];
  const rim = prep(THREE, kit.extrude(kite(1), { depth: 0.01, bevel: 0.004, bevelSegments: 1, curveSegments: 6 }), trim, { metal: 1 });
  const field = prep(THREE, kit.place(kit.extrude(kite(0.84), { depth: 0.004, bevel: 0.002, bevelSegments: 1, curveSegments: 6 }), { z: 0.007 }), rgb(THREE, p.cloth));
  const pale = prep(THREE, kit.place(kit.bevelBox(0.016, H * 0.72, 0.004, 0.0015, 1), { y: -0.018, z: 0.0105 }), trim, { metal: 1 });
  const fess = prep(THREE, kit.place(kit.bevelBox(W * 0.74, 0.016, 0.004, 0.0015, 1), { y: 0.022, z: 0.0105 }), trim, { metal: 1 });
  const boss = prep(THREE, kit.place(kit.sphere(0.017, 10, 5), { y: 0.022, z: 0.011, sz: 0.55 }), trim, { metal: 1 });
  parts.push(rim, field, pale, fess, boss);
  for (const g of parts) {
    // curve it (edges sweep back) and lean the top back a little
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - 3.2 * pos.getX(i) ** 2);
    g.computeVertexNormals();
    kit.place(g, { rx: -0.18 });
    kit.place(g, { ry: -1.95, x: -0.155, y: 0.43, z: -0.042 });       // on the left forearm, facing out to the side
  }
  return parts;
}

/** Spear: ash/iron shaft, gold socket, leaf blade, swallow-tailed pennant in the side colour. */
function spear(THREE, kit, p, w) {
  const x = SPEAR.x, z = -SPEAR.u, top = 0.73;
  const trim = rgb(THREE, p.trim);
  const shaft = prep(THREE, kit.place(kit.cylinder(0.0075, 0.009, top - BASE, 7), { x, y: (top + BASE) / 2, z }), rgb(THREE, w ? '#c9a46a' : '#3a3540'), { metal: w ? 0 : 0.8 });
  const socket = prep(THREE, kit.place(kit.cylinder(0.011, 0.0095, 0.03, 8), { x, y: top + 0.008, z }), trim, { metal: 1 });
  const bladeProf = kit.profile().pt(0, top + 0.02).pt(0.009, top + 0.024).bez(0.024, top + 0.045, 0.012, top + 0.075, 2).pt(0, top + 0.098);
  const blade = prep(THREE, kit.place(kit.lathe(bladeProf.points(), { segments: 4 }), { x, z, sz: 0.4 }), rgb(THREE, w ? '#fff2cf' : '#c4c8d2'), { metal: 1 });
  // pennant: flies backward (+z), swallow-tailed
  const pts = [[0, 0], [0.082, -0.006], [0.062, -0.022], [0.078, -0.04], [0, -0.034]];
  const flag = prep(THREE, kit.extrude(pts, { depth: 0.004, bevel: 0 }), rgb(THREE, p.cloth));
  const pos = flag.attributes.position;
  for (let i = 0; i < pos.count; i++) { const fx = pos.getX(i); pos.setZ(i, pos.getZ(i) + 0.012 * sin(fx * 60)); }
  flag.computeVertexNormals();
  paintAbs(flag, (fx) => (fx < 0.012 ? { c: trim, metal: 1 } : null));
  kit.place(flag, { ry: -PI / 2, x, y: top - 0.012, z });
  return [shaft, socket, blade, flag];
}

export function pawn(THREE, kit, { color }) {
  const p = PAL[color], w = color === 'w';
  const f = field(THREE);
  const C = h => rgb(THREE, h);
  const cloth = C(p.cloth), deep = C(p.clothDeep), trim = C(p.trim);
  const mail = w ? C('#e6dcc4') : C('#7a7e8a');
  const plate = w ? C(p.metal) : C('#a4a8b4');
  const boot = w ? C('#8a6a44') : C('#2a2226');
  const skin = mixRGB(C(p.body), C(w ? '#e8c9a8' : '#3a3036'), 0.6);
  const g = colorize(THREE, { geom: f.geom.clone(), labels: f.labels }, (l, x, y, z) => {
    switch (l) {
      case L.plate: return [...plate, 0, w ? 1 : 0.55];
      case L.trim: return [...trim, 0, 1];
      case L.skin: return [...skin, 0, 0];
      case L.glove: return [...(w ? C('#a07a4c') : C('#2e2a30')), 0, w ? 0 : 0.6];
      case L.cape: return [...mixRGB(deep, cloth, sstep(0.3, 0.55, y)), 0, 0];
      case L.boot: {
        // greave plate over the shin, boot below, leather above the knee
        if (y > 0.18 && y < 0.24) return [...plate, 0, 1];
        return [...boot, 0, 0];
      }
      case L.cloth: return [...mixRGB(deep, cloth, sstep(0.3, 0.52, y)), 0, 0];
      default: return [...scaleRGB(mail, 0.8 + 0.2 * sstep(0.27, 0.5, y)), 0, w ? 0.45 : 0.75];   // mail hauberk
    }
  });
  const parts = [g, ...helm(THREE, kit, p, w), ...shield(THREE, kit, p, w), ...spear(THREE, kit, p, w)];
  // a sturdier stance: broaden the figure a touch (keeps the feet on the plinth), then turn it 3/4
  for (const m of parts) { m.translate(0, -BASE, 0); m.scale(1.2, 1.1, 1.2); m.translate(0, BASE, 0); m.rotateY(YAW); }
  return assemble(kit, color, [...plinth(THREE, kit, color, { R: 0.3, H: BASE, seg: 24 }), ...parts]);
}
