// Volcano Forge theme — the floating basalt island under the course (a scorched-moss crust on top, a hot
// lip with a glowing seam, columnar basalt sides with a molten vein band, a craggy tapering base whose tip
// glows from the heat below), round islands for the backdrop, lava falls pouring off the edge, and
// instanced basalt columns, obsidian crystals and charred trees on the crust.
// The sweep frames (rounded caps, curvature limit, info.voids) are Sky Isles' / Candy Land's.
import * as THREE from 'three';
import { fbm3, noise3, rng, distToPath, paint, inVoid, distToLines } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lavaFallTexture, fadeTexture } from './textures.js';

// Rock colours. Moss / ash keep green > red (the vcRock shader uses the grain map and no glow); basalt is
// neutral grey (column seams, no glow); hot zones have red >> green (cracks glow molten).
export const ROCK = {
  moss: 0x6c7a4a, moss2: 0x5a6640, ash: 0x7a7c66, lip: 0x3a3634, hotLip: 0x6a2410,
  basalt: 0x4a4644, basalt2: 0x3a3836, vein: 0x8a2a10, base: 0x34302e, base2: 0x282422, hot: 0x9a3010,
};
const C = Object.fromEntries(Object.entries(ROCK).map(([k, v]) => [k, new THREE.Color(v)]));
const _c = new THREE.Color();

// Cross-section: [lateral s (×extent), y (layer units, ×L), y relative (×depth), kind]
// kind: 0 moss top, 1 lip, 2 hot lip seam, 3 basalt columns, 4 molten vein, 7 craggy base, 8 hot tip
const SIDE = [
  [1.05, -0.07, 0, 1], [1.06, -0.14, 0, 2], [1.05, -0.22, 0, 1], [1.03, -0.3, 0, 3], [1.03, -0.78, 0, 3],
  [1.02, -0.82, 0, 4], [1.02, -0.92, 0, 4], [1.0, -0.96, 0, 3], [0.98, -1.38, 0, 3],
  [0.93, -1.5, -0.06, 7], [0.8, -1.5, -0.3, 7], [0.58, -1.5, -0.56, 7], [0.32, -1.5, -0.8, 8],
];
const PROFILE = [
  [-1.0, -0.03, 0, 0], [-0.5, -0.03, 0, 0], [0, -0.03, 0, 0], [0.5, -0.03, 0, 0], [1.0, -0.03, 0, 0],
  ...SIDE,
  [0.0, -1.5, -1.0, 8],
  ...SIDE.slice().reverse().map(([s, y, r, k]) => [-s, y, r, k]),
  [-1.0, -0.03, 0, 0],
];

function colourFor(kind, wx, wy, wz) {
  switch (kind) {
    case 0: {
      const n = noise3(wx * 0.7, wz * 0.7, 3);
      return _c.copy(C.moss).lerp(C.moss2, n).lerp(C.ash, noise3(wx * 2.1, wz * 2.1, 5) * 0.35);
    }
    case 1: return _c.copy(C.lip).lerp(C.basalt2, noise3(wx, wy, wz));
    case 2: return _c.copy(C.hotLip);
    case 3: {
      const v = noise3(wx * 0.6, wy * 0.4, wz * 0.6 + 7);
      // occasional hot fissures running down the columns
      if (v > 0.74) return _c.copy(C.vein);
      return _c.copy(C.basalt).lerp(C.basalt2, noise3(wx * 1.3, wy * 1.3, wz * 1.3));
    }
    case 4: return _c.copy(C.vein);
    case 8: return _c.copy(C.hot);
    default: {
      const h = noise3(wx * 0.5, wy * 0.5, wz * 0.5 + 11);
      if (h > 0.7) return _c.copy(C.vein);
      return _c.copy(C.base).lerp(C.base2, noise3(wx * 0.9, wy * 0.9, wz * 0.9));
    }
  }
}

/** Sweep a basalt slab under a path. frames: [{ p, t (unit XZ tangent), el, er, d }]. L = layer unit (m). */
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
      } else if (kind >= 3) {     // columnar sides: blocky in-and-out steps
        const n = noise3(x * 1.4 + seed, 0, z * 1.4);
        const step = Math.round(n * 3) / 3 - 0.5;
        x += ox * step * 0.12 * L; z += oz * step * 0.12 * L;
      } else if (kind >= 1) {
        y += (noise3(x * 3, 0, z * 3 + seed) - 0.5) * 0.05;
      }
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
    pos.push(cx / ring, cy / ring, cz / ring); uv.push(0, 0); col.push(C.base.r, C.base.g, C.base.b);
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
        for (let e = w + 0.06; e <= ext; e += 0.05) if (inVoid(voids, p.x + sx * e, p.z + sz * e, 0.08)) return Math.max(w + 0.04, e - 0.08);
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
 * The basalt island under the course. `floor` (info.floor) false samples are gaps: one slab per solid run,
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

