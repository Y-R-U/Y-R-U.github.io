// Hand-drawn ink/pencil primitives. Everything visible in the game is drawn through here.

export function rnd(seed) {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const srnd = (seed) => rnd(seed) * 2 - 1;

// Two octaves of value noise along a stroke, so wobble drifts instead of buzzing.
function wob(seed, u) {
  const a = u * 0.7, b = u * 2.3;
  const ia = Math.floor(a), ib = Math.floor(b);
  const fa = a - ia, fb = b - ib;
  const sa = fa * fa * (3 - 2 * fa), sb = fb * fb * (3 - 2 * fb);
  const n1 = srnd(seed + ia * 71) * (1 - sa) + srnd(seed + (ia + 1) * 71) * sa;
  const n2 = srnd(seed + 9931 + ib * 71) * (1 - sb) + srnd(seed + 9931 + (ib + 1) * 71) * sb;
  return n1 * 0.72 + n2 * 0.28;
}

export const INK = '#20242c';
export const GRAPHITE = '#3a3f47';

/** Resample a polyline to even spacing and push each sample sideways by noise. */
function jitterPath(pts, seed, amp, step) {
  const out = [];
  let carry = 0, u = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = -dy / len, ny = dx / len;
    for (let d = carry; d < len; d += step) {
      const t = d / len;
      const o = wob(seed, u + d * 0.06) * amp;
      out.push([ax + dx * t + nx * o, ay + dy * t + ny * o]);
    }
    carry = (carry - len) % step + step;
    u += len * 0.06;
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

function traceSmooth(ctx, p) {
  if (p.length < 2) return;
  ctx.moveTo(p[0][0], p[0][1]);
  if (p.length === 2) { ctx.lineTo(p[1][0], p[1][1]); return; }
  for (let i = 1; i < p.length - 1; i++) {
    ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
  }
  ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
}

/**
 * Multi-pass stroke. Each pass re-jitters from a different seed, which is what sells
 * it as pencil rather than a wobbled vector line.
 */
export function stroke(ctx, pts, o = {}) {
  const w = o.w ?? 3, passes = o.passes ?? 2, amp = o.wob ?? 1.1;
  const seed = o.seed ?? 1, col = o.col ?? INK, alpha = o.a ?? 1;
  const step = o.step ?? 9;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = col;
  for (let k = 0; k < passes; k++) {
    const p = jitterPath(pts, seed + k * 7717, amp * (1 + k * 0.35), step);
    ctx.globalAlpha = alpha * (k === 0 ? 0.92 : 0.42);
    ctx.lineWidth = w * (k === 0 ? 1 : 0.78);
    ctx.beginPath();
    traceSmooth(ctx, p);
    ctx.stroke();
  }
  ctx.restore();
}

export function line(ctx, x1, y1, x2, y2, o) {
  stroke(ctx, [[x1, y1], [x2, y2]], o);
}

/** Hand-drawn circles overshoot the join — that overlap is most of the effect. */
export function circle(ctx, cx, cy, r, o = {}) {
  const start = -0.35 + (o.seed ?? 0) % 6.28, sweep = Math.PI * 2 + 0.42;
  const n = Math.max(10, Math.round(r * 0.9));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = start + sweep * (i / n);
    const rr = r * (1 + wob((o.seed ?? 1) + 313, i * 0.4) * 0.05);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  stroke(ctx, pts, { ...o, step: o.step ?? 7 });
}

export function arc(ctx, cx, cy, r, a0, a1, o = {}) {
  const n = Math.max(6, Math.round(Math.abs(a1 - a0) * r * 0.25));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  stroke(ctx, pts, o);
}

export function rect(ctx, x, y, w, h, o = {}) {
  stroke(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], o);
}

/** Irregular filled blob plus satellites — ink splatter, coffee, eraser dust. */
export function splat(ctx, cx, cy, r, seed, col = INK, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.beginPath();
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.62 + rnd(seed + i * 37) * 0.72);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.quadraticCurveTo(cx + Math.cos(a - 0.28) * rr * 1.24, cy + Math.sin(a - 0.28) * rr * 1.24, x, y);
  }
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = rnd(seed + 500 + i) * Math.PI * 2;
    const d = r * (1.2 + rnd(seed + 600 + i) * 1.9);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.09 + rnd(seed + 700 + i) * 0.2), 0, 6.283);
    ctx.fill();
  }
  ctx.restore();
}

/** Scribbled-out area — used for damage marks and erased regions. */
export function scribble(ctx, cx, cy, w, h, seed, o = {}) {
  const pts = [];
  const n = o.n ?? 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([cx - w / 2 + w * t, cy + (i % 2 ? -h / 2 : h / 2) * (0.6 + rnd(seed + i) * 0.5)]);
  }
  stroke(ctx, pts, { w: 2, passes: 1, wob: 1.6, seed, a: 0.5, ...o });
}

/** Parallel pencil hatching clipped to a rect. Used for health-bar fill and shading. */
export function hatch(ctx, x, y, w, h, o = {}) {
  const gap = o.gap ?? 7, ang = o.ang ?? -1.05, seed = o.seed ?? 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const span = Math.abs(w * dy) + Math.abs(h * dx);
  const steps = Math.ceil((span + w + h) / gap);
  for (let i = -steps; i < steps; i++) {
    const px = x + i * gap, py = y;
    stroke(ctx, [[px, py - h], [px + dx * (h * 3), py + dy * -(h * 3)]],
      { w: o.w ?? 2.2, passes: 1, wob: 0.7, seed: seed + i * 13, col: o.col ?? INK, a: o.a ?? 0.75, step: 12 });
  }
  ctx.restore();
}

/** Speed/impact lines radiating from a point. */
export function speedLines(ctx, cx, cy, r0, r1, count, seed, o = {}) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd(seed + i) * 0.4;
    const s = r0 * (0.8 + rnd(seed + i * 3) * 0.5), e = r1 * (0.7 + rnd(seed + i * 5) * 0.6);
    line(ctx, cx + Math.cos(a) * s, cy + Math.sin(a) * s, cx + Math.cos(a) * e, cy + Math.sin(a) * e,
      { w: o.w ?? 2.5, passes: 1, wob: 0.8, seed: seed + i * 17, col: o.col ?? INK, a: o.a ?? 0.8 });
  }
}
