// Turn one keyed prop image into the full destruction chain the design calls for:
// intact -> cracked states -> debris chunks.
//
// Chunks are cut out of the prop's own pixels, so they always match the art. The cut
// edges get a fresh-break face (lighter material interior); the original silhouette
// edges do not — that difference is what makes debris read as "just broken off".
const { Img, crop, trim, blur, grade, mapPixels } = require('./img.js');
const { rng, polyCoverage, strokeCoverage, paintCoverage, voronoiCells, roughen, centroid, fbm } = require('./raster.js');

// interior: colour of a freshly exposed break face. rim: how hard the cut edge shades.
const MAT = {
  MASONRY: { interior: [188, 168, 146], rim: 0.55, chunks: 10, cracks: 'joint',  maxAspect: 2.6 },
  ROCK:    { interior: [156, 152, 148], rim: 0.5,  chunks: 10, cracks: 'radial', maxAspect: 2.6 },
  TIMBER:  { interior: [198, 162, 104], rim: 0.45,  chunks: 9,  cracks: 'grain',  maxAspect: 9 },
  FOLIAGE: { interior: [ 84, 104,  62], rim: 0.25, chunks: 10, cracks: 'wilt',   maxAspect: 2.6 },
  GLASS:   { interior: [232, 244, 255], rim: 0.85, chunks: 12, cracks: 'radial', maxAspect: 5 },
  METAL:   { interior: [176, 182, 190], rim: 0.4,  chunks: 7,  cracks: 'dent',   maxAspect: 3.2 },
  BONE:    { interior: [226, 216, 196], rim: 0.55, chunks: 8,  cracks: 'hair',   maxAspect: 4 },
};

// ---------- cell layouts ----------

function cellsFor(material, w, h, seed, count, grain) {
  const r = rng(seed);
  switch (material) {
    case 'MASONRY': {
      // break along mortar lines: staggered courses
      const rows = Math.max(2, Math.round(Math.sqrt(count * h / w)));
      const rh = h / rows;
      const out = [];
      for (let j = 0; j < rows; j++) {
        // vary the course width hard, otherwise every chunk comes out the same size
        const cols = 2 + Math.floor(r() * 4);
        const off = r();
        const y0 = j * rh + (r() - 0.5) * rh * 0.25, y1 = (j + 1) * rh + (r() - 0.5) * rh * 0.25;
        for (let i = -1; i < cols; i++) {
          let x0 = ((i + off) / cols) * w, x1 = ((i + 1 + off) / cols) * w;
          if (r() < 0.35) x1 = x0 + (x1 - x0) * (0.35 + r() * 0.35);   // an occasional small fragment
          if (x1 <= 0 || x0 >= w) continue;
          const p = [[Math.max(0, x0), y0], [Math.min(w, x1), y0],
                     [Math.min(w, x1), y1], [Math.max(0, x0), y1]];
          out.push(roughen(p, Math.min(w, h) * 0.035, (seed + j * 31 + i * 7) | 0, 1));
        }
      }
      return out;
    }
    case 'TIMBER': {
      // Splinters run with the grain: long strips along the prop's long axis, each cut
      // into a few segments. Built as explicit simple quads — a self-intersecting
      // polygon makes polyCoverage's even-odd fill hollow out the middle of the shard.
      const along = grain ? grain === 'h' : w >= h;
      const L = along ? w : h, S = along ? h : w;   // length and short axes
      const strips = Math.max(3, Math.round(Math.sqrt(count * S / L) * 2.2));
      const out = [];
      const edgeAt = [];
      for (let i = 0; i <= strips; i++) edgeAt.push(i / strips);
      for (let i = 0; i < strips; i++) {
        const segs = 2 + Math.floor(r() * 2);
        const cuts = [0];
        for (let c = 1; c < segs; c++) cuts.push((c + (r() - 0.5) * 0.5) / segs);
        cuts.push(1);
        for (let c = 0; c < segs; c++) {
          const l0 = cuts[c] * L, l1 = cuts[c + 1] * L;
          const wob = () => (r() - 0.5) * (S / strips) * 0.55;
          const s00 = edgeAt[i] * S + (i === 0 ? 0 : wob());
          const s01 = edgeAt[i] * S + (i === 0 ? 0 : wob());
          const s10 = edgeAt[i + 1] * S + (i === strips - 1 ? 0 : wob());
          const s11 = edgeAt[i + 1] * S + (i === strips - 1 ? 0 : wob());
          const q = [[l0, s00], [l1, s01], [l1, s11], [l0, s10]];
          out.push(q.map(p => along ? p : [p[1], p[0]]));
        }
      }
      return out;
    }
    case 'GLASS': {
      const cx = w * (0.35 + r() * 0.3), cy = h * (0.3 + r() * 0.3);
      const spokes = Math.max(6, count);
      const rings = [0.25, 0.6, 1.5];
      const out = [];
      const ang = [];
      for (let i = 0; i < spokes; i++) ang.push(i / spokes * Math.PI * 2 + r() * 0.35);
      ang.push(ang[0] + Math.PI * 2);
      const R = Math.hypot(w, h);
      for (let k = 0; k < rings.length; k++) {
        const r0 = k === 0 ? 0 : rings[k - 1] * R * 0.5, r1 = rings[k] * R * 0.5;
        for (let i = 0; i < spokes; i++) {
          const a0 = ang[i], a1 = ang[i + 1];
          const p = [];
          if (r0 > 0) { p.push([cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0]); }
          else p.push([cx, cy]);
          p.push([cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1]);
          p.push([cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1]);
          if (r0 > 0) p.push([cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0]);
          out.push(p);
        }
      }
      return out;
    }
    case 'FOLIAGE':
      return voronoiCells(0, 0, w, h, count, seed, 1.1).map((p, i) => roughen(p, Math.min(w, h) * 0.09, seed + i * 13, 2));
    case 'METAL':
      return voronoiCells(0, 0, w, h, count, seed, 0.6).map((p, i) => roughen(p, Math.min(w, h) * 0.03, seed + i * 13, 1));
    default: // ROCK, BONE — conchoidal irregular
      return voronoiCells(0, 0, w, h, count, seed, 1.0).map((p, i) => roughen(p, Math.min(w, h) * 0.055, seed + i * 13, 2));
  }
}