/** Round floating basalt island of radius R and depth D, moss top at y = 0. */
export function roundIsland(R, D, seed = 1, hi = true) {
  const N = hi ? 22 : 14;
  const r = rng(seed);
  const off = r() * 50;
  const L = Math.max(1, R * 0.22);
  const prof = [[0, -0.03, 0, 0], [0.55, -0.03, 0, 0], [0.95, -0.03, 0, 0], ...SIDE, [0, -1.5, -1, 8]];
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
      } else if (kind >= 3) {
        const st = Math.round(noise3(ang * 3 + off, 0, 0) * 3) / 3 - 0.5;
        x += ca * st * 0.1 * L; z += sa * st * 0.1 * L;
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

/** Downward basalt spikes under an island (painted, keeps uv); the lowest third is hot. */
export function spikes(list, cx, cy, cz, R, D, count, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * R * 0.45;
    const h = D * (0.2 + r() * 0.3), w = 0.2 + r() * R * 0.1;
    const yTop = cy - D * (0.4 + (rad / R) * 0.2) * (0.6 + r() * 0.2);
    const g = new THREE.ConeGeometry(w, h, 5, 1);
    g.rotateX(Math.PI); g.translate(cx + Math.cos(a) * rad, yTop - h / 2, cz + Math.sin(a) * rad);
    list.push(paint(g, r() < 0.5 ? ROCK.hot : ROCK.base2, null, true));
  }
}

// ---------------- lava falls ----------------
/**
 * spots: [{ p: Vector3 (lip), dir: Vector3 (outward unit XZ), width, length }]
 * Molten lava pouring over the edge and falling away (UV-scrolled, unlit), fading at the bottom.
 * Returns { mesh, update(t), dispose }
 */
