// Frost Fair theme — snowy floating rock masses (course island + round islands), icicles, frozen
// waterfalls, snow mounds and snowy pines. The sweep is Sky Isles' (with info.voids), recoloured.
import * as THREE from 'three';
import { fbm3, noise3, rng, distToPath, paint, inVoid, distToLines, Buckets, mat } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frozenFallTexture, fadeTexture } from './textures.js';
import { snowyPine } from './props.js';

const COL = {
  grass: new THREE.Color(0xe2eaf8), grass2: new THREE.Color(0xc4d2ee), moss: new THREE.Color(0xd8e2f6),
  rockHi: new THREE.Color(0xa0a8c0), rock: new THREE.Color(0x7a84a2), rockLo: new THREE.Color(0x3c4466),
};
const _c = new THREE.Color();

// Cross-section profile: [lateral s (×extent), y absolute (m), y relative (×depth), kind]
// kind: 0 snow top, 1 snow overhang, 2 rock (snow streaks near the top)
const PROFILE = [
  [-1.0, -0.03, 0, 0], [-0.5, -0.03, 0, 0], [0, -0.03, 0, 0], [0.5, -0.03, 0, 0], [1.0, -0.03, 0, 0],
  [1.07, -0.16, 0, 1], [1.02, -0.22, -0.1, 2], [0.93, -0.2, -0.28, 2], [0.78, 0, -0.48, 2], [0.56, 0, -0.68, 2], [0.3, 0, -0.86, 2],
  [0.0, 0, -1.0, 2],
  [-0.3, 0, -0.86, 2], [-0.56, 0, -0.68, 2], [-0.78, 0, -0.48, 2], [-0.93, -0.2, -0.28, 2], [-1.02, -0.22, -0.1, 2], [-1.07, -0.16, 0, 1],
  [-1.0, -0.03, 0, 0],
];

function colourFor(kind, rel, wx, wz) {
  if (kind === 0) return _c.copy(COL.grass).lerp(COL.grass2, Math.min(1, noise3(wx * 0.9, wz * 0.9, 3) * 0.8 + noise3(wx * 3.1, wz * 3.1, 5) * 0.4));
  if (kind === 1) return _c.copy(COL.moss);
  const t = Math.min(1, -rel);
  _c.copy(COL.rockHi).lerp(COL.rock, Math.min(1, t * 2.2));
  if (t > 0.45) _c.lerp(COL.rockLo, (t - 0.45) / 0.55);
  if (t < 0.22) _c.lerp(COL.moss, Math.min(1, (0.22 - t) * 4.5 * (0.35 + noise3(wx * 2, wz * 2, 9))));
  else if (noise3(wx * 1.3, wz * 1.3 + rel * 3, 11) > 0.72) _c.lerp(COL.grass2, 0.55);   // snow caught on ledges
  return _c;
}

/**
 * Sweep a craggy rock mass under a path. Returns a non-indexed geometry with position/normal/uv/color.
 * frames: [{ p: Vector3, t: Vector3 (unit XZ tangent), el, er, d }]
 */
