// Sunken Reef theme — the reef pinnacle under the course (a sea-grass and sand top, a mossy stone lip,
// porous reef-rock sides crusted with coral, a craggy tapering base), round reef outcrops for the
// backdrop, rock spires down to the seabed, and instanced branch corals, sponges and swaying kelp.
// The sweep frames (rounded caps, curvature limit, info.voids) are Sky Isles' / Candy Land's.
import * as THREE from 'three';
import { fbm3, noise3, rng, distToPath, paint, inVoid, distToLines } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Rock colours. The sand / sea-grass top and the mossy lip keep green >= red (the vcRock shader uses the
// grain map, no glow); reef rock is a neutral grey-brown; coral crust has red >> green (polyp dots glow).
export const ROCK = {
  moss: 0x7c9a5c, moss2: 0x92a470, ash: 0xa8ac88, lip: 0x6a7a5a, hotLip: 0x5a6a4a,
  basalt: 0x8a8274, basalt2: 0x787064, vein: 0xd86a7a, vein2: 0xe08a4a, vein3: 0x9a6aaa, base: 0x6a665c, base2: 0x5a564e, hot: 0x6e685e,
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
      // coral crust in patches: pink, orange or violet
      if (v > 0.62) { const k = noise3(wx * 0.3 + 5, wy * 0.3, wz * 0.3); return _c.copy(k < 0.4 ? C.vein : k < 0.65 ? C.vein2 : C.vein3); }
      return _c.copy(C.basalt).lerp(C.basalt2, noise3(wx * 1.3, wy * 1.3, wz * 1.3));
    }
    case 4: { const k = noise3(wx * 0.5, wy, wz * 0.5 + 3); return _c.copy(k < 0.45 ? C.vein : k < 0.7 ? C.vein2 : C.vein3).lerp(C.basalt, 0.25); }
    case 8: return _c.copy(C.hot);
    default: {
      const h = noise3(wx * 0.5, wy * 0.5, wz * 0.5 + 11);
      if (h > 0.72) return _c.copy(C.vein3).lerp(C.base, 0.4);
      return _c.copy(C.base).lerp(C.base2, noise3(wx * 0.9, wy * 0.9, wz * 0.9));
    }
  }
}

