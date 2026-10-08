// Odie's sculpt: smooth-unioned SDF primitives, each owned by one bone (skin weights by proximity).
// Lanky pale-yellow dog: long legs, slim body, long snout, long floppy black ears, thin black tail, big tongue.
import { ellipsoid, capsule, sphere, scaled } from '../../js/actors/shared/sdf.js';

export function build() {
  const P = [];
  const add = (bone, d, k = 0.03) => P.push({ bone, d, k });
  const both = (boneL, mk, k) => { add(boneL, mk(1), k); add(boneL.replace(/L(\d?)$/, 'R$1'), mk(-1), k); };

  // body: deep chest, tucked waist, small rump
  add('chest', ellipsoid([0, 0.45, 0.1], [0.1, 0.12, 0.13]), 0);
  add('spine', ellipsoid([0, 0.455, -0.04], [0.085, 0.085, 0.13]), 0.06);
  add('hips', ellipsoid([0, 0.455, -0.18], [0.092, 0.095, 0.11]), 0.06);
  add('chest', ellipsoid([0, 0.38, 0.13], [0.075, 0.07, 0.08]), 0.05);           // brisket
  add('neck', capsule([0, 0.5, 0.17], [0, 0.66, 0.26], 0.062, 0.05), 0.05);

  // head: round skull, long snout, droopy cheeks, separate lower jaw
  add('head', ellipsoid([0, 0.735, 0.275], [0.092, 0.09, 0.095]), 0.04);
  add('head', capsule([0, 0.705, 0.33], [0, 0.69, 0.485], 0.062, 0.05), 0.05);   // snout
  add('head', ellipsoid([0, 0.715, 0.42], [0.045, 0.03, 0.07]), 0.04);            // snout bridge
  both('head', (s) => ellipsoid([s * 0.045, 0.665, 0.42], [0.04, 0.035, 0.065]), 0.03); // jowls
  add('jaw', ellipsoid([0, 0.636, 0.405], [0.048, 0.022, 0.075]), 0.02);

  // long floppy ears: thick-ish flaps hanging from the crown sides (hard union below the root)
  both('earL0', (s) => scaled(capsule([s * 0.078, 0.79, 0.255], [s * 0.118, 0.69, 0.258], 0.034, 0.046), [s * 0.1, 0.74, 0.256], [0.36, 1, 1]), 0.014);
  both('earL1', (s) => scaled(capsule([s * 0.12, 0.69, 0.258], [s * 0.126, 0.585, 0.26], 0.047, 0.04), [s * 0.123, 0.64, 0.26], [0.32, 1, 1]), 0.016);

  // tongue: big, flat, lolling out of the side of the mouth
  add('tongue0', scaled(capsule([0.0, 0.64, 0.41], [0.032, 0.6, 0.47], 0.03, 0.034), [0.016, 0.62, 0.44], [1, 0.4, 1]), 0.006);
  add('tongue1', scaled(capsule([0.032, 0.6, 0.47], [0.042, 0.548, 0.486], 0.034, 0.03), [0.037, 0.574, 0.478], [1, 1, 0.38]), 0.012);

  // front legs: long and thin
  both('shoulderL', (s) => capsule([s * 0.076, 0.44, 0.15], [s * 0.078, 0.25, 0.18], 0.05, 0.034), 0.04);
  both('elbowL', (s) => capsule([s * 0.078, 0.25, 0.18], [s * 0.078, 0.07, 0.19], 0.032, 0.028), 0.025);
  both('pawL', (s) => ellipsoid([s * 0.078, 0.03, 0.22], [0.04, 0.03, 0.055]), 0.025);

  // hind legs: thigh, shin back to the hock, then down
  both('thighL', (s) => ellipsoid([s * 0.084, 0.37, -0.18], [0.058, 0.1, 0.075]), 0.05);
  both('shinL', (s) => capsule([s * 0.084, 0.27, -0.14], [s * 0.084, 0.13, -0.225], 0.04, 0.03), 0.03);
  both('hockL', (s) => capsule([s * 0.084, 0.13, -0.225], [s * 0.084, 0.05, -0.21], 0.03, 0.028), 0.02);
  both('footL', (s) => ellipsoid([s * 0.084, 0.03, -0.17], [0.04, 0.03, 0.055]), 0.025);

  // tail stub only; the thin whippy tail itself is a skinned tube built in odie.js
  add('tail0', capsule([0, 0.49, -0.26], [0, 0.515, -0.32], 0.026, 0.017), 0.03);
  return P;
}

// tone channels (ears/tail black + tongue pink come from bone weights in the baker): x = black (spot), y = tongue/mouth pink, z = pale belly/muzzle cream
export function paint() {
  return [
    { ch: 0, d: ellipsoid([0.1, 0.475, -0.07], [0.05, 0.06, 0.07]) },                 // THE spot (his left side)
    { ch: 2, d: ellipsoid([0, 0.36, 0.05], [0.07, 0.06, 0.2]) },
    { ch: 2, d: ellipsoid([0, 0.66, 0.44], [0.05, 0.035, 0.07]) },
  ];
}

export const BOUNDS = { min: [-0.2, -0.01, -0.5], max: [0.2, 0.86, 0.56] };
