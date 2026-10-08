// Jon's head as one smooth SDF (skull, face, chin, cheeks, nose, ears, eye sockets). See human_head.js.
import { sphere, ellipsoid, capsule } from './shared/sdf.js';
import { makeHead, marchZ } from './human_head.js';
export { marchZ };

export const BASE = [
  [ellipsoid([0, 1.648, 0.012], [0.112, 0.148, 0.128]), 0],
  [ellipsoid([0, 1.575, 0.045], [0.094, 0.098, 0.104]), 0.04],
  [ellipsoid([0, 1.505, 0.068], [0.058, 0.044, 0.068]), 0.035],
  [sphere([0, 1.49, 0.112], 0.03), 0.025],
  [sphere([0.058, 1.592, 0.098], 0.04), 0.03],
  [sphere([-0.058, 1.592, 0.098], 0.04), 0.03],
  // short, round cartoon nose (Aaron: the old one was too long)
  [capsule([0, 1.662, 0.13], [0, 1.628, 0.158], 0.018, 0.024), 0.016],
  [sphere([0, 1.616, 0.168], 0.031), 0.014],
  [ellipsoid([0.111, 1.632, 0.0], [0.014, 0.04, 0.028], [0, 0.4, -0.1]), 0.008],
  [ellipsoid([-0.111, 1.632, 0.0], [0.014, 0.04, 0.028], [0, -0.4, 0.1]), 0.008],
];

let DATA = null;
try { DATA = (await import('./jon_head_data.js')).HEAD_DATA; } catch { DATA = null; }
export const HEAD = makeHead(BASE, { data: DATA });
export const { headBase, headSDF, EYE, EYE_R, surfZ, meshHead, headMesh } = HEAD;
