// Candy Land theme — the floating cake under the course (pink frosting top, a frosting lip with drips, sponge
// / jam / cream / chocolate layers on straight sides, a tapering cookie-crumb base), round cake islands for
// the backdrop, chocolate pouring off the edge, and gumdrops + cotton-candy trees on the frosting.
// The sweep frames (rounded caps, curvature limit, info.voids) are Sky Isles' / Frost Fair's.
import * as THREE from 'three';
import { fbm3, noise3, rng, distToPath, paint, inVoid, distToLines, Buckets, mat } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chocoFallTexture, fadeTexture } from './textures.js';
import { cottonTree, GUM_COLS } from './props.js';

// Layer colours. Frosting / icing / cream keep a high blue component so the vcRock shader treats them as
// smooth icing (no crumb pores, sprinkles + sugar glints); cake layers have low blue.
export const CAKE = {
  top: 0xffaad0, top2: 0xff9cc8, lip: 0xff86ba, sponge: 0xf2c27a, sponge2: 0xe8b066, jam: 0xd8305a,
  cream: 0xfff0dc, choc: 0x7a4428, choc2: 0x5a2e1a, cookie: 0x8a5a36, cookie2: 0x6a3e22,
};
const C = Object.fromEntries(Object.entries(CAKE).map(([k, v]) => [k, new THREE.Color(v)]));
const _c = new THREE.Color();

// Cross-section: [lateral s (×extent), y (layer units, ×L), y relative (×depth), kind]
// kind: 0 frosting top, 1 frosting lip, 3 sponge, 4 jam, 5 cream, 6 chocolate cake, 7 cookie base
const SIDE = [
  [1.07, -0.1, 0, 1], [1.06, -0.2, 0, 1], [1.03, -0.24, 0, 3], [1.03, -0.56, 0, 3], [1.03, -0.58, 0, 4], [1.03, -0.7, 0, 4],
  [1.03, -0.72, 0, 3], [1.03, -1.0, 0, 3], [1.03, -1.02, 0, 5], [1.03, -1.12, 0, 5], [1.03, -1.14, 0, 6], [1.02, -1.46, 0, 6],
  [0.97, -1.5, -0.05, 7], [0.84, -1.5, -0.28, 7], [0.62, -1.5, -0.55, 7], [0.34, -1.5, -0.8, 7],
];
const PROFILE = [
  [-1.0, -0.03, 0, 0], [-0.5, -0.03, 0, 0], [0, -0.03, 0, 0], [0.5, -0.03, 0, 0], [1.0, -0.03, 0, 0],
  ...SIDE,
  [0.0, -1.5, -1.0, 7],
  ...SIDE.slice().reverse().map(([s, y, r, k]) => [-s, y, r, k]),
  [-1.0, -0.03, 0, 0],
];

function colourFor(kind, wx, wy, wz) {
  switch (kind) {
    case 0: return _c.copy(C.top).lerp(C.top2, noise3(wx * 0.8, wz * 0.8, 3));
    case 1: return _c.copy(C.lip);
    case 3: return _c.copy(C.sponge).lerp(C.sponge2, noise3(wx * 1.5, wy * 2, wz * 1.5));
    case 4: return _c.copy(C.jam);
    case 5: return _c.copy(C.cream);
    case 6: return _c.copy(C.choc).lerp(C.choc2, noise3(wx, wy * 2, wz) * 0.6);
    default: return _c.copy(C.cookie).lerp(C.cookie2, noise3(wx * 0.9, wy * 0.9, wz * 0.9));
  }
}

/** Sweep a cake slab under a path. frames: [{ p, t (unit XZ tangent), el, er, d }]. L = layer unit (m). */
function sweepCake(frames, seed, hi, L = 1) {
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
      if (kind === 7) {           // crumbly cookie base: craggy
        const amp = 0.1 + (-yr) * 0.45;
        const n = fbm3(x * 0.55 + seed, y * 0.45, z * 0.55, hi ? 4 : 3) - 0.5;
        const n2 = noise3(x * 2.1, y * 2.1, z * 2.1 + seed) - 0.5;
        x += ox * (n * amp * 2 + n2 * 0.12); z += oz * (n * amp * 2 + n2 * 0.12);
        y += (n * 0.6 + n2 * 0.2) * amp * 1.4;
        if (yr <= -0.99) y -= f.d * 0.2 * noise3(x * 0.8, 0, z * 0.8 + seed);
      } else if (kind >= 3) {     // cake sides: a soft bulge, not craggy
        const n = noise3(x * 0.7 + seed, 0, z * 0.7) - 0.5;
        x += ox * n * 0.06 * L; z += oz * n * 0.06 * L;
      } else if (kind === 1) {
        y += (noise3(x * 3, 0, z * 3 + seed) - 0.5) * 0.05;
      }
      pos.push(x, y, z);
      uv.push(kind === 0 ? s * ext * 0.6 : (i * 0.37 + k * 0.11), kind === 0 ? dist * 0.6 : y * 0.7);
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
    pos.push(cx / ring, cy / ring, cz / ring); uv.push(0, 0); col.push(C.cookie.r, C.cookie.g, C.cookie.b);
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
 * The cake under the course. `floor` (info.floor) false samples are gaps: one slab per solid run, trimmed back
 * from each gap so the gap reads as a drop. Returns { geometry (vcRock), frames }.
 */
export function buildCourseCake(path, widths, hi, floor = null, voids = null) {
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
    geos.push(sweepCake(f, 13.7 + k * 3.1, hi, 1));
    frames.push(...f);
  });
  let geometry = geos[0] || null;
  if (geos.length > 1) { geometry = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); }
  return { geometry, frames };
}