// ---------- helpers ----------

function alphaField(img) {
  const a = new Float32Array(img.w * img.h);
  for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3] / 255;
  return a;
}

/** Chamfer distance transform of `inside` (values > 0.5), in pixels, capped at `max`. */
function distanceInside(field, w, h, max = 12) {
  const d = new Float32Array(w * h);
  const BIG = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = field[i] > 0.5 ? BIG : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    let m = d[i];
    if (x > 0) m = Math.min(m, d[i-1] + 1);
    if (y > 0) m = Math.min(m, d[i-w] + 1);
    if (x > 0 && y > 0) m = Math.min(m, d[i-w-1] + 1.41);
    if (x < w-1 && y > 0) m = Math.min(m, d[i-w+1] + 1.41);
    d[i] = m;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    let m = d[i];
    if (x < w-1) m = Math.min(m, d[i+1] + 1);
    if (y < h-1) m = Math.min(m, d[i+w] + 1);
    if (x < w-1 && y < h-1) m = Math.min(m, d[i+w+1] + 1.41);
    if (x > 0 && y < h-1) m = Math.min(m, d[i+w-1] + 1.41);
    d[i] = Math.min(m, max);
  }
  return d;
}

/** Zero everything outside the largest 4-connected blob of `cov`. */
function keepLargestBlob(cov, w, h) {
  const seen = new Int32Array(cov.length);
  let best = null, bestArea = 0, label = 0;
  for (let start = 0; start < cov.length; start++) {
    if (seen[start] || cov[start] <= 0.02) continue;
    label++;
    const comp = [start]; seen[start] = label;
    let a = 0;
    for (let p = 0; p < comp.length; p++) {
      const i = comp[p], x = i % w, y = (i / w) | 0;
      a += cov[i];
      const nb = [x > 0 ? i-1 : -1, x < w-1 ? i+1 : -1, y > 0 ? i-w : -1, y < h-1 ? i+w : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && cov[j] > 0.02) { seen[j] = label; comp.push(j); }
    }
    if (a > bestArea) { bestArea = a; best = label; }
  }
  if (best === null) return;
  for (let i = 0; i < cov.length; i++) if (seen[i] !== best) cov[i] = 0;
}

// ---------- chunks ----------