function sweepRock(frames, seed, hi) {
  const ring = PROFILE.length;
  const pos = [], uv = [], col = [], idx = [];
  let dist = 0;
  const right = new THREE.Vector3();
  const prof = PROFILE.map(() => 0);
  let acc = 0;
  for (let k = 1; k < ring; k++) { acc += Math.hypot(PROFILE[k][0] - PROFILE[k - 1][0], (PROFILE[k][2] - PROFILE[k - 1][2]) * 2.5); prof[k] = acc; }
  frames.forEach((f, i) => {
    if (i > 0) dist += f.p.distanceTo(frames[i - 1].p);
    right.set(-f.t.z, 0, f.t.x);
    for (let k = 0; k < ring; k++) {
      const [s, ya, yr, kind] = PROFILE[k];
      const ext = s < 0 ? f.el : f.er;
      let x = f.p.x + right.x * s * ext, z = f.p.z + right.z * s * ext;
      let y = f.p.y + ya + yr * f.d;
      if (kind === 2) {
        const amp = 0.12 + (-yr) * 0.55;
        const n = fbm3(x * 0.55 + seed, y * 0.45, z * 0.55, hi ? 4 : 3) - 0.5;
        const n2 = noise3(x * 2.1, y * 2.1, z * 2.1 + seed) - 0.5;
        const ox = right.x * Math.sign(s || 1), oz = right.z * Math.sign(s || 1);
        x += ox * (n * amp * 2.2 + n2 * 0.12); z += oz * (n * amp * 2.2 + n2 * 0.12);
        y += (n * 0.6 + n2 * 0.2) * amp * 1.6;
        if (k === 11) y -= f.d * 0.25 * noise3(x * 0.8, 0, z * 0.8 + seed);
      } else if (kind === 1) {
        y += (noise3(x * 3, 0, z * 3 + seed) - 0.5) * 0.08;
      }
      pos.push(x, y, z);
      uv.push(prof[k] * 1.3, dist * 0.55);
      const c = colourFor(kind, yr, x, z);
      col.push(c.r, c.g, c.b);
    }
  });
  for (let i = 0; i < frames.length - 1; i++) {
    for (let k = 0; k < ring - 1; k++) {
      const a = i * ring + k, b = a + 1, c = a + ring, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // close the ends with a fan to the section centroid (caps are already tiny)
  for (const [i, flip] of [[0, true], [frames.length - 1, false]]) {
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < ring; k++) { cx += pos[(i * ring + k) * 3]; cy += pos[(i * ring + k) * 3 + 1]; cz += pos[(i * ring + k) * 3 + 2]; }
    pos.push(cx / ring, cy / ring, cz / ring); uv.push(0, 0); col.push(COL.rock.r, COL.rock.g, COL.rock.b);
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

/** Build sweep frames under the course path, with rounded end caps and curvature-limited inner extents. */
export function courseFrames(path, widths, hi, seed = 3, voids = null) {
  const step = hi ? 0.45 : 0.8;
  // resample by distance
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
    const el0 = w + 0.55 + noise3(i * 0.35, off, 0) * 0.9;
    const er0 = w + 0.55 + noise3(i * 0.35, off + 9, 0) * 0.9;
    // curvature: turn of the tangent per metre (signed; +ve = turning left)
    const tp = tangents[Math.max(0, i - 1)], tn = tangents[Math.min(pts.length - 1, i + 1)];
    const ds = Math.max(0.01, pts[Math.max(0, i - 1)].distanceTo(pts[Math.min(pts.length - 1, i + 1)]));
    const k = (tp.x * tn.z - tp.z * tn.x) / ds;
    let el = el0, er = er0;
    if (Math.abs(k) > 1e-3) {
      const lim = Math.max(w + 0.15, 0.9 / Math.abs(k));
      // cross(t_prev, t_next).y < 0 means turning toward +right
      if (k > 0) er = Math.min(er, lim); else el = Math.min(el, lim);
    }
    // engine info.voids: pull each side's edge back so the rock never fills a void (e.g. inside a U)
    if (voids && voids.length) {
      const t = tangents[i];
      const clampSide = (ext, sx, sz) => {
        for (let e = w + 0.06; e <= ext; e += 0.05) if (inVoid(voids, p.x + sx * e, p.z + sz * e, 0.08)) return Math.max(w + 0.04, e - 0.08);
        return ext;
      };
      el = clampSide(el, t.z, -t.x);
      er = clampSide(er, -t.z, t.x);
    }
    const d = 1.6 + (el + er) * 0.95 + noise3(i * 0.22, off + 20, 0) * 2.4;
    frames.push({ p: p.clone(), t: tangents[i], el, er, d });
  });
  // smooth depth
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < frames.length - 1; i++) frames[i].d = (frames[i - 1].d + frames[i].d * 2 + frames[i + 1].d) / 4;
  // end caps
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
 * The course's floating island. `floor` (engine extension, optional) marks samples with a gap as false;
 * the rock is split into one mass per solid run, trimmed back from each gap so the gap reads as a drop.
 * Returns { geometry (vcRock), frames }.
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
    // trim back from gap edges: the end cap bulges ~ (w/2 + margin) past the last sample
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
    geos.push(sweepRock(f, 13.7 + k * 3.1, hi));
    frames.push(...f);
  });
  let geometry = geos[0] || null;
  if (geos.length > 1) { geometry = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); }
  return { geometry, frames };
}

