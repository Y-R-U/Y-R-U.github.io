// Jungle Temple theme — the stone temple terrace under the course: a mossy paved top, a carved stone lip
// with a gold inlay band, stepped courses of cut temple blocks (two moss-topped setbacks), then raw rock
// and earth with roots tapering below into the mist. Round terraces for the backdrop, hanging roots.
// The sweep frames (rounded caps, curvature limit, info.voids) are Sky Isles' / Star Station's; the void
// clamp leaves room for the terrace steps (they reach 1.2 × the top extent).
import * as THREE from 'three';
import { fbm3, noise3, rng, paint, inVoid } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Colours. Carved stone keeps blue >= red (the vcRock shader reads it as cut stone: paving on top, blocks
// on the sides); earth, roots, moss and gold have red > blue (grain channel).
export const ROCK = {
  pave: 0x8a9a68, pave2: 0x76885a, lip: 0xa6aaa6, gold: 0xc89a3a, stone: 0x92989a, stone2: 0x7a8486,
  moss: 0x5a7a34, moss2: 0x4a6a2c, earth: 0x6a5238, earth2: 0x54442e, root: 0x4a3a28, rock3: 0x3e3a30,
};
const C = Object.fromEntries(Object.entries(ROCK).map(([k, v]) => [k, new THREE.Color(v)]));
const _c = new THREE.Color();
const STEP = 1.2;   // widest setback, × the top extent

// Cross-section: [lateral s (×extent), y (layer units, ×L), y relative (×depth), kind]
// kind: 0 paved top, 1 carved lip, 2 gold inlay, 3 temple blocks, 6 moss ledge, 7 earth / rock, 8 tip
const SIDE = [
  [1.03, -0.04, 0, 1], [1.04, -0.08, 0, 1], [1.045, -0.1, 0, 2], [1.045, -0.13, 0, 2], [1.04, -0.15, 0, 1],
  [1.04, -0.2, 0, 3], [1.04, -0.5, 0, 3], [1.1, -0.52, 0, 6], [1.11, -0.56, 0, 3], [1.11, -0.9, 0, 3],
  [1.19, -0.92, 0, 6], [1.2, -0.96, 0, 3], [1.18, -1.12, 0, 3],
  [1.12, -1.15, -0.04, 7], [0.98, -1.15, -0.22, 7], [0.74, -1.15, -0.48, 7], [0.44, -1.15, -0.76, 7], [0.2, -1.15, -0.92, 8],
];
const PROFILE = [
  [-1.0, -0.03, 0, 0], [-0.5, -0.03, 0, 0], [0, -0.03, 0, 0], [0.5, -0.03, 0, 0], [1.0, -0.03, 0, 0],
  ...SIDE,
  [0.0, -1.15, -1.0, 8],
  ...SIDE.slice().reverse().map(([s, y, r, k]) => [-s, y, r, k]),
  [-1.0, -0.03, 0, 0],
];

function colourFor(kind, wx, wy, wz) {
  switch (kind) {
    case 0: return _c.copy(C.pave).lerp(C.pave2, noise3(wx * 0.9, wz * 0.9, 3));
    case 1: return _c.copy(C.lip);
    case 2: return _c.copy(C.gold);
    case 3: {
      const v = noise3(Math.floor(wx * 2.5) * 1.7, Math.floor(wy * 3) * 2.3, Math.floor(wz * 2.5) * 1.3 + 7);
      const moss = noise3(wx * 0.7, wy * 1.4, wz * 0.7 + 5);
      if (moss > 0.66) return _c.copy(C.moss).lerp(C.moss2, v);   // moss and vines creeping down the blocks
      return _c.copy(C.stone).lerp(C.stone2, v > 0.5 ? 0.7 : 0);
    }
    case 6: return _c.copy(C.moss).lerp(C.moss2, noise3(wx * 1.3, wy, wz * 1.3));
    case 8: return _c.copy(C.rock3);
    default: {
      const h = noise3(wx * 0.6, wy * 0.6, wz * 0.6 + 11);
      if (h > 0.7) return _c.copy(C.root);
      if (h < 0.28) return _c.copy(C.moss2).lerp(C.earth, 0.4);
      return _c.copy(C.earth).lerp(C.earth2, noise3(wx * 0.9, wy * 0.9, wz * 0.9));
    }
  }
}

/** Sweep a temple terrace slab under a path. frames: [{ p, t (unit XZ tangent), el, er, d }]. L = layer unit (m). */
function sweepRock(frames, seed, hi, L = 1) {
  const ring = PROFILE.length;
  const pos = [], uv = [], col = [], idx = [];
  let dist = 0;
  const right = new THREE.Vector3();
  frames.forEach((f, i) => {
    if (i > 0) dist += f.p.distanceTo(frames[i - 1].p);
    right.set(-f.t.z, 0, f.t.x);
    for (let k = 0; k < ring; k++) {
      const [s, ya, yr, kind] = PROFILE[k];
      const ext = s < 0 ? f.el : f.er;
      let x = f.p.x + right.x * s * ext, z = f.p.z + right.z * s * ext;
      let y = f.p.y + ya * L + yr * f.d;
      const ox = right.x * Math.sign(s || 1), oz = right.z * Math.sign(s || 1);
      if (kind >= 7) {           // craggy base
        const amp = 0.12 + (-yr) * 0.5;
        const n = fbm3(x * 0.55 + seed, y * 0.45, z * 0.55, hi ? 4 : 3) - 0.5;
        const n2 = noise3(x * 2.1, y * 2.1, z * 2.1 + seed) - 0.5;
        x += ox * (n * amp * 2 + n2 * 0.14); z += oz * (n * amp * 2 + n2 * 0.14);
        y += (n * 0.6 + n2 * 0.2) * amp * 1.4;
        if (yr <= -0.99) y -= f.d * 0.25 * noise3(x * 0.8, 0, z * 0.8 + seed);
      }   // the cut stone stays straight
      pos.push(x, y, z);
      // top: u lateral, v along (metres × 0.6); sides: u = metres along (column seams), v = height
      uv.push(kind === 0 ? s * ext * 0.6 : dist * 0.5, kind === 0 ? dist * 0.6 : y * 0.35);
      const c = colourFor(kind, x, y, z);
      col.push(c.r, c.g, c.b);
    }
  });
  for (let i = 0; i < frames.length - 1; i++) {
    for (let k = 0; k < ring - 1; k++) {
      const a = i * ring + k, b = a + 1, c = a + ring, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  for (const [i, flip] of [[0, true], [frames.length - 1, false]]) {
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < ring; k++) { cx += pos[(i * ring + k) * 3]; cy += pos[(i * ring + k) * 3 + 1]; cz += pos[(i * ring + k) * 3 + 2]; }
    pos.push(cx / ring, cy / ring, cz / ring); uv.push(0, 0); col.push(C.earth2.r, C.earth2.g, C.earth2.b);
    for (let k = 0; k < ring - 1; k++) {
      const a = i * ring + k, b = a + 1;
      if (flip) idx.push(base, b, a); else idx.push(base, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}

/** Sweep frames under the course path, with rounded end caps and curvature-limited inner extents. */
export function courseFrames(path, widths, hi, seed = 3, voids = null) {
  const step = hi ? 0.55 : 0.85;
  const pts = [], ws = [];
  let acc = step;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) acc += path[i].distanceTo(path[i - 1]);
    if (acc >= step || i === 0 || i === path.length - 1) { pts.push(path[i]); ws.push(widths[i] ?? widths[widths.length - 1] ?? 1.5); acc = 0; }
  }
  if (pts.length < 2) { pts.push(pts[0].clone().add(new THREE.Vector3(0, 0, -0.5))); ws.push(ws[0]); }
  const tangents = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
    return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  });
  const frames = [];
  const r = rng(seed);
  const off = r() * 100;
  pts.forEach((p, i) => {
    const w = ws[i] / 2;
    const el0 = w + 0.5 + noise3(i * 0.3, off, 0) * 0.7;
    const er0 = w + 0.5 + noise3(i * 0.3, off + 9, 0) * 0.7;
    const tp = tangents[Math.max(0, i - 1)], tn = tangents[Math.min(pts.length - 1, i + 1)];
    const ds = Math.max(0.01, pts[Math.max(0, i - 1)].distanceTo(pts[Math.min(pts.length - 1, i + 1)]));
    const k = (tp.x * tn.z - tp.z * tn.x) / ds;
    let el = el0, er = er0;
    if (Math.abs(k) > 1e-3) {
      const lim = Math.max(w + 0.15, 0.9 / Math.abs(k));
      if (k > 0) er = Math.min(er, lim); else el = Math.min(el, lim);
    }
    if (voids && voids.length) {
      const t = tangents[i];
      const clampSide = (ext, sx, sz) => {
        for (let e = w + 0.06; e <= ext * STEP; e += 0.05) if (inVoid(voids, p.x + sx * e, p.z + sz * e, 0.08)) return Math.max(w + 0.04, (e - 0.08) / STEP);
        return ext;
      };
      el = clampSide(el, t.z, -t.x);
      er = clampSide(er, -t.z, t.x);
    }
    const d = 1.4 + (el + er) * 0.7 + noise3(i * 0.22, off + 20, 0) * 1.8;
    frames.push({ p: p.clone(), t: tangents[i], el, er, d });
  });
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < frames.length - 1; i++) frames[i].d = (frames[i - 1].d + frames[i].d * 2 + frames[i + 1].d) / 4;
  const cap = (f, dir) => {
    const out = [];
    const N = hi ? 6 : 4;
    for (let j = N; j >= 1; j--) {
      const th = (j / N) * Math.PI / 2 * 0.97;
      const E = Math.max(f.el, f.er);
      const c = f.p.clone().addScaledVector(f.t, dir * E * Math.sin(th));
      const k = Math.cos(th);
      out.push({ p: c, t: f.t, el: f.el * k + 0.02, er: f.er * k + 0.02, d: f.d * (0.35 + 0.65 * k) });
    }
    return out;
  };
  const start = cap(frames[0], -1);
  const end = cap(frames[frames.length - 1], 1).reverse();
  return [...start, ...frames, ...end];
}