/** Sweep a reef-rock slab under a path. frames: [{ p, t (unit XZ tangent), el, er, d }]. L = layer unit (m). */
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
      } else if (kind >= 3) {     // lumpy reef-rock sides
        const n = fbm3(x * 1.1 + seed, y * 1.3, z * 1.1, 3) - 0.5;
        x += ox * n * 0.3 * L; z += oz * n * 0.3 * L;
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
 * The reef rock under the course. `floor` (info.floor) false samples are gaps: one slab per solid run,
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

/** Round reef outcrop of radius R and depth D, sea-grass top at y = 0. */
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
        const st = fbm3(ang * 2 + off, y * 0.6, 0, 3) - 0.5;
        x += ca * st * 0.25 * L; z += sa * st * 0.25 * L;
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

/** Downward rock spikes under an outcrop (painted, keeps uv). */
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

/** Rock spires rising from the seabed (y = bedY) to just under the reef at the given points. */
export function spires(list, pts, bedY, seed) {
  const r = rng(seed);
  for (const q of pts) {
    const top = q.y, h = Math.max(1, top - bedY), w = q.w * (0.8 + r() * 0.4);
    const g = new THREE.CylinderGeometry(w * 0.35, w, h, 7, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const n = noise3(p.getX(i) * 0.9 + q.x, p.getY(i) * 0.4, p.getZ(i) * 0.9 + q.z) - 0.5;
      p.setX(i, p.getX(i) * (1 + n * 0.5)); p.setZ(i, p.getZ(i) * (1 + n * 0.5));
    }
    g.translate(q.x, bedY + h / 2, q.z);
    list.push(paint(g, r() < 0.5 ? ROCK.base : ROCK.base2, null, true));
  }
}


// ---------------- foliage ----------------
export const CORAL_COLS = [0xff7a8a, 0xffa050, 0xc080e0, 0xff5a7a, 0xf0d060, 0x60d0c0];

/** Branching coral: a trunk with forked, upturned branches (merged, no uv), about 1 unit tall. */
export function branchCoralGeometry(lo = false) {
  const parts = [];
  const seg = 4;
  const add = (len, r0, r1, tilt, yaw, y, x = 0, z = 0) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
    g.translate(0, len / 2, 0); g.rotateZ(tilt); g.rotateY(yaw); g.translate(x, y, z);
    const n = g.toNonIndexed(); g.dispose(); n.deleteAttribute('uv'); parts.push(n);
    // the tip end point
    const tip = new THREE.Vector3(0, len, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return { x: x + tip.x, y: y + tip.y, z: z + tip.z };
  };
  add(0.35, 0.07, 0.05, 0, 0, 0);
  for (let i = 0; i < (lo ? 3 : 4); i++) {
    const yaw = i * 2.1 + 0.4, t = 0.55 + (i % 2) * 0.2;
    const e = add(0.42, 0.05, 0.03, t, yaw, 0.3);
    add(0.32, 0.03, 0.018, t * 0.35, yaw + 0.6, e.y - 0.02, e.x, e.z);
    if (!lo) add(0.26, 0.03, 0.016, -0.3, yaw - 0.5, e.y - 0.04, e.x, e.z);
  }
  const g = mergeGeometries(parts, false);
  parts.forEach(x => x.dispose());
  return g;
}

/** Sea fan: a flat lattice disc fan on a short stalk (merged, no uv), about 1 unit tall, in the XY plane. */
export function seaFanGeometry(lo = false) {
  const parts = [];
  const st = new THREE.CylinderGeometry(0.02, 0.035, 0.2, 4); st.translate(0, 0.1, 0); parts.push(st.toNonIndexed()); st.dispose();
  const n = lo ? 7 : 11;
  for (let i = 0; i < n; i++) {
    const a = -1.1 + 2.2 * i / (n - 1);
    const len = 0.75 * (0.8 + 0.2 * Math.cos(a * 1.3));
    const g = new THREE.BoxGeometry(0.012, len, 0.008);
    g.translate(0, len / 2, 0); g.rotateZ(a * 0.85); g.translate(0, 0.18, 0);
    parts.push(g.toNonIndexed()); g.dispose();
  }
  for (const rr of [0.35, 0.55, 0.72]) {
    const g = new THREE.TorusGeometry(rr, 0.008, 3, lo ? 8 : 12, Math.PI * 0.95);
    g.rotateZ(Math.PI * 0.025); g.translate(0, 0.18, 0);
    parts.push(g.toNonIndexed()); g.dispose();
  }
  parts.forEach(x => x.deleteAttribute('uv'));
  const g = mergeGeometries(parts, false);
  parts.forEach(x => x.dispose());
  return g;
}

/** Kelp strand: a ribbon (uv.y 0 at the holdfast → 1 at the tip) of height 1 with a slight twist. */
export function kelpGeometry(lo = false) {
  const segs = lo ? 5 : 8;
  const g = new THREE.PlaneGeometry(0.16, 1, 1, segs);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i), a = y * 2.2;
    p.setX(i, x * Math.cos(a) + Math.sin(y * 5) * 0.04); p.setZ(i, x * Math.sin(a));
  }
  // a second blade crossed at 90 degrees so it reads from every side
  const g2 = g.clone(); g2.rotateY(Math.PI / 2);
  const m = mergeGeometries([g, g2], false);
  g.dispose(); g2.dispose();
  m.computeVertexNormals();
  return m;
}

/**
 * Branch corals, sea fans, sponges on the reef top outside the fairway, and kelp along the reef's outer
 * edge plus tall kelp rising from the seabed around it (+ extraKelp: [{ x, y, z, h, rot }], the backdrop's
 * kelp forest, so all kelp is one instanced mesh). mats = { coral, kelp }.
 */