/** Round floating rock (lumpy disc on top, craggy cone below). Top surface at y = 0. */
export function roundRock(R, D, seed = 1, hi = true) {
  const N = hi ? 22 : 14;
  const r = rng(seed);
  const off = r() * 50;
  const frames = [];
  // reuse the sweep: a "path" that is a tiny straight segment with extents ±R and caps does not look round,
  // so build directly as a lathe with noise instead.
  const prof = [[0, 0, 0, 0], [0.55, 0, 0, 0], [0.92, 0, 0, 0], [1.04, -0.06, 0, 1], [1.0, -0.1, -0.08, 2], [0.9, 0, -0.25, 2],
    [0.72, 0, -0.45, 2], [0.5, 0, -0.66, 2], [0.28, 0, -0.85, 2], [0.0, 0, -1.0, 2]];
  const pos = [], uv = [], col = [], idx = [];
  const rows = prof.length;
  for (let a = 0; a <= N; a++) {
    const ang = (a / N) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lobe = 0.82 + noise3(ca * 1.3 + off, sa * 1.3, 0) * 0.36;
    for (let k = 0; k < rows; k++) {
      const [s, ya, yr, kind] = prof[k];
      let rad = s * R * lobe, y = ya * R * 0.25 + yr * D;
      let x = ca * rad, z = sa * rad;
      if (kind === 2) {
        const amp = 0.1 + (-yr) * 0.5;
        const n = fbm3(x * 0.35 + off, y * 0.3, z * 0.35, hi ? 4 : 3) - 0.5;
        const rr = n * amp * R * 0.7;
        x += ca * rr; z += sa * rr; y += n * amp * D * 0.25;
        if (k === rows - 1) { x = 0; z = 0; y -= D * 0.15 * noise3(off, 0, 0); }
      }
      if (a === N) { const b = k * 3; x = pos[b]; y = pos[b + 1]; z = pos[b + 2]; }
      pos.push(x, y, z);
      uv.push(a / N * R * 1.2, k * 0.6 + (-yr) * D * 0.25);
      const c = colourFor(kind, yr, x, z);
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
  void frames;
  return out;
}

/** Downward rock spikes under an island (painted, keeps uv for the rock map). */
export function spikes(list, cx, cy, cz, R, D, count, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * R * 0.5;
    const h = D * (0.25 + r() * 0.35), w = 0.2 + r() * R * 0.12;
    const yTop = cy - D * (0.35 + (rad / R) * 0.2) * (0.6 + r() * 0.2);
    const g = new THREE.ConeGeometry(w, h, 5, 1);
    g.rotateX(Math.PI); g.translate(cx + Math.cos(a) * rad, yTop - h / 2, cz + Math.sin(a) * rad);
    const pg = paint(g, 0x6a7494, null, true);
    list.push(pg);
  }
}

// ---------------- icicles ----------------
/**
 * Icicles hanging from the snow overhang of the course rock (both sides), as painted cone geometries
 * for the 'ice' bucket. Skips frames whose rim sits in a void.
 */
export function buildIcicles(frames, hi, voids = null) {
  const out = [];
  const r = rng(91);
  const every = hi ? 1 : 2;
  for (let i = 0; i < frames.length; i += every) {
    const f = frames[i];
    for (const side of [-1, 1]) {
      const ext = (side < 0 ? f.el : f.er) * 1.035;
      const rx = -f.t.z * side, rz = f.t.x * side;
      const n = hi ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const along = (r() - 0.5) * 0.4;
        const x = f.p.x + rx * ext + f.t.x * along, z = f.p.z + rz * ext + f.t.z * along;
        if (inVoid(voids, x, z, 0.05)) continue;
        const l = 0.08 + r() * r() * 0.5, rad = 0.018 + l * 0.08;
        const g = new THREE.ConeGeometry(rad, l, 5, 1, true);
        g.rotateX(Math.PI);
        g.translate(x, f.p.y - 0.17 - l / 2 + r() * 0.03, z);
        out.push(paint(g, r() < 0.5 ? 0xcfeaff : 0xa8d4ff));
      }
    }
  }
  return out;
}

