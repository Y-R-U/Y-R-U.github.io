// Stroke -> special-move gesture. Also owns the glyph paths the shop animates.

const TAP_DIST = 26;      // shorter than this is a tap, not a stroke
const TAP_TIME = 0.26;

function resample(pts, n = 32) {
  const out = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (total < 1e-3) return pts.slice(0, 1);
  const step = total / (n - 1);
  let d = 0, i = 1;
  out.push({ x: pts[0].x, y: pts[0].y });
  let cur = { x: pts[0].x, y: pts[0].y };
  while (i < pts.length) {
    const seg = Math.hypot(pts[i].x - cur.x, pts[i].y - cur.y);
    if (d + seg >= step) {
      const t = (step - d) / seg;
      cur = { x: cur.x + (pts[i].x - cur.x) * t, y: cur.y + (pts[i].y - cur.y) * t };
      out.push({ x: cur.x, y: cur.y });
      d = 0;
    } else { d += seg; cur = pts[i]; i++; }
  }
  while (out.length < n) out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
  return out;
}

function features(pts) {
  const p = resample(pts, 32);
  const a = p[0], b = p[p.length - 1];
  let len = 0;
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  const net = Math.hypot(b.x - a.x, b.y - a.y);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const q of p) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;

  let turn = 0, sharp = Math.PI, sharpIdx = -1;
  for (let i = 1; i < p.length - 1; i++) {
    const a1 = Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x);
    const a2 = Math.atan2(p[i + 1].y - p[i].y, p[i + 1].x - p[i].x);
    let d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    turn += d;
    // Corner sharpness over a wider window, so resampling noise does not read as a corner.
    if (i >= 3 && i < p.length - 3) {
      const b1 = Math.atan2(p[i].y - p[i - 3].y, p[i].x - p[i - 3].x);
      const b2 = Math.atan2(p[i + 3].y - p[i].y, p[i + 3].x - p[i].x);
      let e = b2 - b1;
      while (e > Math.PI) e -= Math.PI * 2;
      while (e < -Math.PI) e += Math.PI * 2;
      const interior = Math.PI - Math.abs(e);
      if (interior < sharp) { sharp = interior; sharpIdx = i; }
    }
  }

  // Bulge: which side of the start->end chord the path's midpoint sits on.
  const mid = p[(p.length / 2) | 0];
  const chordY = a.y + (b.y - a.y) * 0.5;
  const bulge = chordY - mid.y;      // positive = path bulges upward

  return { p, a, b, len, net, diag, turn, sharp, sharpIdx, bulge, minX, maxX, minY, maxY };
}

/**
 * @returns {string|null} gesture id, or null for a tap / unrecognised scrawl.
 */
export function classify(pts, dur = 1) {
  if (!pts || pts.length < 3) return null;
  const f = features(pts);
  if (f.len < TAP_DIST || (f.net < TAP_DIST && f.len < TAP_DIST * 2.2 && dur < TAP_TIME)) return null;

  const closed = f.net < f.diag * 0.48;
  const absTurn = Math.abs(f.turn);

  if (absTurn > 4.2 && closed) return f.turn > 0 ? 'circleCW' : 'circleCCW';

  const straightness = f.len / (f.net || 1);
  const ang = Math.atan2(f.b.y - f.a.y, f.b.x - f.a.x);
  const deg = ang * 180 / Math.PI;

  if (straightness < 1.34 && f.net > TAP_DIST) {
    const ad = Math.abs(deg);
    if (ad > 62 && ad < 118) return deg < 0 ? 'up' : 'down';
    if (ad < 26 || ad > 154) return 'right';
    // A slash runs low-to-high; mirrored so it reads the same for either facing.
    if (deg < -26 && deg > -62) return 'slash';
    if (deg < -118 && deg > -154) return 'slash';
    if (deg > 26 && deg < 62) return 'slash';
    if (deg > 118 && deg < 154) return 'slash';
    return null;
  }

  const horizontal = Math.abs(f.b.x - f.a.x) > Math.abs(f.b.y - f.a.y) * 1.1;
  if (f.sharp < 1.5 && horizontal && f.bulge < 0) return 'vee';
  if (absTurn > 1.7 && absTurn < 4.6 && horizontal && f.bulge > f.diag * 0.12) return 'archUp';
  if (absTurn > 1.7 && absTurn < 4.6 && horizontal && f.bulge < -f.diag * 0.12) return 'vee';
  if (absTurn > 4.2) return f.turn > 0 ? 'circleCW' : 'circleCCW';
  return null;
}

/**
 * Glyph paths in a unit box, as polylines walked by arc length so the shop can animate
 * them being drawn. Directional glyphs carry an arrowhead — without one, up/down/right
 * all render as the same little line and the move strip stops being a reminder.
 */
function circlePts(cw) {
  const out = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (cw ? 1 : -1) * (i / n) * Math.PI * 1.86;
    out.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]);
  }
  // Arrowhead on the open end, so clockwise and anticlockwise are told apart at a glance.
  const [ex, ey] = out[out.length - 1];
  const [px, py] = out[out.length - 3];
  const dx = ex - px, dy = ey - py;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const b = 0.20;
  out.push([ex - ux * b + nx * b * 0.7, ey - uy * b + ny * b * 0.7]);
  out.push([ex, ey]);
  out.push([ex - ux * b - nx * b * 0.7, ey - uy * b - ny * b * 0.7]);
  return out;
}

/** shaft + two barbs, traced as one stroke. */
function arrow(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const b = 0.22;
  return [
    [x0, y0], [x1, y1],
    [x1 - ux * b + nx * b * 0.72, y1 - uy * b + ny * b * 0.72],
    [x1, y1],
    [x1 - ux * b - nx * b * 0.72, y1 - uy * b - ny * b * 0.72],
  ];
}

export const GLYPH_PATH = {
  slash:     arrow(-0.45, 0.5, 0.45, -0.5),
  up:        arrow(0, 0.55, 0, -0.5),
  down:      arrow(0, -0.55, 0, 0.5),
  right:     arrow(-0.55, 0, 0.5, 0),
  vee:       [[-0.45, -0.45], [0, 0.45], [0.45, -0.45]],
  archUp:    (() => {
    const out = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      out.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55 + 0.18]);
    }
    return out;
  })(),
  circleCW:  circlePts(true),
  circleCCW: circlePts(false),
};

/** Walk the polyline by arc length and return the first `upTo` fraction of it. */
export function glyphPoints(id, steps = 40, upTo = 1) {
  const path = GLYPH_PATH[id];
  if (!path || path.length < 2) return [];
  const segs = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segs.push(d);
    total += d;
  }
  const want = total * Math.max(0, Math.min(1, upTo));
  const out = [path[0]];
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= want) {
      const t = segs[i] > 0 ? (want - acc) / segs[i] : 0;
      out.push([
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]);
      break;
    }
    acc += segs[i];
    out.push(path[i + 1]);
  }
  return out;
}
