// Fantasy theme: a tiny signed-distance sculpting kit + a surface-nets mesher.
// Lets organic forms (horse heads, beards, sleeves) be modelled as smooth unions of
// primitives and polygonised once at load. Every primitive carries a label; the mesher
// reports a label per vertex so parts can be coloured / split into materials afterwards.
//
//   const S = sdf();                      // builder
//   S.add(S.capsule(a, b, ra, rb), 'body', 0.04)   // (dist fn, label, smooth-union radius)
//   const mesh = S.mesh(THREE, {min, max, cell})   // -> {geom: BufferGeometry, labels: Uint8Array per vertex}
//
// Distances are in piece units (1 = one square). Keep cells >= ~0.012 for budget.

const { sqrt, max, min, abs, hypot } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

// --------------------------------------------------------------- primitives
// each returns (x,y,z) => signed distance
export const P = {
  sphere: (cx, cy, cz, r) => (x, y, z) => hypot(x - cx, y - cy, z - cz) - r,
  /** ellipsoid (approximate, iq's bound) */
  ellipsoid: (cx, cy, cz, rx, ry, rz) => (x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
    const k0 = hypot(px, py, pz), k1 = hypot(px / rx, py / ry, pz / rz);
    return k1 === 0 ? -min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  },
  /** round cone / tapered capsule from a (radius ra) to b (radius rb). sx squashes x (width) */
  capsule: (a, b, ra, rb = ra, sx = 1) => {
    // work in squashed space (x / sx), so sx < 1 makes it thinner side to side
    const bax = (b[0] - a[0]) / sx, bay = b[1] - a[1], baz = b[2] - a[2];
    const l2 = bax * bax + bay * bay + baz * baz || 1e-9;
    const k = sx < 1 ? sx : 1;
    return (x, y, z) => {
      const px = (x - a[0]) / sx, py = y - a[1], pz = z - a[2];
      const h = clamp((px * bax + py * bay + pz * baz) / l2, 0, 1);
      return (hypot(px - bax * h, py - bay * h, pz - baz * h) - mix(ra, rb, h)) * k;
    };
  },
  /** rounded box centred at c with half extents h, corner radius r */
  box: (c, h, r = 0) => (x, y, z) => {
    const qx = abs(x - c[0]) - h[0] + r, qy = abs(y - c[1]) - h[1] + r, qz = abs(z - c[2]) - h[2] + r;
    return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r;
  },
  /** torus in the plane ⟂ y at height cy */
  torusY: (cx, cy, cz, R, r) => (x, y, z) => hypot(hypot(x - cx, z - cz) - R, y - cy) - r,
  /** half-space: keeps points where n·p < d (n need not be unit; it is normalised) */
  plane: (nx, ny, nz, d) => { const L = hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L; d /= L; return (x, y, z) => nx * x + ny * y + nz * z - d; },
  /** a polyline of tapered capsules: pts [[x,y,z,r],...] */
  chain: (pts, sx = 1) => {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push(P.capsule(pts[i], pts[i + 1], pts[i][3], pts[i + 1][3], sx));
    return (x, y, z) => { let d = Infinity; for (const s of segs) d = min(d, s(x, y, z)); return d; };
  },
};