// ---------------- frozen waterfalls ----------------
/**
 * spots: [{ p: Vector3 (lip), dir: Vector3 (outward unit XZ), width, length }]
 * A static sheet of ice (bulging columns) with a slow sheen that sweeps down it, plus an icicle fringe
 * along the bottom. Returns { mesh, sparkItems, update(t), dispose }
 */
export function buildFrozenFalls(spots, hi, uniforms) {
  const map = frozenFallTexture(64, 256);
  map.repeat.set(1, 3);
  const alpha = fadeTexture(64);
  const pos = [], uv = [], idx = [];
  const SEG = hi ? 12 : 7, COLS = hi ? 6 : 4;
  const sparks = [];
  let base = 0;
  for (const s of spots) {
    const side = new THREE.Vector3(-s.dir.z, 0, s.dir.x);
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const out = 0.1 + Math.sqrt(t) * 0.45 + t * 0.3;
      const y = -t * s.length;
      const w = s.width * (1 + t * 0.35);
      for (let c = 0; c <= COLS; c++) {
        const e = c / COLS - 0.5;
        const bulge = Math.sin((c / COLS) * Math.PI * COLS) * 0.06 * (0.4 + t);   // ridged columns
        pos.push(s.p.x + s.dir.x * (out + Math.abs(bulge)) + side.x * e * w, s.p.y + y + (k === 0 ? 0.03 : 0), s.p.z + s.dir.z * (out + Math.abs(bulge)) + side.z * e * w);
        uv.push(c / COLS, 1 - t);
      }
      if (k < SEG) for (let c = 0; c < COLS; c++) {
        const a = base + k * (COLS + 1) + c, b2 = a + COLS + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    }
    base += (SEG + 1) * (COLS + 1);
    for (let m = 0; m < (hi ? 6 : 3); m++) {
      const t = 0.1 + m * 0.13;
      sparks.push({ p: [s.p.x + s.dir.x * (0.5 + t * 0.4) + side.x * (m % 2 ? 0.2 : -0.2) * s.width, s.p.y - t * s.length, s.p.z + s.dir.z * (0.5 + t * 0.4) + side.z * (m % 2 ? 0.2 : -0.2) * s.width],
        w: 0.12 + (m % 3) * 0.05, a: 0.9, color: [0.75, 0.9, 1], phase: (m * 0.37 + Math.abs(s.p.x)) % 1, drift: 0.04 });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const fm = new THREE.MeshStandardMaterial({ map, alphaMap: alpha, color: 0xe8f4ff, roughness: 0.12, metalness: 0.1,
    emissive: 0x5a8ad0, emissiveIntensity: 0.45, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  fm.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', `
      float fzS = fract(uTime * 0.09);
      float fzBand = 1.0 - smoothstep(0.0, 0.12, abs(vMapUv.y / 3.0 - (1.0 - fzS * 1.4)));
      totalEmissiveRadiance += vec3(0.6, 0.85, 1.0) * fzBand * 0.6;`);
  };
  fm.customProgramCacheKey = () => 'frost-frozenfall';
  fm.name = 'frost.frozenFall';
  const mesh = new THREE.Mesh(g, fm);
  mesh.renderOrder = 1; mesh.name = 'frost.frozenFalls';
  return {
    mesh, sparkItems: sparks,
    update() {},
    dispose() { map.dispose(); alpha.dispose(); },
  };
}

// ---------------- foliage ----------------
/** Snow mounds + small snowy pines on the course island top, outside the fairway. Returns Object3D[]. */
export function buildFoliage(frames, path, widths, hi, avoid = [], voids = null, branches = null, pineMat = null) {
  const r = rng(29);
  const maxW = Math.max(...widths, 1.2) / 2;
  const moundN = hi ? 10 : 4, pineN = hi ? 28 : 12;
  const mounds = [], pines = [];
  const tryPlace = (minClear, list, n, inner = 0.55) => {
    let guard = n * 12;
    while (list.length < n && guard-- > 0) {
      const f = frames[2 + Math.floor(r() * (frames.length - 4))];
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.1) * (inner + r() * (1 - inner));
      const rx = -f.t.z * side, rz = f.t.x * side;
      const x = f.p.x + rx * lat + f.t.x * (r() - 0.5) * 0.4, z = f.p.z + rz * lat + f.t.z * (r() - 0.5) * 0.4;
      const { d, i } = distToPath(path, x, z);
      const w = (widths[i] ?? maxW * 2) / 2;
      if (d < w + minClear) continue;
      if (avoid.some(a => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
      if (inVoid(voids, x, z, 0.1) || distToLines(branches, x, z) < 0.45) continue;
      list.push({ x, y: f.p.y - 0.03, z, s: 0.6 + r() * 0.8, rot: r() * Math.PI * 2 });
    }
  };
  tryPlace(0.22, mounds, moundN);
  tryPlace(0.38, pines, pineN, 0.7);
  const objects = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  if (mounds.length) {
    // frosted holly / juniper shrubs (dark green, some dusted pale), flat-shaded so they read as clumps
    const g = new THREE.IcosahedronGeometry(0.1, 0);
    const mt = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
    mt.name = 'frost.shrub';
    const im = new THREE.InstancedMesh(g, mt, mounds.length);
    const c = new THREE.Color();
    mounds.forEach((b, i) => {
      sc.set(b.s * (0.7 + r() * 0.4), b.s * (0.5 + r() * 0.35), b.s * (0.7 + r() * 0.4));
      m4.compose(p.set(b.x, b.y + sc.y * 0.05, b.z), q.setFromEuler(e.set(r(), b.rot, r())), sc);
      im.setMatrixAt(i, m4);
      c.setHSL(0.33 + r() * 0.04, 0.35 + r() * 0.15, 0.1 + r() * 0.05);
      if (r() < 0.25) c.setHSL(0.6, 0.25, 0.75);   // a snow-buried one
      im.setColorAt(i, c);
    });
    im.receiveShadow = true; im.name = 'frost.shrubs';
    objects.push(im);
  }
  if (pines.length && pineMat) {
    const b = new Buckets();
    snowyPine(b, mat(0, 0, 0), 1, 7);
    const holder = new THREE.Group();
    const built = b.build({ vc: pineMat, snow: pineMat }, holder);
    const geos = Object.values(built).map(m => m.geometry);
    const g = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (geos.length > 1) geos.forEach(x => x.dispose());
    const im = new THREE.InstancedMesh(g, pineMat, pines.length);
    pines.forEach((t, i) => {
      m4.compose(p.set(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.rot, 0)), sc.setScalar(0.35 + t.s * 0.35));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true; im.receiveShadow = true; im.name = 'frost.pines';
    objects.push(im);
  }
  return objects;
}
