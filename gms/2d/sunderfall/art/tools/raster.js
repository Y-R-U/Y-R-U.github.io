// Polygon coverage, strokes and value noise. Everything the prop/terrain generators
// need to draw, done by hand because there is no canvas library on this machine.

/** Mulberry32 — small, fast, and seeded so every asset regenerates identically. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Anti-aliased coverage of a polygon over a w*h grid. 4x4 subsamples per pixel. */
function polyCoverage(w, h, pts, sub = 4) {
  const cov = new Float32Array(w * h);
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
  }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
  const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(w - 1, Math.ceil(maxX));
  const inc = 1 / sub, frac = 1 / (sub * sub);
  const xs = [];
  for (let py = y0; py <= y1; py++) {
    for (let s = 0; s < sub; s++) {
      const sy = py + (s + 0.5) * inc;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy))
          xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      if (!xs.length) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const sa = xs[k], sb = xs[k + 1];
        const pa = Math.max(x0, Math.floor(sa)), pb = Math.min(x1, Math.ceil(sb));
        for (let px = pa; px <= pb; px++) {
          // how many of the `sub` horizontal subsamples in this pixel are inside
          let hit = 0;
          for (let t = 0; t < sub; t++) {
            const sx = px + (t + 0.5) * inc;
            if (sx >= sa && sx < sb) hit++;
          }
          if (hit) cov[py * w + px] += hit * frac;
        }
      }
    }
  }
  for (let i = 0; i < cov.length; i++) if (cov[i] > 1) cov[i] = 1;
  return cov;
}

/** Coverage of a thick polyline (round joins, cheap: stamp discs along the path). */
function strokeCoverage(w, h, pts, width, taper = null) {
  const cov = new Float32Array(w * h);
  const stamp = (cx, cy, r) => {
    const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = Math.max(0, Math.min(1, r + 0.5 - d));
      const i = y * w + x;
      if (a > cov[i]) cov[i] = a;
    }
  };
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = taper ? taper((k + t) / (pts.length - 1)) : 1;
      stamp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.max(0.35, width * u / 2));
    }
  }
  return cov;
}

/** Paint a coverage mask onto an Img with a solid colour (alpha-over). */
function paintCoverage(img, cov, color, strength = 1, mask = null) {
  const [r, g, b, ca = 1] = color;
  for (let i = 0; i < img.w * img.h; i++) {
    let a = cov[i] * strength * ca;
    if (mask) a *= mask[i];
    if (a <= 0) continue;
    const j = i * 4;
    const da = img.data[j + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) continue;
    img.data[j]   = Math.round((r * a + img.data[j]   * da * (1 - a)) / oa);
    img.data[j+1] = Math.round((g * a + img.data[j+1] * da * (1 - a)) / oa);
    img.data[j+2] = Math.round((b * a + img.data[j+2] * da * (1 - a)) / oa);
    img.data[j+3] = Math.round(oa * 255);
  }
  return img;
}

/** Tileable value-noise field, bilinear, with fbm octaves. Period is `cells` in both axes. */
function makeNoise(seed, cells) {
  const r = rng(seed);
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  return (u, v) => {                       // u,v in 0..1, wraps
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

function fbm(seed, baseCells, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeNoise(seed + o * 7717, baseCells * (1 << o)));
  return (u, v) => {
    let sum = 0, amp = 1, norm = 0;
    for (let o = 0; o < layers.length; o++) { sum += layers[o](u, v) * amp; norm += amp; amp *= 0.5; }
    return sum / norm;
  };
}

/** Irregular convex-ish cell polygons over a rect, produced by a jittered Voronoi. */
function voronoiCells(x0, y0, w, h, count, seed, jitter = 1) {
  const r = rng(seed);
  const cols = Math.max(1, Math.round(Math.sqrt(count * w / h)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const sites = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    sites.push([x0 + (i + 0.5 + (r() - 0.5) * jitter) * w / cols,
                y0 + (j + 0.5 + (r() - 0.5) * jitter) * h / rows]);
  }
  // Clip a big square by the perpendicular bisector against every other site.
  const cells = [];
  for (const s of sites) {
    let poly = [[x0 - w, y0 - h], [x0 + 2*w, y0 - h], [x0 + 2*w, y0 + 2*h], [x0 - w, y0 + 2*h]];
    for (const t of sites) {
      if (t === s) continue;
      const mx = (s[0] + t[0]) / 2, my = (s[1] + t[1]) / 2;
      const nx = t[0] - s[0], ny = t[1] - s[1];
      poly = clipHalfPlane(poly, mx, my, nx, ny);
      if (poly.length < 3) break;
    }
    poly = clipRect(poly, x0, y0, x0 + w, y0 + h);
    if (poly.length >= 3) cells.push(poly);
  }
  return cells;
}

// keep the side where dot(p - m, n) <= 0
function clipHalfPlane(poly, mx, my, nx, ny) {
  const out = [];
  const side = p => (p[0] - mx) * nx + (p[1] - my) * ny;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], sa = side(a), sb = side(b);
    if (sb <= 0) {
      if (sa > 0) out.push(lerpEdge(a, b, sa, sb));
      out.push(b);
    } else if (sa <= 0) out.push(lerpEdge(a, b, sa, sb));
  }
  return out;
}
const lerpEdge = (a, b, sa, sb) => {
  const t = sa / (sa - sb);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

function clipRect(poly, x0, y0, x1, y1) {
  const planes = [[x0, 0, -1, 0], [x1, 0, 1, 0], [0, y0, 0, -1], [0, y1, 0, 1]];
  for (const [mx, my, nx, ny] of planes) {
    poly = clipHalfPlane(poly, mx, my, nx, ny);
    if (poly.length < 3) return [];
  }
  return poly;
}

/** Push each polygon vertex outward/inward and add mid-edge wobble — kills the CAD look. */
function roughen(poly, amount, seed, subdiv = 1) {
  const r = rng(seed);
  let p = poly;
  for (let s = 0; s < subdiv; s++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push(a);
      q.push([(a[0] + b[0]) / 2 + (r() - 0.5) * amount, (a[1] + b[1]) / 2 + (r() - 0.5) * amount]);
    }
    p = q;
  }
  return p.map(v => [v[0] + (r() - 0.5) * amount * 0.6, v[1] + (r() - 0.5) * amount * 0.6]);
}

const centroid = poly => {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
};

module.exports = { rng, polyCoverage, strokeCoverage, paintCoverage, makeNoise, fbm,
                   voronoiCells, roughen, centroid, clipRect, clipHalfPlane };