/**
 * The temple terrace under the course. `floor` (info.floor) false samples are gaps: one slab per solid run,
 * trimmed back from each gap so the gap reads as a drop. Returns { geometry (vcRock), frames }.
 */
export function buildCourseRock(path, widths, hi, floor = null, voids = null) {
  const runs = [];
  let cur = null;
  for (let i = 0; i < path.length; i++) {
    const solid = !floor || floor[i] !== false;
    if (solid) { if (!cur) cur = { a: i, b: i }; else cur.b = i; }
    else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  const geos = [], frames = [];
  runs.forEach((run, k) => {
    let { a, b } = run;
    const trim = (i, dir) => {
      const want = (widths[i] ?? 1.5) / 2 + 0.6;
      let d = 0, j = i;
      while (d < want * 0.9 && j - dir >= a && j - dir <= b && Math.abs(j - i) < (b - a) / 2) { d += path[j].distanceTo(path[j - dir]); j -= dir; }
      return j;
    };
    if (a > 0) a = trim(a, -1);
    if (b < path.length - 1) b = trim(b, 1);
    if (b - a < 1) return;
    const f = courseFrames(path.slice(a, b + 1), widths.slice(a, b + 1), hi, 3 + k, voids);
    geos.push(sweepRock(f, 13.7 + k * 3.1, hi, 1));
    frames.push(...f);
  });
  let geometry = geos[0] || null;
  if (geos.length > 1) { geometry = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); }
  return { geometry, frames };
}

