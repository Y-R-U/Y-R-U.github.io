export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function hexToLinear(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => srgbToLinear(v / 255));
}

// Segment (origin o, unit dir d, length len) vs an AABB [x0,y0,z0,x1,y1,z1] grown by pad: entry distance, or -1 on a miss.
export function segBox(o, d, len, b, pad = 0) {
  let t0 = 0, t1 = len;
  for (let a = 0; a < 3; a++) {
    const lo = b[a] - pad, hi = b[a + 3] + pad;
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return -1; continue; }
    const ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a];
    if (ta < tb) { if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; } else { if (tb > t0) t0 = tb; if (ta < t1) t1 = ta; }
    if (t0 > t1) return -1;
  }
  return t0;
}
