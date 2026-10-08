// Delivery man's head: Jon's skull, broad round nose, full cheeks, rounder chin.
import { sphere, ellipsoid, capsule } from './shared/sdf.js';
import { makeHead } from './human_head.js';

export const BASE = [
  [ellipsoid([0, 1.648, 0.012], [0.114, 0.148, 0.128]), 0],
  [ellipsoid([0, 1.572, 0.045], [0.1, 0.1, 0.104]), 0.04],
  [ellipsoid([0, 1.505, 0.066], [0.064, 0.046, 0.068]), 0.035],
  [sphere([0, 1.492, 0.108], 0.032), 0.025],
  [sphere([0.062, 1.588, 0.098], 0.046), 0.03],
  [sphere([-0.062, 1.588, 0.098], 0.046), 0.03],
  [capsule([0, 1.664, 0.13], [0, 1.632, 0.152], 0.02, 0.026), 0.016],
  [ellipsoid([0, 1.616, 0.162], [0.04, 0.03, 0.03]), 0.014],
  [ellipsoid([0.111, 1.632, 0.0], [0.014, 0.04, 0.028], [0, 0.4, -0.1]), 0.008],
  [ellipsoid([-0.111, 1.632, 0.0], [0.014, 0.04, 0.028], [0, -0.4, 0.1]), 0.008],
];

let DATA = null;
try { DATA = (await import('./delivery_head_data.js')).HEAD_DATA; } catch { DATA = null; }
export const HEAD = makeHead(BASE, { data: DATA });
