// Lyman's head: Jon's skull with a stronger jaw/chin, fuller cheeks and a big round nose (moustache sits below it).
import { sphere, ellipsoid, capsule } from './shared/sdf.js';
import { makeHead } from './human_head.js';

export const BASE = [
  [ellipsoid([0, 1.648, 0.012], [0.112, 0.148, 0.128]), 0],
  [ellipsoid([0, 1.575, 0.045], [0.1, 0.1, 0.106]), 0.04],
  [ellipsoid([0, 1.507, 0.066], [0.07, 0.048, 0.07]), 0.035],
  [sphere([0, 1.49, 0.112], 0.034), 0.025],
  [sphere([0.06, 1.594, 0.1], 0.043), 0.03],
  [sphere([-0.06, 1.594, 0.1], 0.043), 0.03],
  [capsule([0, 1.668, 0.13], [0, 1.632, 0.164], 0.02, 0.027), 0.016],
  [sphere([0, 1.614, 0.176], 0.037), 0.014],
  [ellipsoid([0.111, 1.632, 0.0], [0.014, 0.04, 0.028], [0, 0.4, -0.1]), 0.008],
  [ellipsoid([-0.111, 1.632, 0.0], [0.014, 0.04, 0.028], [0, -0.4, 0.1]), 0.008],
];

let DATA = null;
try { DATA = (await import('./lyman_head_data.js')).HEAD_DATA; } catch { DATA = null; }
export const HEAD = makeHead(BASE, { data: DATA });