// ------------------------------------------------------------- operators
export const smin = (a, b, k) => { if (k <= 0) return min(a, b); const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
export const inter = (f, g, k = 0) => (x, y, z) => smax(f(x, y, z), g(x, y, z), k);
export const sub = (f, g, k = 0) => (x, y, z) => smax(f(x, y, z), -g(x, y, z), k);
export const union = (fs, k = 0) => (x, y, z) => { let d = Infinity; for (const f of fs) d = smin(d, f(x, y, z), k); return d; };
export const offset = (f, o) => (x, y, z) => f(x, y, z) - o;
/** mirror across x = 0 (symmetric pairs: ears, eyes, arms) */
export const mirrorX = f => (x, y, z) => f(abs(x), y, z);

/**
 * Builder: ordered list of operations, each tagged with a label.
 *   add(f, label, k)    smooth union (label wins where it is the nearer surface)
 *   cut(f, k, label?)   smooth subtraction (carved surface takes `label` if given)
 *   paint(f, label)     relabel surface points inside f (no shape change)
 */
export function sdf() {
  const ops = [];
  let lab = 0;
  const api = {
    add(f, label, k = 0) { ops.push({ t: 0, f, label, k }); return api; },
    cut(f, k = 0, label = null) { ops.push({ t: 1, f, label, k }); return api; },
    paint(f, label) { ops.push({ t: 2, f, label }); return api; },
    /** distance; sets api.label */
    eval(x, y, z) {
      let d = Infinity; lab = 0;
      for (const o of ops) {
        const e = o.f(x, y, z);
        if (o.t === 0) {
          if (e < d) lab = o.label;
          d = smin(d, e, o.k);
        } else if (o.t === 1) {
          const nd = smax(d, -e, o.k);
          if (o.label != null && -e > d - 1e-4) lab = o.label;
          d = nd;
        } else if (e < 0) lab = o.label;
      }
      api.label = lab;
      return d;
    },
    label: 0,
    mesh(THREE, o) { return surfaceNets(THREE, api, o); },
  };
  return api;
}

/**
 * Surface nets over a regular grid. o = {min:[x,y,z], max:[x,y,z], cell, project=2}
 * Returns {geom (indexed, position+normal), labels (per vertex)}.
 */
export function surfaceNets(THREE, S, o) {
  const h = o.cell, mn = o.min, mx = o.max;
  const nx = Math.ceil((mx[0] - mn[0]) / h) + 1, ny = Math.ceil((mx[1] - mn[1]) / h) + 1, nz = Math.ceil((mx[2] - mn[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const I = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    F[I(i, j, k)] = S.eval(mn[0] + i * h, mn[1] + j * h, mn[2] + k * h);

  // one vertex per sign-changing cell
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const C = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [], labels = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  const e = 0.5 * h;
  const grad = (x, y, z) => [
    S.eval(x + e, y, z) - S.eval(x - e, y, z),
    S.eval(x, y + e, z) - S.eval(x, y - e, z),
    S.eval(x, y, z + e) - S.eval(x, y, z - e)];
  const project = o.project ?? 2;
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { const q = corners[c]; cv[c] = F[I(i + q[0], j + q[1], k + q[2])]; if (cv[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const da = cv[a], db = cv[b];
      if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db), A = corners[a], B = corners[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    let x = mn[0] + (i + sx / n) * h, y = mn[1] + (j + sy / n) * h, z = mn[2] + (k + sz / n) * h;
    // pull onto the true surface (sharpens creases), but stay inside the cell
    for (let p = 0; p < project; p++) {
      const d = S.eval(x, y, z), g = grad(x, y, z), gl = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (gl < 1e-12) break;
      const s = (d * 2 * e) / gl;
      x = clamp(x - g[0] * s, mn[0] + i * h, mn[0] + (i + 1) * h);
      y = clamp(y - g[1] * s, mn[1] + j * h, mn[1] + (j + 1) * h);
      z = clamp(z - g[2] * s, mn[2] + k * h, mn[2] + (k + 1) * h);
    }
    cellV[C(i, j, k)] = pos.length / 3;
    pos.push(x, y, z);
    // label: sample just inside the surface so the owning part wins
    const g = grad(x, y, z), gl = hypot(g[0], g[1], g[2]) || 1;
    S.eval(x - g[0] / gl * h * 0.3, y - g[1] / gl * h * 0.3, z - g[2] / gl * h * 0.3);
    labels.push(S.label);
  }
  // quads across every sign-changing grid edge
  const idx = [];
  const P3 = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // split along the shorter diagonal
    const A = P3(a), B = P3(b), Cc = P3(c), D = P3(d);
    const ac = hypot(A[0] - Cc[0], A[1] - Cc[1], A[2] - Cc[2]), bd = hypot(B[0] - D[0], B[1] - D[1], B[2] - D[2]);
    if (ac <= bd) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = F[I(i, j, k)] < 0, b = F[I(i + 1, j, k)] < 0; if (a === b) continue;
    quad(cellV[C(i, j - 1, k - 1)], cellV[C(i, j, k - 1)], cellV[C(i, j, k)], cellV[C(i, j - 1, k)], !a);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = F[I(i, j, k)] < 0, b = F[I(i, j + 1, k)] < 0; if (a === b) continue;
    quad(cellV[C(i - 1, j, k - 1)], cellV[C(i - 1, j, k)], cellV[C(i, j, k)], cellV[C(i, j, k - 1)], !a);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = F[I(i, j, k)] < 0, b = F[I(i, j, k + 1)] < 0; if (a === b) continue;
    quad(cellV[C(i - 1, j - 1, k)], cellV[C(i, j - 1, k)], cellV[C(i, j, k)], cellV[C(i - 1, j, k)], !a);
  }
  // normals from the field gradient (smooth, exact)
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) {
    const g = grad(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]), gl = hypot(g[0], g[1], g[2]) || 1;
    nrm[v * 3] = g[0] / gl; nrm[v * 3 + 1] = g[1] / gl; nrm[v * 3 + 2] = g[2] / gl;
  }
  // make winding agree with the gradient (cheap global check per triangle)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const A = P3(a), B = P3(b), Cc = P3(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const gx = nrm[a * 3] + nrm[b * 3] + nrm[c * 3], gy = nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1], gz = nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2];
    if (fx * gx + fy * gy + fz * gz < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geom.setIndex(idx);
  return { geom, labels: Uint8Array.from(labels) };
}

/**
 * Colour a labelled mesh per vertex: fn(label, x, y, z) -> [r, g, b, glow, metal].
 * Returns the (indexed) geometry with color + uv (uv.x = glow, uv.y = metal) attributes.
 */
export function colorize(THREE, { geom, labels }, fn) {
  const pos = geom.attributes.position, n = pos.count;
  const c = new Float32Array(n * 3), u = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    const r = fn(labels[v], pos.getX(v), pos.getY(v), pos.getZ(v));
    c[v * 3] = r[0]; c[v * 3 + 1] = r[1]; c[v * 3 + 2] = r[2]; u[v * 2] = r[3] || 0; u[v * 2 + 1] = r[4] || 0;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  return geom;
}