/** Round terrace of radius R and depth D: paved top at y = 0, stepped blocks, earth and roots underneath. */
export function roundIsland(R, D, seed = 1, hi = true, n = 0) {
  const N = n || (hi ? 22 : 14);
  const r = rng(seed);
  const off = r() * 50;
  const L = Math.max(1, R * 0.22);
  const prof = [[0, -0.03, 0, 0], [0.55, -0.03, 0, 0], [0.95, -0.03, 0, 0], ...SIDE, [0, -1.15, -1, 8]];
  const pos = [], uv = [], col = [], idx = [];
  const rows = prof.length;
  for (let a = 0; a <= N; a++) {
    const ang = (a / N) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lobe = 0.88 + noise3(ca * 1.3 + off, sa * 1.3, 0) * 0.24;
    for (let k = 0; k < rows; k++) {
      const [s, ya, yr, kind] = prof[k];
      const rad = s * R * lobe;
      let x = ca * rad, z = sa * rad, y = ya * L + yr * D;
      if (kind >= 7) {
        const amp = 0.1 + (-yr) * 0.45;
        const n = fbm3(x * 0.3 + off, y * 0.3, z * 0.3, hi ? 4 : 3) - 0.5;
        const rr = n * amp * R * 0.6;
        x += ca * rr; z += sa * rr; y += n * amp * D * 0.25;
        if (k === rows - 1) { x = 0; z = 0; y -= D * 0.15 * noise3(off, 0, 0); }
      }
      if (a === N) { const b = k * 3; x = pos[b]; y = pos[b + 1]; z = pos[b + 2]; }
      pos.push(x, y, z);
      uv.push(kind === 0 ? x * 0.15 : a / N * R * 1.2, kind === 0 ? z * 0.15 : y * 0.25);
      const c = colourFor(kind, x, y / L, z);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let a = 0; a < N; a++) for (let k = 0; k < rows - 1; k++) {
    const i0 = a * rows + k, i1 = i0 + 1, j0 = i0 + rows, j1 = j0 + 1;
    idx.push(i0, j0, i1, j0, j1, i1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  g.dispose();
  return { geometry: out, L };
}

/** Hanging root tangles under a terrace (downward cones, painted, keeps uv). */
export function spikes(list, cx, cy, cz, R, D, count, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * R * 0.45;
    const h = D * (0.2 + r() * 0.3), w = 0.2 + r() * R * 0.1;
    const yTop = cy - D * (0.4 + (rad / R) * 0.2) * (0.6 + r() * 0.2);
    const g = new THREE.ConeGeometry(w, h, 5, 1);
    g.rotateX(Math.PI); g.translate(cx + Math.cos(a) * rad, yTop - h / 2, cz + Math.sin(a) * rad);
    list.push(paint(g, r() < 0.5 ? ROCK.root : ROCK.earth2, null, true));
  }
}


/** A mossy boulder of radius R (painted rock, keeps uv for the grain channel). */
export function boulderGeometry(R, seed = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(R, detail);
  const p = g.attributes.position;
  const o = seed * 7.3;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / R, y = p.getY(i) / R, z = p.getZ(i) / R;
    const k = 0.75 + fbm3(x * 1.3 + o, y * 1.3, z * 1.3, 3) * 0.5;
    p.setXYZ(i, x * R * k * 1.15, Math.max(y, -0.3) * R * k * 0.8, z * R * k);
  }
  return paint(g, noise3(o, 1, 2) < 0.5 ? ROCK.moss2 : ROCK.earth, null, true);
}