/** Round floating cake island of radius R and depth D, frosting top at y = 0. */
export function roundCake(R, D, seed = 1, hi = true) {
  const N = hi ? 24 : 14;
  const r = rng(seed);
  const off = r() * 50;
  const L = Math.max(1, R * 0.22);
  // a full lathe of the same profile (right half), centre to rim and down
  const prof = [[0, -0.03, 0, 0], [0.55, -0.03, 0, 0], [0.95, -0.03, 0, 0], ...SIDE, [0, -1.5, -1, 7]];
  const pos = [], uv = [], col = [], idx = [];
  const rows = prof.length;
  for (let a = 0; a <= N; a++) {
    const ang = (a / N) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lobe = 0.9 + noise3(ca * 1.3 + off, sa * 1.3, 0) * 0.2;
    for (let k = 0; k < rows; k++) {
      const [s, ya, yr, kind] = prof[k];
      const rad = s * R * lobe;
      let x = ca * rad, z = sa * rad, y = ya * L + yr * D;
      if (kind === 7) {
        const amp = 0.1 + (-yr) * 0.45;
        const n = fbm3(x * 0.3 + off, y * 0.3, z * 0.3, hi ? 4 : 3) - 0.5;
        const rr = n * amp * R * 0.6;
        x += ca * rr; z += sa * rr; y += n * amp * D * 0.25;
        if (k === rows - 1) { x = 0; z = 0; y -= D * 0.15 * noise3(off, 0, 0); }
      }
      if (a === N) { const b = k * 3; x = pos[b]; y = pos[b + 1]; z = pos[b + 2]; }
      pos.push(x, y, z);
      uv.push(kind === 0 ? x * 0.15 : a / N * R * 0.8, kind === 0 ? z * 0.15 : y * 0.35);
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

/** Frosting drips down a round cake's side (painted geometries in world space via M). */
export function roundDrips(list, M, R, L, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2;
    const len = L * (0.15 + r() * r() * 0.6), rad = L * 0.05 + R * 0.006;
    list.push(drip(Math.cos(a) * R * 1.0, -0.12 * L, Math.sin(a) * R * 1.0, len, rad, a, M));
  }
}

/** One rounded frosting drip hanging from (x, y, z), pressed against a side facing angle `face`. */
function drip(x, y, z, len, rad, face, M = null) {
  const cyl = new THREE.CylinderGeometry(rad, rad, len, 5, 1, true);
  cyl.translate(0, -len / 2, 0);
  const tip = new THREE.SphereGeometry(rad, 5, 2, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  tip.translate(0, -len, 0);
  const g = mergeGeometries([cyl.toNonIndexed(), tip.toNonIndexed()], false);
  cyl.dispose(); tip.dispose();
  g.scale(1, 1, 0.6);
  g.rotateY(-face + Math.PI / 2);
  g.translate(x, y, z);
  if (M) g.applyMatrix4(M);
  return paint(g, CAKE.lip);
}

/** Frosting drips down both sides of the course cake (skips voids). */
export function buildDrips(frames, hi, voids = null) {
  const out = [];
  const r = rng(91);
  const every = hi ? 1 : 2;
  for (let i = 0; i < frames.length; i += every) {
    const f = frames[i];
    for (const side of [-1, 1]) {
      const ext = (side < 0 ? f.el : f.er) * 1.045;
      const rx = -f.t.z * side, rz = f.t.x * side;
      for (let k = 0; k < 1; k++) {
        if (r() < (hi ? 0.2 : 0.35)) continue;
        const along = (r() - 0.5) * 0.45;
        const x = f.p.x + rx * ext + f.t.x * along, z = f.p.z + rz * ext + f.t.z * along;
        if (inVoid(voids, x, z, 0.05)) continue;
        const len = 0.08 + r() * r() * 0.42;
        out.push(drip(x, f.p.y - 0.14, z, len, 0.035 + r() * 0.015, Math.atan2(rz, rx)));
      }
    }
  }
  return out;
}

/** Downward chocolate-crumb spikes under an island (painted, keeps uv). */
export function spikes(list, cx, cy, cz, R, D, count, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * R * 0.45;
    const h = D * (0.2 + r() * 0.3), w = 0.2 + r() * R * 0.1;
    const yTop = cy - D * (0.4 + (rad / R) * 0.2) * (0.6 + r() * 0.2);
    const g = new THREE.ConeGeometry(w, h, 5, 1);
    g.rotateX(Math.PI); g.translate(cx + Math.cos(a) * rad, yTop - h / 2, cz + Math.sin(a) * rad);
    list.push(paint(g, CAKE.cookie2, null, true));
  }
}

// ---------------- chocolate falls ----------------
/**
 * spots: [{ p: Vector3 (lip), dir: Vector3 (outward unit XZ), width, length }]
 * Glossy chocolate pouring over the edge and falling away (UV-scrolled), with a fade at the bottom.
 * Returns { mesh, update(t), dispose }
 */
export function buildChocoFalls(spots, hi) {
  const map = chocoFallTexture(64, 256);
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
      const w = s.width * (1 - t * 0.25);
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
  // second uv set for the fade: v 1 at the lip → 0 at the bottom
  const uv2 = [];
  for (let i = 0; i < uv.length / 2; i++) { const k = Math.floor((i % ((SEG + 1) * (COLS + 1))) / (COLS + 1)); uv2.push(0, 1 - k / SEG); }
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv2, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  alpha.channel = 1;
  const fm = new THREE.MeshStandardMaterial({ map, alphaMap: alpha, color: 0xffffff, roughness: 0.2, metalness: 0.05,
    transparent: true, depthWrite: false, side: THREE.DoubleSide });
  fm.name = 'candy.chocoFall';
  const mesh = new THREE.Mesh(g, fm);
  mesh.renderOrder = 1; mesh.name = 'candy.chocoFalls';
  return {
    mesh,
    update(t) { map.offset.y = t * 0.55; },
    dispose() { map.dispose(); alpha.dispose(); g.dispose(); fm.dispose(); },
  };
}

// ---------------- foliage ----------------
/** Gumdrops + cotton-candy trees on the frosting, outside the fairway. Returns Object3D[]. */
export function buildFoliage(frames, path, widths, hi, avoid = [], voids = null, branches = null, mats = {}) {
  const r = rng(29);
  const maxW = Math.max(...widths, 1.2) / 2;
  const gumN = hi ? 22 : 9, treeN = hi ? 12 : 6;
  const gums = [], trees = [];
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
  tryPlace(0.32, trees, treeN, 0.65);
  tryPlace(0.2, gums, gumN);
  const objects = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  if (gums.length && mats.sugar) {
    const pts = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 7; i++) { const a = (i / 7) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * (1 - 0.12 * Math.sin(a * 2))), Math.sin(a) * 1.15)); }
    const g = new THREE.LatheGeometry(pts, 10);
    const im = new THREE.InstancedMesh(g, mats.sugar, gums.length);
    gums.forEach((b, i) => {
      const s = 0.035 + b.s * 0.03;
      m4.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.rot, 0)), sc.setScalar(s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set(GUM_COLS[i % GUM_COLS.length]));
    });
    im.castShadow = true; im.receiveShadow = true; im.name = 'candy.gumdrops';
    objects.push(im);
  }
  if (trees.length && mats.tree) {
    const b = new Buckets();
    cottonTree(b, mat(0, 0, 0), 1, 0xffffff, rng(5), !hi);
    const holder = new THREE.Group();
    const built = b.build({ candy: mats.tree, sugar: mats.tree }, holder);
    // candy stick keeps uv but no colour; give it a white colour so it merges with the floss
    const geos = Object.values(built).map(m => {
      const gg = m.geometry;
      if (!gg.attributes.color) { const n = gg.attributes.position.count; gg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.98), 3)); }
      if (gg.attributes.uv) gg.deleteAttribute('uv');
      return gg;
    });
    const g = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (geos.length > 1) geos.forEach(x => x.dispose());
    const im = new THREE.InstancedMesh(g, mats.tree, trees.length);
    const TREE_COLS = [0xffa6d2, 0xa6dcff, 0xffc4e6, 0xc6b4ff];
    trees.forEach((t, i) => {
      m4.compose(p.set(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.rot, 0)), sc.setScalar(0.4 + t.s * 0.3));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set(TREE_COLS[i % TREE_COLS.length]));
    });
    im.castShadow = true; im.receiveShadow = true; im.name = 'candy.cottonTrees';
    objects.push(im);
  }
  return objects;
}
