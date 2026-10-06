// Jon's head as one smooth SDF (skull, face, chin, cheeks, nose, ears, eye sockets), meshed at load time
// with the shared surface-nets + QEM decimation helpers. Root space, bind pose.
import { smin, smax, sphere, ellipsoid, capsule } from './shared/sdf.js';
import { sdfMesh } from './shared/surfacenets.js';
import { decimate } from './shared/decimate.js';

const U = (prims) => (p) => {
  let d = 1e9;
  for (const [f, k, sub] of prims) d = sub ? smax(d, -f(p), k) : smin(d, f(p), k);
  return d;
};

const BASE = [
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
export const headBase = U(BASE);

// march along -Z from the front to find the face surface
export function marchZ(f, x, y, z0 = 0.35) {
  let z = z0;
  for (let i = 0; i < 200 && z > -0.2; i++) {
    const d = f([x, y, z]);
    if (d < 0.0003) return z;
    z -= Math.max(0.0008, d * 0.8);
  }
  return 0;
}

export const EYE = (() => { const y = 1.676, x = 0.047; return [x, y, marchZ(headBase, x, y) - 0.026]; })();
export const EYE_R = 0.043;
const full = U([...BASE,
  [sphere([EYE[0], EYE[1], EYE[2]], EYE_R * 1.02), 0.012, true],
  [sphere([-EYE[0], EYE[1], EYE[2]], EYE_R * 1.02), 0.012, true],
  // little ear bowls
  [ellipsoid([0.122, 1.632, 0.004], [0.006, 0.026, 0.017], [0, 0.4, 0]), 0.004, true],
  [ellipsoid([-0.122, 1.632, 0.004], [0.006, 0.026, 0.017], [0, -0.4, 0]), 0.004, true],
]);
export const headSDF = full;
export const surfZ = (x, y) => marchZ(full, x, y);

export function meshHead(quality) {
  const target = { high: 2300, medium: 1400, low: 850 }[quality] ?? 2300;
  const m = sdfMesh(full, [-0.15, 1.42, -0.15], [0.15, 1.82, 0.25], 0.0055, { relaxIters: 2 });
  return decimate(m.pos, m.idx, target);
}

const cache = {};
const unb64 = (s, T) => {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new T(u8.buffer);
};
let DATA = null;
try { DATA = (await import('./jon_head_data.js')).HEAD_DATA; } catch { DATA = null; }
export function headMesh(quality = 'high') {
  if (cache[quality]) return cache[quality];
  const d = DATA?.[quality];
  return (cache[quality] = d ? { pos: unb64(d.pos, Float32Array), idx: unb64(d.idx, Uint16Array) } : meshHead(quality));
}