function makeChunks(src, material, seed, opts = {}) {
  const m = MAT[material];
  const count = opts.count || m.chunks;
  const bb = require('./img.js').alphaBBox(src) || { x: 0, y: 0, w: src.w, h: src.h };
  const cells = cellsFor(material, bb.w, bb.h, seed, count, opts.grain);
  const srcAlpha = alphaField(src);
  const srcDist = distanceInside(srcAlpha, src.w, src.h, 6);   // distance from the original silhouette
  const out = [];
  const minArea = opts.minArea ?? Math.max(40, bb.w * bb.h * 0.006);

  for (let ci = 0; ci < cells.length; ci++) {
    const poly = cells[ci].map(p => [p[0] + bb.x, p[1] + bb.y]);
    const cov = polyCoverage(src.w, src.h, poly);
    for (let i = 0; i < cov.length; i++) cov[i] *= srcAlpha[i];
    keepLargestBlob(cov, src.w, src.h);          // a cell can straddle two separate pickets
    let area = 0, bx0 = src.w, by0 = src.h, bx1 = -1, by1 = -1;
    for (let i = 0; i < cov.length; i++) {
      if (cov[i] <= 0.02) continue;
      area += cov[i];
      const x = i % src.w, y = (i / src.w) | 0;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    if (area < minArea) continue;

    const chunk = new Img(src.w, src.h);
    const cellDist = distanceInside(cov, src.w, src.h, 6);
    // scale the break face to the fragment, or a thin shard turns into a solid slab of
    // exposed-interior colour and loses all of its material texture
    const feather = Math.max(1.2, Math.min(5, Math.min(bx1 - bx0, by1 - by0) * 0.26));
    for (let i = 0; i < cov.length; i++) {
      const a = cov[i];
      if (a <= 0.004) continue;
      const j = i * 4;
      let r = src.data[j], g = src.data[j+1], b = src.data[j+2];
      // fresh break face: near the cut but not near the original outline
      const cutness = Math.max(0, 1 - cellDist[i] / feather);
      const outerness = Math.max(0, 1 - srcDist[i] / 3);
      const k = Math.max(0, cutness - outerness) * m.rim;
      if (k > 0) {
        r += (m.interior[0] - r) * k;
        g += (m.interior[1] - g) * k;
        b += (m.interior[2] - b) * k;
        const shade = 1 - 0.28 * k;      // and it sits back in shadow a touch
        r *= shade; g *= shade; b *= shade;
      }
      chunk.data[j] = Math.round(r); chunk.data[j+1] = Math.round(g);
      chunk.data[j+2] = Math.round(b); chunk.data[j+3] = Math.round(a * 255);
    }
    const t = trim(chunk, 1);
    if (t.img.w < 4 || t.img.h < 4) continue;
    const asp = Math.max(t.img.w / t.img.h, t.img.h / t.img.w);
    if (asp > (m.maxAspect ?? 3)) continue;   // slivers read as glitches, not debris
    out.push({ img: t.img, area, c: centroid(poly) });
  }
  // spread the selection across the size range instead of keeping only the biggest,
  // so a break throws both slabs and shrapnel
  out.sort((a, b) => b.area - a.area);
  if (out.length <= count) return out.map(c => c.img);
  const pick = [];
  for (let i = 0; i < count; i++) pick.push(out[Math.round(i * (out.length - 1) / (count - 1))]);
  return pick.map(c => c.img);
}

// ---------- cracked states ----------

function crackPaths(material, w, h, seed, level) {
  const r = rng(seed + level * 977);
  const paths = [];
  const n = (material === 'GLASS' ? 6 : 2) + level * 2;
  if (MAT[material].cracks === 'joint') {
    // a fissure wandering through the mortar: mostly one direction, stepping around blocks
    for (let k = 0; k < n; k++) {
      const vertical = r() < 0.6;
      let x = r() * w, y = vertical ? -h * 0.05 : r() * h;
      if (!vertical) x = -w * 0.05;
      const pts = [[x, y]];
      const span = vertical ? h : w;
      let travelled = 0;
      while (travelled < span * (0.55 + r() * 0.6)) {
        const step = span * (0.05 + r() * 0.09);
        const side = (r() - 0.5) * step * 1.3;
        if (vertical) { y += step; x += side; } else { x += step; y += side; }
        pts.push([x, y]);
        travelled += step;
      }
      paths.push(pts);
    }
  } else if (MAT[material].cracks === 'grain') {
    const along = w >= h;
    for (let k = 0; k < n; k++) {
      const base = r();
      const pts = [];
      const steps = 8;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const wob = (r() - 0.5) * (along ? h : w) * 0.06;
        pts.push(along ? [t * w, base * h + wob] : [base * w + wob, t * h]);
      }
      paths.push(pts);
    }
  } else if (MAT[material].cracks === 'radial') {
    const cx = w * (0.3 + r() * 0.4), cy = h * (0.3 + r() * 0.4);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const pts = [[cx, cy]];
      let x = cx, y = cy, ang = a;
      const steps = 5 + Math.floor(r() * 4);
      for (let s = 0; s < steps; s++) {
        ang += (r() - 0.5) * 0.5;
        const len = Math.hypot(w, h) * (0.05 + r() * 0.09);
        x += Math.cos(ang) * len; y += Math.sin(ang) * len;
        pts.push([x, y]);
      }
      paths.push(pts);
    }
    if (level === 2) {   // concentric ties
      for (let ring = 1; ring <= 2; ring++) {
        const rad = Math.hypot(w, h) * 0.12 * ring;
        const pts = [];
        for (let s = 0; s <= 14; s++) {
          const a = s / 14 * Math.PI * 2;
          pts.push([cx + Math.cos(a) * rad * (0.8 + r() * 0.4), cy + Math.sin(a) * rad * (0.8 + r() * 0.4)]);
        }
        paths.push(pts);
      }
    }
  } else if (MAT[material].cracks === 'hair') {
    for (let k = 0; k < n * 2; k++) {
      const x = r() * w, y = r() * h;
      const a = r() * Math.PI;
      const len = Math.min(w, h) * (0.1 + r() * 0.2);
      paths.push([[x, y], [x + Math.cos(a) * len, y + Math.sin(a) * len]]);
    }
  }
  return paths;
}

