// Fantasy Knight — an armoured warhorse bust on a figurine plinth.
// Sculpted as a signed-distance field (smooth unions of capsules/ellipsoids) and meshed with
// surface nets, so the neck, jowl and muzzle blend like a carved figurine. On top of the horse:
// a gold chanfron (face plate) with a horn spike, a noseband, lamellar crinet plates down the
// neck, a feathered crest plume in the side colour, a scalloped caparison with a gold hem, and
// small glowing eyes.
// Overhead read: a long head pointing sideways (muzzle → -z here; the board turns it), the
// plume a coloured stripe behind it, ears as two nubs.
import { sdf, P, inter, offset, mirrorX, union, colorize } from './sdf.js';
import { PAL, rgb, scaleRGB, mixRGB, sstep, plinth, assemble } from './common.js';

const L = { head: 1, plume: 2, cloth: 3, eye: 4, plate: 5, trim: 6, lame: 7, dark: 8, ear: 9 };
const U = (u, v, x = 0) => [x, v, -u];          // author in (u forward, v up)
const { sin, cos, atan2, hypot, max, min, PI } = Math;

let cache = null, neckF = null;   // the meshed field is identical for both sides; only colours differ
function field(THREE) {
  if (cache) return cache;
  const S = sdf();
  // ---- neck: a spine of tapered capsules, deeper than it is wide (sx < 1)
  const neck = P.chain([
    [...U(-0.07, 0.10), 0.165], [...U(-0.085, 0.30), 0.135], [...U(-0.06, 0.50), 0.108], [...U(-0.02, 0.665), 0.088],
  ], 0.78);
  S.add(neck, L.head); neckF = neck;
  // ---- head
  const cranium = P.ellipsoid(...U(0.0, 0.775), 0.082, 0.088, 0.1);
  const jowl = P.ellipsoid(...U(-0.005, 0.685), 0.088, 0.085, 0.092);
  const face = P.capsule(U(0.05, 0.775), U(0.275, 0.615), 0.074, 0.057, 0.78);
  const muzzle = P.ellipsoid(...U(0.292, 0.596), 0.058, 0.064, 0.066);
  const chin = P.ellipsoid(...U(0.245, 0.548), 0.04, 0.036, 0.05);
  S.add(cranium, L.head, 0.05).add(jowl, L.head, 0.06).add(face, L.head, 0.06).add(muzzle, L.head, 0.05).add(chin, L.head, 0.03);
  // ears: flattened tapered cones, splayed a little
  S.add(mirrorX(P.capsule(U(-0.025, 0.85, 0.045), U(-0.005, 0.99, 0.062), 0.03, 0.006, 1)), L.ear, 0.025);
  // nostrils + eye sockets (carved, darkened)
  S.cut(mirrorX(P.ellipsoid(...U(0.33, 0.6, 0.03), 0.016, 0.02, 0.016)), 0.01, L.dark);
  S.cut(mirrorX(P.sphere(...U(0.06, 0.755, 0.08), 0.024)), 0.012, L.dark);
  S.add(mirrorX(P.ellipsoid(...U(0.062, 0.756, 0.068), 0.014, 0.017, 0.021)), L.eye, 0);

  // a frame along the face: t along the nose line, s = height above it
  const A = [0.03, 0.8], D = [0.27, -0.2], DL = hypot(...D), d = [D[0] / DL, D[1] / DL], n = [-d[1], d[0]];
  const faceT = (x, y, z) => ((-z) - A[0]) * d[0] + (y - A[1]) * d[1];
  const faceS = (x, y, z) => ((-z) - A[0]) * n[0] + (y - A[1]) * n[1];
  const headSet = union([cranium, face, muzzle], 0.05);

  // ---- chanfron: shell over the top half of the face, from the brow to above the nostrils
  const chanfronRegion = (x, y, z) => max(-faceS(x, y, z) + 22 * x * x - 0.002, faceT(x, y, z) - 0.235, -faceT(x, y, z) - 0.05);
  S.add(inter(offset(headSet, 0.011), chanfronRegion, 0.008), L.plate, 0.006);
  // centre ridge on the plate + horn spike rising from the brow
  S.add(inter(offset(headSet, 0.017), (x, y, z) => max(Math.abs(x) - 0.012, chanfronRegion(x, y, z)), 0.004), L.plate, 0.004);
  S.add(P.capsule(U(0.085, 0.825), U(0.175, 0.985), 0.03, 0.002), L.plate, 0.012);
  // noseband (gold strap round the face)
  S.add(inter(offset(headSet, 0.009), (x, y, z) => Math.abs(faceT(x, y, z) - 0.262) - 0.011, 0.003), L.trim, 0);

  // ---- crest plume: swept feather tufts along the crest, flattened side to side
  const crest = [[-0.075, 0.83], [-0.1, 0.77], [-0.122, 0.71], [-0.142, 0.65], [-0.16, 0.59], [-0.174, 0.53], [-0.186, 0.47], [-0.195, 0.41]];
  crest.forEach(([u, v], i) => {
    const r = 0.046 - i * 0.0015;
    S.add(P.capsule(U(u + 0.035, v - 0.012), U(u - 0.04, v + 0.026), r, 0.022, 0.6), L.plume, 0.04);
  });

  // ---- caparison: cloth over the lower neck with folds and a scalloped hem, gold trim at the hem
  const hem = (x, y, z) => {
    const a = atan2(x, (-z) + 0.07);                    // angle round the neck (0 = front/throat)
    return 0.3 + 0.07 * (1 - cos(a)) * 0.5 + 0.018 * cos(a * 7);   // higher at the back, dagged
  };
  const folds = (x, y, z) => {
    const a = atan2(x, (-z) + 0.07);
    return 0.007 * sin(a * 11) * sstep(0.36, 0.16, y);
  };
  const clothShape = (x, y, z) => neck(x, y, z) - 0.012 - max(0, (0.26 - y)) * 0.12 - folds(x, y, z);
  S.add((x, y, z) => max(clothShape(x, y, z), y - hem(x, y, z)), L.cloth, 0.0);
  S.add((x, y, z) => max(clothShape(x, y, z) - 0.005, Math.abs(y - hem(x, y, z) + 0.016) - 0.011), L.trim, 0.004);

  cache = S.mesh(THREE, { min: [-0.22, 0.09, -0.4], max: [0.22, 1.02, 0.32], cell: 0.0195 });
  return cache;
}

export function knight(THREE, kit, { color }) {
  const p = PAL[color];
  const f = field(THREE);
  const C = h => rgb(THREE, h);
  const body = C(p.body), cloth = C(p.cloth), plume = C(p.plume), tip = C(p.plumeTip);
  const g = colorize(THREE, { geom: f.geom.clone(), labels: f.labels }, (l, x, y, z) => {
    switch (l) {
      case L.plume: return [...mixRGB(plume, tip, sstep(0.03, 0.07, neckF(x, y, z)) * 0.6), 0, 0];
      case L.cloth: return [...mixRGB(C(p.clothDeep), cloth, sstep(0.14, 0.3, y)), 0, 0];
      case L.eye: return [...C(p.gem), 0.9, 0];
      case L.dark: return [...C(p.dark), 0, 0];
      case L.ear: return [...(y > 0.9 ? mixRGB(body, C(p.bodyShade), 0.35) : body), 0, 0];
      case L.plate: return [...C(p.metal), 0, 1];
      case L.trim: return [...C(p.trim), 0, 1];
      default: return [...body, 0, 0];
    }
  });
  return assemble(kit, color, [...plinth(THREE, kit, color, { R: 0.37, H: 0.13 }), g]);
}
