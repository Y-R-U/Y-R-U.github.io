// Garfield's sculpt: smooth-unioned SDF primitives, each owned by one bone (for skin weights).
// build({fat}) — fat 0..1 swells the belly (used to bake the belly morph target).
import { ellipsoid, capsule, sphere, scaled } from '../../js/actors/shared/sdf.js';

const mir = (v) => [-v[0], v[1], v[2]];
const lerp = (a, b, t) => a + (b - a) * t;

export function build({ fat = 0 } = {}) {
  const P = [];
  const add = (bone, d, k = 0.03) => P.push({ bone, d, k });
  const both = (boneL, mk, k) => { add(boneL, mk(1), k); add(boneL.replace(/L$/, 'R'), mk(-1), k); };

  // torso
  add('chest', ellipsoid([0, 0.265, 0.09], [0.155, 0.158, 0.15]), 0);
  add('spine', ellipsoid([0, 0.26, -0.05], [0.165, 0.155, 0.13]), 0.06);
  add('hips', ellipsoid([0, 0.255, -0.175], [0.165, 0.155, 0.145]), 0.06);
  both('chest', (s) => ellipsoid([s * 0.072, 0.37, 0.07], [0.065, 0.05, 0.085]), 0.06); // shoulder blades
  both('hips', (s) => ellipsoid([s * 0.075, 0.355, -0.19], [0.075, 0.055, 0.095]), 0.06); // rump top
  const bc = [0, lerp(0.205, 0.2, fat), lerp(-0.03, 0.0, fat)];
  const br = [lerp(0.185, 0.31, fat), lerp(0.14, 0.205, fat), lerp(0.2, 0.31, fat)];
  add('belly', ellipsoid(bc, br), 0.07);
  add('neck', ellipsoid([0, 0.33, 0.175], [0.12, 0.11, 0.095]), 0.06);

  // head
  add('head', ellipsoid([0, 0.405, 0.245], [0.152, 0.122, 0.128]), 0.05);
  add('head', ellipsoid([0, 0.44, 0.215], [0.12, 0.085, 0.11]), 0.05); // crown
  both('head', (s) => ellipsoid([s * 0.085, 0.36, 0.3], [0.085, 0.068, 0.075], [0, 0, s * -0.25]), 0.04); // jowls
  both('head', (s) => capsule([s * 0.145, 0.365, 0.265], [s * 0.172, 0.35, 0.27], 0.03, 0.014), 0.035); // cheek fluff
  both('head', (s) => ellipsoid([s * 0.032, 0.355, 0.358], [0.043, 0.035, 0.036]), 0.02); // muzzle lobes
  add('jaw', ellipsoid([0, 0.318, 0.33], [0.042, 0.026, 0.035]), 0.03); // chin

  // ears: small rounded triangles (classic Garfield), flattened front-to-back
  both('earL', (s) => {
    const base = [s * 0.1, 0.48, 0.215], tip = [s * 0.128, 0.528, 0.207];
    return scaled(capsule(base, tip, 0.052, 0.024), base, [1, 1, 0.5]);
  }, 0.03);

  // front legs
  both('shoulderL', (s) => capsule([s * 0.095, 0.25, 0.13], [s * 0.095, 0.13, 0.155], 0.064, 0.054), 0.045);
  both('elbowL', (s) => capsule([s * 0.095, 0.13, 0.155], [s * 0.092, 0.05, 0.172], 0.054, 0.047), 0.03);
  both('pawL', (s) => ellipsoid([s * 0.092, 0.032, 0.192], [0.05, 0.032, 0.062]), 0.03);
  for (const tx of [-1, 0, 1]) both('pawL', (s) => sphere([s * (0.092 + tx * 0.022), 0.026, 0.243 - Math.abs(tx) * 0.008], 0.021), 0.012);

  // hind legs
  both('thighL', (s) => ellipsoid([s * 0.125, 0.2, -0.17], [0.085, 0.115, 0.12]), 0.05);
  both('shinL', (s) => capsule([s * 0.112, 0.13, -0.18], [s * 0.106, 0.05, -0.165], 0.056, 0.048), 0.035);
  both('footL', (s) => ellipsoid([s * 0.106, 0.032, -0.14], [0.052, 0.032, 0.068]), 0.03);
  for (const tx of [-1, 0, 1]) both('footL', (s) => sphere([s * (0.106 + tx * 0.023), 0.026, -0.084 - Math.abs(tx) * 0.008], 0.021), 0.012);

  // tail
  const T = [[0, 0.235, -0.285], [0, 0.245, -0.39], [0, 0.27, -0.47], [0, 0.31, -0.54], [0, 0.37, -0.59], [0, 0.43, -0.615], [0, 0.49, -0.622]];
  const TR = [0.045, 0.042, 0.04, 0.039, 0.038, 0.037, 0.034];
  for (let i = 0; i < 6; i++) add('tail' + i, capsule(T[i], T[i + 1], TR[i], TR[i + 1]), i === 0 ? 0.05 : 0.015);

  return P;
}

// Paint volumes (not geometry): tone channels x=cream, y=pink
export function paint() {
  return [
    { ch: 0, d: ellipsoid([0, 0.17, 0.02], [0.13, 0.13, 0.26]) }, // belly/chest front
    { ch: 0, d: ellipsoid([0, 0.27, 0.2], [0.09, 0.08, 0.06]) },  // chest bib
    { ch: 0, d: ellipsoid([0, 0.345, 0.36], [0.085, 0.05, 0.06]) }, // muzzle
    { ch: 0, d: ellipsoid([0, 0.31, 0.33], [0.06, 0.035, 0.06]) },  // chin
    ...[1, -1].flatMap((s) => [
      { ch: 0, d: ellipsoid([s * 0.092, 0.02, 0.235], [0.055, 0.03, 0.032]) },   // front toes
      { ch: 0, d: ellipsoid([s * 0.106, 0.02, -0.09], [0.057, 0.03, 0.032]) },  // hind toes
    ]),
    { ch: 1, d: scaled(capsule([0.1, 0.483, 0.238], [0.128, 0.538, 0.232], 0.032, 0.006), [0.1, 0.483, 0.238], [1, 1, 0.5]) },
    { ch: 1, d: scaled(capsule([-0.1, 0.483, 0.238], [-0.128, 0.538, 0.232], 0.032, 0.006), [-0.1, 0.483, 0.238], [1, 1, 0.5]) },
  ];
}

export const BOUNDS = { min: [-0.24, -0.01, -0.68], max: [0.24, 0.62, 0.43] };
export const BOUNDS_FAT = { min: [-0.32, -0.02, -0.68], max: [0.32, 0.62, 0.43] };
export { mir };