export function buildLavaFalls(spots, hi) {
  const map = lavaFallTexture(64, 256);
  map.repeat.set(1, 2);
  const alpha = fadeTexture(64);
  const pos = [], uv = [], idx = [];
  const SEG = hi ? 12 : 7, COLS = hi ? 5 : 3;
  let base = 0;
  for (const s of spots) {
    const side = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const out = 0.08 + Math.sqrt(t) * 0.5 + t * 0.6;
      const y = -t * s.length;
      const w = s.width * (1 - t * 0.3);
      for (let c = 0; c <= COLS; c++) {
        const e = c / COLS - 0.5;
        const bulge = Math.cos(e * Math.PI) * 0.05;
        pos.push(s.p.x + s.dir.x * (out + bulge) + side.x * e * w, s.p.y + y + (k === 0 ? 0.02 : 0), s.p.z + s.dir.z * (out + bulge) + side.z * e * w);
        uv.push(c / COLS, (1 - t) * s.length * 0.25);
      }
      if (k < SEG) for (let c = 0; c < COLS; c++) {
        const a = base + k * (COLS + 1) + c, b2 = a + COLS + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    }
    base += (SEG + 1) * (COLS + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const uv2 = [];
  for (let i = 0; i < uv.length / 2; i++) { const k = Math.floor((i % ((SEG + 1) * (COLS + 1))) / (COLS + 1)); uv2.push(0, 1 - k / SEG); }
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv2, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  alpha.channel = 1;
  const fm = new THREE.MeshBasicMaterial({ map, alphaMap: alpha, color: 0xffffff, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false });
  fm.name = 'volcano.lavaFall';
  const mesh = new THREE.Mesh(g, fm);
  mesh.renderOrder = 1; mesh.name = 'volcano.lavaFalls';
  return {
    mesh,
    update(t) { map.offset.y = t * 0.45; },
    dispose() { map.dispose(); alpha.dispose(); g.dispose(); fm.dispose(); },
  };
}

// ---------------- foliage ----------------
/** Basalt column clusters, obsidian crystals and charred trees on the crust, outside the fairway. */
export function buildFoliage(frames, path, widths, hi, avoid = [], voids = null, branches = null, mats = {}) {
  const r = rng(29);
  const maxW = Math.max(...widths, 1.2) / 2;
  const colN = hi ? 16 : 7, crysN = hi ? 16 : 7, treeN = hi ? 8 : 4;
  const cols = [], crys = [], trees = [];
  const tryPlace = (minClear, list, n, inner = 0.55) => {
    let guard = n * 12;
    while (list.length < n && guard-- > 0) {
      const f = frames[2 + Math.floor(r() * (frames.length - 4))];
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.12) * (inner + r() * (1 - inner));
      const rx = -f.t.z * side, rz = f.t.x * side;
      const x = f.p.x + rx * lat + f.t.x * (r() - 0.5) * 0.4, z = f.p.z + rz * lat + f.t.z * (r() - 0.5) * 0.4;
      const { d, i } = distToPath(path, x, z);
      const w = (widths[i] ?? maxW * 2) / 2;
      if (d < w + minClear) continue;
      if (avoid.some(a => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
      if (inVoid(voids, x, z, 0.1) || distToLines(branches, x, z) < 0.45) continue;
      list.push({ x, y: f.p.y - 0.03, z, s: 0.6 + r() * 0.8, rot: r() * Math.PI * 2 });
      avoid.push({ x, z, r: 0.12 });
    }
  };
  tryPlace(0.36, trees, treeN, 0.65);
  tryPlace(0.24, cols, colN);
  tryPlace(0.2, crys, crysN);
  const objects = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  // basalt columns: hexagonal prisms (3 per cluster) of varied height
  if (cols.length && mats.stone) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
    g.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(g, mats.stone, cols.length * 3);
    let k = 0;
    const SH = [0x4c4c50, 0x3e3e42, 0x58585c];
    for (const b of cols) for (let j = 0; j < 3; j++) {
      const a = b.rot + j * 2.1, d = j ? 0.06 : 0;
      const rad = 0.035 + b.s * 0.015, h = (0.14 + b.s * 0.22) * (j ? 0.55 + r() * 0.35 : 1);
      m4.compose(p.set(b.x + Math.cos(a) * d * 1.4, b.y, b.z + Math.sin(a) * d * 1.4), q.setFromEuler(e.set(0, a, 0)), sc.set(rad, h, rad));
      im.setMatrixAt(k, m4); im.setColorAt(k, c.set(SH[(k + j) % 3])); k++;
    }
    im.castShadow = true; im.receiveShadow = true; im.name = 'volcano.columns';
    objects.push(im);
  }
  // obsidian crystals: stretched octahedra leaning out
  if (crys.length && mats.crystal) {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(0.4, 1, 0.4); g.translate(0, 0.6, 0);
    const im = new THREE.InstancedMesh(g, mats.crystal, crys.length * 3);
    let k = 0;
    const CC = [0x2c2c30, 0x1c1c20, 0x3a3a40];   // obsidian: black / smoky grey glass
    for (const b of crys) for (let j = 0; j < 3; j++) {
      const s = (0.05 + b.s * 0.04) * (j ? 0.6 : 1);
      m4.compose(p.set(b.x + (j ? Math.cos(b.rot + j * 2) * 0.05 : 0), b.y, b.z + (j ? Math.sin(b.rot + j * 2) * 0.05 : 0)),
        q.setFromEuler(e.set((j ? 0.5 : 0.15) * Math.cos(b.rot + j), b.rot + j, (j ? 0.5 : 0.15) * Math.sin(b.rot + j))), sc.setScalar(s));
      im.setMatrixAt(k, m4); im.setColorAt(k, c.set(CC[k % 3])); k++;
    }
    im.castShadow = true; im.receiveShadow = true; im.name = 'volcano.crystals';
    objects.push(im);
  }
  // charred dead trees: a trunk and three bare branches (merged, instanced)
  if (trees.length && mats.stone) {
    const parts = [];
    const tr = new THREE.CylinderGeometry(0.03, 0.06, 0.7, 5, 1); tr.translate(0, 0.35, 0); parts.push(tr.toNonIndexed()); tr.dispose();
    for (const [a, y, l, tilt] of [[0, 0.45, 0.35, 0.8], [2.2, 0.55, 0.3, 0.9], [4.1, 0.38, 0.26, 1.0], [1.1, 0.66, 0.2, 0.6]]) {
      const br = new THREE.CylinderGeometry(0.008, 0.022, l, 4, 1);
      br.translate(0, l / 2, 0); br.rotateZ(tilt); br.rotateY(a); br.translate(0, y, 0);
      parts.push(br.toNonIndexed()); br.dispose();
    }
    const g = mergeGeometries(parts.map(x => { x.deleteAttribute('uv'); return x; }), false);
    parts.forEach(x => x.dispose());
    const im = new THREE.InstancedMesh(g, mats.stone, trees.length);
    trees.forEach((t, i) => {
      m4.compose(p.set(t.x, t.y, t.z), q.setFromEuler(e.set((r() - 0.5) * 0.2, t.rot, (r() - 0.5) * 0.2)), sc.setScalar(0.5 + t.s * 0.4));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set(i % 2 ? 0x2a2420 : 0x221c18));
    });
    im.castShadow = true; im.receiveShadow = true; im.name = 'volcano.deadTrees';
    objects.push(im);
  }
  return objects;
}
