// Tiny SDF toolkit (pure JS, runs in node and the browser). Used by the offline sculpt bakers.
// A primitive is {d(p)->signed distance, bone, mat, k}. p is [x,y,z].

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// rotation matrix from euler XYZ (radians); returns fn mapping world->local
function invRot(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz*Ry*Rx (three.js 'XYZ' order applies X first); local = R^T * world
  const m = [
    cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
    cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
    -sy, sx * cy, cx * cy,
  ];
  return (x, y, z) => [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
}

export function sphere(c, r) {
  return (p) => len3(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
}

export function ellipsoid(c, r, rot) {
  const inv = rot ? invRot(...rot) : null;
  return (p) => {
    let x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
    if (inv) [x, y, z] = inv(x, y, z);
    const k0 = len3(x / r[0], y / r[1], z / r[2]);
    const k1 = len3(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
    return k1 === 0 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
  };
}

// tapered capsule a->b with radii ra->rb; optional per-axis squash (scale of the cross-section) via flat=[sx,sz-ish]
export function capsule(a, b, ra, rb = ra) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const L2 = bax * bax + bay * bay + baz * baz;
  return (p) => {
    const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
    const t = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / L2));
    return len3(pax - bax * t, pay - bay * t, paz - baz * t) - (ra + (rb - ra) * t);
  };
}

// scale a primitive's space (non-uniform) around a centre: approximate distance
export function scaled(fn, c, s) {
  const m = Math.min(s[0], s[1], s[2]);
  return (p) => fn([c[0] + (p[0] - c[0]) / s[0], c[1] + (p[1] - c[1]) / s[1], c[2] + (p[2] - c[2]) / s[2]]) * m;
}

// Evaluate a sculpt: prims [{d, k, op:'add'|'sub'}]; returns combined distance.
export function evalSculpt(prims, p, out) {
  let d = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const pr = prims[i];
    const di = pr.d(p);
    if (out) out[i] = di;
    if (pr.op === 'sub') d = smax(d, -di, pr.k || 0);
    else d = smin(d, di, pr.k || 0);
  }
  return d;
}

export function gradient(f, p, e = 0.0005) {
  const gx = f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]);
  const gy = f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]);
  const gz = f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e]);
  const l = len3(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}
