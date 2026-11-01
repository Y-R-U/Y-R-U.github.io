// Centre-line → frames. A frame is one cross-section of the track:
// { p, f, l, u: [x,y,z] position / forward / left / up, w: width, wl, wr: wall on the left/right of
//   the segment to the next frame, floor: segment has a floor, surf: material, piece, s: distance }
// Pure math, node-safe.

export const SPACING = 0.2;

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  // a + b*k + c*m
  mad: (a, b, k, c = null, m = 0) => c ? [a[0] + b[0] * k + c[0] * m, a[1] + b[1] * k + c[1] * m, a[2] + b[2] * k + c[2] * m]
    : [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
};
const Y = [0, 1, 0];

// Centripetal Catmull-Rom point between p1 and p2 (Barry-Goldman), t in [0,1].
function cr(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-4, Math.sqrt(v3.len(v3.sub(b, a))));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => v3.lerp(a, b, (tt - ta) / (tb - ta));
  const a1 = L(p0, p1, t0, t1), a2 = L(p1, p2, t1, t2), a3 = L(p2, p3, t2, t3);
  const b1 = L(a1, a2, t0, t2), b2 = L(a2, a3, t1, t3);
  return L(b1, b2, t1, t2);
}

// Fill defaults: every point inherits w / y / walls / surf / bank from the previous one.
export function normalizePoints(pts) {
  let prev = { y: 0, w: 1.4, walls: 'LR', surf: 'grass', bank: 0 };
  return pts.map(q => {
    const o = { ...prev, gap: false, ...q };
    if (q.gap === undefined) o.gap = false;
    prev = { y: o.y, w: o.w, walls: o.walls, surf: o.surf, bank: o.bank };
    return o;
  });
}

const smooth = t => t * t * (3 - 2 * t);

// Path piece → frames, resampled every SPACING metres by arc length.
export function pathFrames(rawPts, piece) {
  const pts = normalizePoints(rawPts);
  const P = pts.map(q => [q.x, q.y, q.z]);
  const n = P.length;
  const ext = (a, b) => v3.sub(v3.mul(a, 2), b);
  const dense = [];   // {p, seg, t}
  const SUB = 48;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? P[i - 1] : ext(P[0], P[1]);
    const p3 = i + 2 < n ? P[i + 2] : ext(P[n - 1], P[n - 2]);
    for (let k = 0; k < SUB; k++) dense.push({ p: cr(p0, P[i], P[i + 1], p3, k / SUB), seg: i, t: k / SUB });
  }
  dense.push({ p: P[n - 1], seg: n - 2, t: 1 });
  // cumulative length
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + v3.len(v3.sub(dense[i].p, dense[i - 1].p)));
  const total = cum[cum.length - 1];
  const count = Math.max(1, Math.round(total / SPACING));
  const out = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const s = total * k / count;
    while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const a = dense[j], b = dense[j + 1];
    const tt = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const p = v3.lerp(a.p, b.p, tt);
    const seg = a.seg, segT = a.t + (b.seg === a.seg ? (b.t - a.t) : (1 - a.t)) * tt;
    const q0 = pts[seg], q1 = pts[Math.min(seg + 1, n - 1)];
    const st = smooth(Math.min(1, Math.max(0, segT)));
    out.push({
      p, w: q0.w + (q1.w - q0.w) * st, bank: (q0.bank + (q1.bank - q0.bank) * st) * Math.PI / 180,
      wl: q0.walls.includes('L'), wr: q0.walls.includes('R'), floor: !q0.gap, surf: q0.surf, piece,
    });
  }
  // tangents and frames
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)].p, b = out[Math.min(out.length - 1, i + 1)].p;
    const f = v3.norm(v3.sub(b, a));
    let l = v3.norm(v3.cross(Y, f));
    let u = v3.cross(f, l);
    const bk = out[i].bank;
    if (bk) {   // roll about f; positive bank (degrees) raises the left edge
      const c = Math.cos(bk), s = Math.sin(bk);
      const l2 = v3.add(v3.mul(l, c), v3.mul(u, s)), u2 = v3.sub(v3.mul(u, c), v3.mul(l, s));
      l = l2; u = u2;
    }
    Object.assign(out[i], { f, l, u });
  }
  return out;
}

// Vertical loop starting at frame E (entry heading E.f, which should be horizontal).
// Exit is shifted along E.l by `shift`. The ring is on the inside, up points at the centre.
export function loopFrames(E, { radius = 0.45, shift = 0.8, width = 0.5 }, piece) {
  const N = Math.max(24, Math.round(2 * Math.PI * radius / 0.07));
  const f0 = E.f, l0 = E.l;
  const out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, th = 2 * Math.PI * u;
    const sh = shift * (u - Math.sin(th) / (2 * Math.PI));
    const p = v3.add(v3.mad(E.p, f0, radius * Math.sin(th), Y, radius * (1 - Math.cos(th))), v3.mul(l0, sh));
    // tilt the floor toward the side shift so the normal force steers the ball across
    // (lateral accel / normal accel = shift * sin(th) / (2 pi r), independent of speed)
    const up = v3.norm(v3.add(v3.add(v3.mul(f0, -Math.sin(th)), v3.mul(Y, Math.cos(th))), v3.mul(l0, shift * Math.sin(th) / (2 * Math.PI * radius))));
    const tan = v3.add(v3.mad([0, 0, 0], f0, radius * Math.cos(th), Y, radius * Math.sin(th)), v3.mul(l0, shift * (1 - Math.cos(th)) / (2 * Math.PI)));
    const f = v3.norm(tan);
    const l = v3.norm(v3.cross(up, f));
    const uu = v3.cross(f, l);
    out.push({ p, f, l, u: uu, w: width, bank: 0, wl: true, wr: true, floor: true, surf: 'grass', piece, loop: true });
  }
  return out;
}

// Interpolate a frame between a and b.
export function lerpFrame(a, b, t) {
  const f = v3.norm(v3.lerp(a.f, b.f, t)), l = v3.norm(v3.lerp(a.l, b.l, t));
  return { ...a, p: v3.lerp(a.p, b.p, t), f, l, u: v3.norm(v3.cross(f, l)), w: a.w + (b.w - a.w) * t, s: a.s + (b.s - a.s) * t };
}

// Frame at distance s along the whole track (with lerp).
export function frameAt(frames, s) {
  if (s <= frames[0].s) return frames[0];
  for (let i = 0; i < frames.length - 1; i++) {
    if (frames[i + 1].s >= s) return lerpFrame(frames[i], frames[i + 1], (s - frames[i].s) / Math.max(1e-9, frames[i + 1].s - frames[i].s));
  }
  return frames[frames.length - 1];
}