export function buildFoliage(frames, path, widths, hi, avoid = [], voids = null, branches = null, mats = {}, bedY = -10, extraKelp = []) {
  const r = rng(29);
  const maxW = Math.max(...widths, 1.2) / 2;
  const coralN = hi ? 12 : 6, fanN = hi ? 6 : 3, spongeN = hi ? 10 : 5, kelpN = hi ? 20 : 10;
  const corals = [], fans = [], sponges = [], kelps = [];
  const tryPlace = (minClear, list, n, inner = 0.55) => {
    let guard = n * 12;
    while (list.length < n && guard-- > 0) {
      const f = frames[2 + Math.floor(r() * (frames.length - 4))];
      if (!f) return;
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
      list.push({ x, y: f.p.y - 0.03, z, s: 0.6 + r() * 0.8, rot: r() * Math.PI * 2, out: Math.atan2(rx, rz) });
      avoid.push({ x, z, r: 0.12 });
    }
  };
  tryPlace(0.3, kelps, kelpN, 0.8);
  tryPlace(0.26, corals, coralN);
  tryPlace(0.32, fans, fanN, 0.7);
  tryPlace(0.2, sponges, spongeN);
  const objects = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  if (corals.length && mats.coral) {
    const g = branchCoralGeometry(!hi);
    const im = new THREE.InstancedMesh(g, mats.coral, corals.length);
    corals.forEach((b, k) => {
      m4.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.rot, 0)), sc.setScalar(0.14 + b.s * 0.12));
      im.setMatrixAt(k, m4); im.setColorAt(k, c.set(CORAL_COLS[k % CORAL_COLS.length]));
    });
    im.castShadow = true; im.receiveShadow = true; im.name = 'reef.branchCoral';
    objects.push(im);
  }
  if (fans.length && mats.coral) {
    const g = seaFanGeometry(!hi);
    const im = new THREE.InstancedMesh(g, mats.coral, fans.length);
    const FC = [0xc060d0, 0xff6a60, 0xffb050, 0xe05090];
    fans.forEach((b, k) => {
      // fans face the current: broadside roughly across the outward direction
      m4.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.out + (r() - 0.5) * 0.6, 0)), sc.setScalar(0.2 + b.s * 0.16));
      im.setMatrixAt(k, m4); im.setColorAt(k, c.set(FC[k % FC.length]));
    });
    im.castShadow = true; im.receiveShadow = true; im.name = 'reef.seaFans';
    objects.push(im);
  }
  if (sponges.length && mats.coral) {
    const g = new THREE.IcosahedronGeometry(1, hi ? 1 : 0);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      const n = 1 + (noise3(x * 2.3, y * 2.3, z * 2.3) - 0.5) * 0.35;
      pp.setXYZ(i, x * n, (y * 0.62 + 0.45) * n, z * n);
    }
    g.computeVertexNormals();
    const im = new THREE.InstancedMesh(g, mats.coral, sponges.length * 2);
    const SC = [0xe8b060, 0xd07090, 0x9ab060, 0xe09050, 0xb0a0d0];
    let k = 0;
    for (const b of sponges) for (let j = 0; j < 2; j++) {
      const s = (0.05 + b.s * 0.04) * (j ? 0.6 : 1);
      m4.compose(p.set(b.x + (j ? Math.cos(b.rot) * 0.09 : 0), b.y, b.z + (j ? Math.sin(b.rot) * 0.09 : 0)), q.setFromEuler(e.set(0, b.rot + j, 0)), sc.setScalar(s));
      im.setMatrixAt(k, m4); im.setColorAt(k, c.set(SC[(k + j) % SC.length])); k++;
    }
    im.castShadow = true; im.receiveShadow = true; im.name = 'reef.sponges';
    objects.push(im);
  }
  // kelp on the reef's outer edge (short) and rising from the seabed beside the reef (tall)
  if (mats.kelp) {
    const tall = [];
    for (let i = 0; i < (hi ? 26 : 12); i++) {
      const f = frames[Math.floor(r() * frames.length)];
      if (!f) break;
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const out = ext + 0.6 + r() * 2.2;
      const x = f.p.x - f.t.z * side * out, z = f.p.z + f.t.x * side * out;
      if (inVoid(voids, x, z, 0.4) || distToLines(branches, x, z) < 0.8) continue;
      // tips stay a little below the fairway so they never hide the ball
      const top = f.p.y - 0.25 - r() * 0.9;
      tall.push({ x, y: bedY, z, h: Math.max(2, top - bedY), rot: r() * 6.28 });
    }
    const all = kelps.map(b => ({ x: b.x, y: b.y, z: b.z, h: 0.5 + b.s * 0.45, rot: b.rot })).concat(tall, extraKelp);
    if (all.length) {
      const g = kelpGeometry(!hi);
      const im = new THREE.InstancedMesh(g, mats.kelp, all.length);
      all.forEach((b, k) => {
        m4.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.rot, 0)), sc.set(1 + b.h * 0.08, b.h, 1 + b.h * 0.08));
        im.setMatrixAt(k, m4); im.setColorAt(k, c.setHSL(0.17 + (k % 5) * 0.01, 0.35, 0.72 + (k % 3) * 0.05));
      });
      im.castShadow = false; im.receiveShadow = false; im.name = 'reef.kelp';
      im.frustumCulled = false;
      objects.push(im);
    }
  }
  return objects;
}
