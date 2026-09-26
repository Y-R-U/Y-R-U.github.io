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

// Elegant articulated hand for the left side (fingers down -y, palm toward -x).
export function hand(b, slot, fslot, s = 1, far = false) {
  const bone = 'hand';
  b.sym(b.rbox(0.026 * s, 0.085 * s, 0.07 * s, 0.01 * s), bone, slot, [0, -0.045 * s, 0.004 * s]);
  if (far) { b.sym(b.rbox(0.022 * s, 0.07 * s, 0.062 * s, 0.01 * s), bone, fslot, [-0.004 * s, -0.11 * s, 0.004 * s], [0, 0, -0.35]); return; }
  for (let i = 0; i < 4; i++) {
    const z = (-0.024 + i * 0.016) * s, L = (i === 1 || i === 2 ? 0.04 : 0.033) * s, r = 0.0085 * s;
    b.sym(b.cap(r, L, 6), bone, fslot, [-0.004 * s, -0.09 * s - L / 2, z], [0, 0, -0.18]);
    b.sym(b.cap(r * 0.9, L * 0.8, 6), bone, fslot, [-0.02 * s, -0.09 * s - L - L * 0.35, z], [0, 0, -0.75]);
  }
  b.sym(b.cap(0.0095 * s, 0.035 * s, 6), bone, fslot, [-0.02 * s, -0.035 * s, 0.035 * s], [0.7, 0, -0.5]);
}

// Clamp gripper (rental / workers).
export function gripper(b, slot, fslot, s = 1) {
  b.sym(b.rbox(0.05 * s, 0.07 * s, 0.075 * s, 0.012 * s), 'hand', slot, [0, -0.04 * s, 0]);
  b.sym(b.rbox(0.018 * s, 0.07 * s, 0.05 * s, 0.006 * s), 'hand', fslot, [-0.018 * s, -0.1 * s, 0], [0, 0, -0.2]);
  b.sym(b.rbox(0.018 * s, 0.07 * s, 0.05 * s, 0.006 * s), 'hand', fslot, [0.02 * s, -0.1 * s, 0], [0, 0, 0.12]);
}
