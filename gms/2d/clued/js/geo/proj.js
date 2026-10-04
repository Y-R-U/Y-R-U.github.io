// Hand-rolled projections. Output units are radians-ish; y grows downward (screen convention).
const D = Math.PI / 180;
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;

export function equalEarth(lon0 = 0) {
  const fwd = (lon, lat) => {
    let l = lon - lon0; if (l > 180) l -= 360; else if (l < -180) l += 360;
    const t = Math.asin(M * Math.sin(lat * D)), t2 = t * t, t6 = t2 * t2 * t2;
    const x = l * D * Math.cos(t) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
    const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
    return [x, -y];
  };
  fwd.invert = (x, y) => {
    y = -y;
    let t = y;
    for (let i = 0; i < 12; i++) {
      const t2 = t * t, t6 = t2 * t2 * t2;
      const f = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y;
      const fp = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2);
      const d = f / fp; t -= d;
      if (Math.abs(d) < 1e-9) break;
    }
    const t2 = t * t, t6 = t2 * t2 * t2;
    const lon = M * x * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)) / Math.cos(t) / D + lon0;
    const lat = Math.asin(Math.max(-1, Math.min(1, Math.sin(t) / M))) / D;
    return Math.abs(lon - lon0) > 180.0001 || !isFinite(lon) ? null : [lon, lat];
  };
  fwd.visible = () => true;
  fwd.kind = 'equalEarth';
  return fwd;
}

// Lambert azimuthal equal-area centred on [lon0, lat0].
export function laea([lon0, lat0]) {
  const s0 = Math.sin(lat0 * D), c0 = Math.cos(lat0 * D);
  const cosc = (lon, lat) => s0 * Math.sin(lat * D) + c0 * Math.cos(lat * D) * Math.cos((lon - lon0) * D);
  const fwd = (lon, lat) => {
    const sp = Math.sin(lat * D), cp = Math.cos(lat * D), dl = (lon - lon0) * D;
    const k = Math.sqrt(2 / Math.max(1e-6, 1 + s0 * sp + c0 * cp * Math.cos(dl)));
    return [k * cp * Math.sin(dl), -k * (c0 * sp - s0 * cp * Math.cos(dl))];
  };
  fwd.invert = (x, y) => {
    y = -y;
    const r = Math.hypot(x, y);
    if (r < 1e-12) return [lon0, lat0];
    if (r > 2) return null;
    const c = 2 * Math.asin(r / 2), sc = Math.sin(c), cc = Math.cos(c);
    const lat = Math.asin(cc * s0 + y * sc * c0 / r) / D;
    let lon = lon0 + Math.atan2(x * sc, r * c0 * cc - y * s0 * sc) / D;
    if (lon > 180) lon -= 360; else if (lon < -180) lon += 360;
    return [lon, lat];
  };
  fwd.visible = (lon, lat) => cosc(lon, lat) > -0.55;  // ~123 deg from centre
  fwd.kind = 'laea';
  return fwd;
}

export function makeProjection(region) {
  return region.proj === 'equalEarth' ? equalEarth(region.lon0 || 0) : laea(region.center || frameCenter(region.frame));
}

export function frameCenter(f) {
  let lon = (f[0] + f[2]) / 2; if (lon > 180) lon -= 360;
  return [lon, (f[1] + f[3]) / 2];
}

// Projected bbox of a lon/lat box, sampled along a grid (projections curve the edges).
export function projectedBox(proj, [w, s, e, n], steps = 16) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
    const [x, y] = proj(w + (e - w) * i / steps, s + (n - s) * j / steps);
    if (!isFinite(x) || !isFinite(y)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function haversineKm(a, b) {
  const dLa = (b[1] - a[1]) * D, dLo = (b[0] - a[0]) * D;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * D) * Math.cos(b[1] * D) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Points along the great circle a->b (for distance lines).
export function greatCircle(a, b, n = 48) {
  const [l1, p1, l2, p2] = [a[0] * D, a[1] * D, b[0] * D, b[1] * D];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-9) return [a, b];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(y, x) / D, Math.atan2(z, Math.hypot(x, y)) / D]);
  }
  return out;
}
