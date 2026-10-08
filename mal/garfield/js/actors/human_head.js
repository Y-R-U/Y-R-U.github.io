// Generic SDF head for the human cast (Jon, Lyman, delivery man): skull/face primitives → smooth SDF with eye
// sockets + ear bowls, meshed with the shared surface-nets + QEM decimation (or loaded from a baked data module).
import { smin, smax, sphere, ellipsoid } from './shared/sdf.js';
import { sdfMesh } from './shared/surfacenets.js';
import { decimate } from './shared/decimate.js';

export const U = (prims) => (p) => {
  let d = 1e9;
  for (const [f, k, sub] of prims) d = sub ? smax(d, -f(p), k) : smin(d, f(p), k);
  return d;
};

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

const unb64 = (s, T) => {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new T(u8.buffer);
};

// base: primitive list [[sdf, k, sub?]]; data: baked {high,medium,low:{pos,idx}} or null
export function makeHead(base, { data = null, eye = [0.047, 1.676], eyeR = 0.043, extra = [], tris = { high: 2300, medium: 1400, low: 850 } } = {}) {
  const headBase = U(base);
  const EYE = [eye[0], eye[1], marchZ(headBase, eye[0], eye[1]) - 0.026];
  const full = U([...base,
    [sphere([EYE[0], EYE[1], EYE[2]], eyeR * 1.02), 0.012, true],
    [sphere([-EYE[0], EYE[1], EYE[2]], eyeR * 1.02), 0.012, true],
    [ellipsoid([0.122, 1.632, 0.004], [0.006, 0.026, 0.017], [0, 0.4, 0]), 0.004, true],
    [ellipsoid([-0.122, 1.632, 0.004], [0.006, 0.026, 0.017], [0, -0.4, 0]), 0.004, true],
    ...extra,
  ]);
  const surfZ = (x, y) => marchZ(full, x, y);
  function meshHead(quality) {
    const target = tris[quality] ?? tris.high;
    const m = sdfMesh(full, [-0.15, 1.42, -0.15], [0.15, 1.82, 0.25], 0.0055, { relaxIters: 2 });
    return decimate(m.pos, m.idx, target);
  }
  const cache = {};
  function headMesh(quality = 'high') {
    if (cache[quality]) return cache[quality];
    const d = data?.[quality];
    return (cache[quality] = d ? { pos: unb64(d.pos, Float32Array), idx: unb64(d.idx, Uint16Array) } : meshHead(quality));
  }
  return { headBase, headSDF: full, EYE, EYE_R: eyeR, surfZ, meshHead, headMesh };
}
