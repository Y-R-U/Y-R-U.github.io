import * as THREE from 'three';
// Shape helpers on top of PartBuilder. All take the builder `b` first.
const PI = Math.PI;

// Closed lathe pod along -y from y0 to y1 (y1 < y0) with radius profile rs (top..bottom).
export function pod(b, y0, y1, rs, seg = 20) {
  const n = rs.length, e = Math.min(0.012, (y0 - y1) * 0.06);
  const rb = rs[n - 1], rt = rs[0], a = y1 + 2 * e, c = y0 - 2 * e;
  const pts = [[0, y1], [rb * 0.6, y1 + e * 0.15], [rb * 0.92, y1 + e]];
  for (let i = n - 1; i >= 0; i--) pts.push([rs[i], a + (c - a) * (1 - i / (n - 1))]);
  pts.push([rt * 0.92, y0 - e], [rt * 0.6, y0 - e * 0.15], [0, y0]);
  return b.lathe(pts, seg);
}

// Thick curved plate (band) around the y axis, centred on +z. rIn..rOut, height h, arc radians.
export function band(b, rIn, rOut, h, arc = PI * 2, seg = 24) {
  const c = Math.min(0.004, (rOut - rIn) / 3, h / 4);
  const pts = [
    [rIn, -h / 2], [rOut - c, -h / 2], [rOut, -h / 2 + c], [rOut, h / 2 - c], [rOut - c, h / 2], [rIn, h / 2], [rIn, -h / 2],
  ];
  return b.lathe(pts, Math.max(6, seg * arc / (PI * 2)), -arc / 2, arc);
}

// Horizontal torus arc centred on +z.
export function arcH(b, R, r, arc, ts = 20, rs = 6) {
  const g = b.tor(R, r, Math.max(4, ts * arc / (PI * 2)), rs, arc);
  g.rotateZ(PI / 2 - arc / 2);
  g.rotateX(PI / 2);
  return g;
}

// Ring lying flat (horizontal).
export function ringH(b, R, r, ts = 24) { const g = b.tor(R, r, ts, 6); g.rotateX(PI / 2); return g; }

// Disc facing +x (for ear / hip / knee discs).
export function discX(b, r, h, seg = 20) { const g = b.cyl(r, r, h, seg); g.rotateZ(PI / 2); return g; }
export function ringX(b, R, r, ts = 20) { const g = b.tor(R, r, ts, 6); g.rotateY(PI / 2); return g; }

// Straight rod between two points (local to one bone).
export function rod(b, a, c, r, seg = 8) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = b.cyl(r, r, len, seg, false);
  // align +y to direction
  const ax = Math.atan2(Math.hypot(dx, dz), dy), ay = Math.atan2(dx, dz);
  g.rotateX(ax); g.rotateY(ay);
  g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  return g;
}
export function capRod(b, a, c, r, seg = 8) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = b.cap(r, Math.max(0.001, len), seg);
  const ax = Math.atan2(Math.hypot(dx, dz), dy), ay = Math.atan2(dx, dz);
  g.rotateX(ax); g.rotateY(ay);
  g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  return g;
}



// Deform every vertex: fn(v: Vector3, y01) where y01 is 0..1 over the geometry's height. Re-faceted normals.
const _v = new THREE.Vector3();
export function deform(g, fn) {
  if (g.index) g = g.toNonIndexed();
  g.computeBoundingBox();
  const bb = g.boundingBox, H = Math.max(1e-6, bb.max.y - bb.min.y), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    _v.fromBufferAttribute(P, i);
    fn(_v, (_v.y - bb.min.y) / H, bb);
    P.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

// Armour plate: chamfered box whose top is scaled by tx/tz and shifted by sz (slope forward/back).
export function plate(b, w, h, d, { c = 0.02, tx = 1, tz = 1, sz = 0, bx = 1, bz = 1 } = {}) {
  return deform(b.cbox(w, h, d, c), (v, u) => {
    const kx = bx + (tx - bx) * u, kz = bz + (tz - bz) * u;
    v.x *= kx; v.z = v.z * kz + sz * u;
  });
}

// Tapered limb shell between y0 (top) and y1 (bottom), lathe with hex/oct facets.
export function shell(b, y0, y1, rs, seg = 8) {
  const n = rs.length, pts = [[0, y1]];
  for (let i = n - 1; i >= 0; i--) pts.push([rs[i], y1 + (y0 - y1) * (1 - i / (n - 1))]);
  pts.push([0, y0]);
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg, Math.PI / seg);
}

// Hex prism standing on y.
export function hex(b, r, h) { return new THREE.CylinderGeometry(r, r, h, 6, 1); }

// Spike / blade / fin: 2D outline (x,y) extruded to thickness t with a sharp chamfer.
export function fin(b, pts, t = 0.02, c = 0.006) { return b.ext(pts, t, c); }