function makeCracked(src, material, seed, level) {
  const m = MAT[material];
  let out = src.clone();
  const alpha = alphaField(src);
  const inner = distanceInside(alpha, src.w, src.h, 8);
  const mask = new Float32Array(alpha.length);
  for (let i = 0; i < mask.length; i++) mask[i] = Math.min(1, inner[i] / 2) * alpha[i];

  if (material === 'FOLIAGE') {
    // wilting, not cracking: thin the canopy and drain the colour
    const n = fbm(seed + level, 9, 4);
    const bite = level === 1 ? 0.42 : 0.55;
    out = mapPixels(out, (r, g, b, a, x, y) => {
      if (!a) return null;
      const v = n(x / src.w, y / src.h);
      const keep = v > bite ? 1 : Math.max(0, (v - bite + 0.12) / 0.12);
      const dry = level === 1 ? 0.25 : 0.45;
      return [r + (120 - r) * dry * 0.6, g + (98 - g) * dry, b + (58 - b) * dry * 0.5, a * keep];
    });
    return out;
  }

  if (material === 'METAL') {
    const r = rng(seed + level);
    const dents = level === 1 ? 3 : 6;
    for (let k = 0; k < dents; k++) {
      const cx = r() * src.w, cy = r() * src.h;
      const rx = Math.min(src.w, src.h) * (0.08 + r() * 0.12), ry = rx * (0.5 + r() * 0.6);
      const pts = [];
      for (let s = 0; s < 16; s++) {
        const a = s / 16 * Math.PI * 2;
        pts.push([cx + Math.cos(a) * rx * (0.8 + r() * 0.4), cy + Math.sin(a) * ry * (0.8 + r() * 0.4)]);
      }
      const cov = polyCoverage(src.w, src.h, pts);
      const soft = new Float32Array(cov.length);
      for (let i = 0; i < cov.length; i++) soft[i] = cov[i] * 0.35;
      paintCoverage(out, soft, [18, 22, 28], 1, mask);
      const hi = strokeCoverage(src.w, src.h, pts.slice(0, 9), 2);
      paintCoverage(out, hi, [210, 218, 228], 0.35, mask);
    }
    return out;
  }

  const paths = crackPaths(material, src.w, src.h, seed, level);
  const wide = Math.max(1.4, Math.min(src.w, src.h) * (level === 1 ? 0.006 : 0.011));
  for (const p of paths) {
    const dark = strokeCoverage(src.w, src.h, p, wide, t => 0.35 + 0.65 * Math.sin(Math.PI * t));
    paintCoverage(out, dark, [10, 9, 12], level === 1 ? 0.75 : 0.92, mask);
    const lit = strokeCoverage(src.w, src.h, p.map(v => [v[0] - wide * 0.7, v[1] - wide * 0.7]), wide * 0.55);
    paintCoverage(out, lit, m.interior, level === 1 ? 0.18 : 0.3, mask);
  }

  if (level === 2) {
    // second state loses a few chips off the silhouette and gets dust in the cracks
    const r = rng(seed + 4242);
    const chips = 4 + Math.floor(r() * 4);
    for (let k = 0; k < chips; k++) {
      const cx = r() * src.w, cy = r() * src.h;
      const rad = Math.min(src.w, src.h) * (0.03 + r() * 0.06);
      const pts = [];
      for (let s = 0; s < 9; s++) {
        const a = s / 9 * Math.PI * 2;
        pts.push([cx + Math.cos(a) * rad * (0.5 + r()), cy + Math.sin(a) * rad * (0.5 + r())]);
      }
      const cov = polyCoverage(src.w, src.h, pts);
      for (let i = 0; i < cov.length; i++) {
        if (cov[i] <= 0) continue;
        const j = i * 4;
        out.data[j+3] = Math.round(out.data[j+3] * (1 - cov[i]));
      }
    }
    out = grade(out, { brightness: -6 });
  }
  return out;
}

module.exports = { makeChunks, makeCracked, MAT, cellsFor, alphaField, distanceInside };
