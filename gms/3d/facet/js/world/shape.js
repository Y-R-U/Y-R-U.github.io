// The anti-blocky primitive kit. Everything in FACET is built from these.
//
// All output is non-indexed BufferGeometry carrying position + color, origin on the ground at the
// form's centre, +Y up. Non-indexed because every triangle needs its own colour, and because
// computeVertexNormals() on non-indexed data IS flat shading — no material flag required.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const _c = new THREE.Color();
const cache = new Map();

// Hex strings arrive in sRGB; the attribute wants the linear working space Color already converts to.
export function rgb(c) {
  if (Array.isArray(c)) return c;
  if (c.isColor) return [c.r, c.g, c.b];
  let v = cache.get(c);
  if (!v) { _c.set(c); v = [_c.r, _c.g, _c.b]; cache.set(c, v); }
  return v;
}

export function mix(a, b, t) {
  const x = rgb(a), y = rgb(b);
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}

// The light/shadow hue shift the style lives on, applied per face rather than per material.
// Toward the light: lift, warm, desaturate slightly at the very top.
// Into shadow: darken, rotate cool, and *gain* saturation — pushing shadows toward grey is the
// single clearest amateur tell, and the pro move is the opposite of what feels natural.
export function shade(c, amt) {
  const [r, g, b] = rgb(c);
  if (amt >= 0) return [r + (1 - r) * amt * 0.95, g + (1 - g) * amt * 0.8, b + (1 - b) * amt * 0.45];
  const m = (r + g + b) / 3;
  const k = 1 + amt * 0.82;
  const sat = 1 - amt * 0.5;
  const ch = (v, warm) => Math.min(1, Math.max(0, (m + (v - m) * sat) * k * warm));
  return [ch(r, 1), ch(g, 1.015), ch(b, 1.14)];
}

export class Mesh {
  constructor() { this.p = []; this.c = []; }

  tri(a, b, c, col) {
    const k = rgb(col);
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.c.push(k[0], k[1], k[2]);
    return this;
  }

  quad(a, b, c, d, col) { return this.tri(a, b, c, col).tri(a, c, d, col); }

  // Stamps another geometry through a matrix. How composite props are assembled.
  add(geo, m, tint) {
    const p = geo.attributes.position.array, col = geo.attributes.color?.array;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i], p[i + 1], p[i + 2]);
      if (m) v.applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
      if (tint) { const k = rgb(tint); this.c.push(k[0], k[1], k[2]); }
      else if (col) this.c.push(col[i], col[i + 1], col[i + 2]);
      else this.c.push(1, 1, 1);
    }
    return this;
  }

  get tris() { return this.p.length / 9; }

  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  }
}

// ── rings ────────────────────────────────────────────────────────────────────────────────────
// A ring is a closed loop of points at one height. Loft a stack of them and you have almost
// every form in the kit: tapered towers, chamfered blocks, witch-hat roofs, tree trunks.

export function ringCircle(sides, r, y = 0, rot = 0, squash = 1) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r * squash]);
  }
  return out;
}

// Corner-cut rectangle. `cut` in world units — the chamfer that stops a box reading as a box.
export function ringRect(w, d, y = 0, cut = 0) {
  const x = w / 2, z = d / 2, k = Math.min(cut, x * 0.9, z * 0.9);
  if (k <= 0) return [[x, y, z], [-x, y, z], [-x, y, -z], [x, y, -z]];
  return [
    [x - k, y, z], [-x + k, y, z], [-x, y, z - k], [-x, y, -z + k],
    [-x + k, y, -z], [x - k, y, -z], [x, y, -z + k], [x, y, z - k],
  ];
}

export function scaleRing(ring, s, dy = 0) {
  return ring.map(p => [p[0] * s, p[1] + dy, p[2] * s]);
}

export function rotRing(ring, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return ring.map(p => [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c]);
}

export function moveRing(ring, dx, dy, dz) {
  return ring.map(p => [p[0] + dx, p[1] + dy, p[2] + dz]);
}

// ── loft ─────────────────────────────────────────────────────────────────────────────────────
// Skins a stack of equal-length rings. `col` may be a function (ringIndex, faceIndex, t) → colour,
// which is how a form gets a vertical gradient and per-face value break-up in one pass.

export function loft(rings, { col = '#ffffff', capBottom = true, capTop = true, into = null } = {}) {
  const m = into || new Mesh();
  const n = rings[0].length;
  const pick = typeof col === 'function' ? col : () => col;

  for (let r = 0; r < rings.length - 1; r++) {
    const lo = rings[r], hi = rings[r + 1];
    const t = (r + 0.5) / Math.max(1, rings.length - 1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      m.quad(lo[i], lo[j], hi[j], hi[i], pick(r, i, t));
    }
  }
  if (capBottom) fan(m, rings[0], pick(-1, 0, 0), true);
  if (capTop) fan(m, rings[rings.length - 1], pick(rings.length, 0, 1), false);
  return into ? m : m.geo();
}

// `down` is the bottom cap. ringCircle winds counter-clockwise seen from +Y, so (c, i, j) faces
// -Y and (c, j, i) faces +Y — the opposite of what reads naturally, and getting it backwards
// leaves every capped form open at both ends.
function fan(m, ring, col, down) {
  let cx = 0, cy = 0, cz = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
  const c = [cx / ring.length, cy / ring.length, cz / ring.length];
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    down ? m.tri(c, ring[i], ring[j], col) : m.tri(c, ring[j], ring[i], col);
  }
}

// ── forms ────────────────────────────────────────────────────────────────────────────────────

// Odd side counts by default: an even n-gon presents two faces square to the camera at the
// common 45° iso azimuth, which is exactly what reads as "box".
export function prism(sides, rBot, rTop, h, { rot = 0, twist = 0, rings = 1, col = '#ffffff', squash = 1, capBottom = true, capTop = true } = {}) {
  const stack = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    stack.push(ringCircle(sides, rBot + (rTop - rBot) * t, h * t, rot + twist * t, squash));
  }
  return loft(stack, { col, capBottom, capTop });
}

// A block that is never a box: chamfered all round, tapered, optionally sheared and twisted.
export function block(w, h, d, { cut = 0.08, taper = 0.06, shear = 0, twist = 0, col = '#ffffff' } = {}) {
  const c = Math.min(cut, h * 0.4);
  const s = t => 1 - taper * t;
  const stack = [
    scaleRing(ringRect(w, d, 0, c * 1.6), s(0) * 0.96),
    ringRect(w, d, c, c),
    ringRect(w * s(1), d * s(1), h - c, c),
    scaleRing(ringRect(w * s(1), d * s(1), h, c * 1.6), 0.97),
  ];
  return loft(stack.map((ring, i) => {
    const t = ring[0][1] / h;
    return rotRing(ring, twist * t).map(p => [p[0] + shear * t, p[1], p[2]]);
  }), { col });
}

// Deformed icosahedron. Rocks, boulders, canopy masses, bread, hay — the workhorse.
export function blob(r, detail, { jitter = 0.22, squash = 1, stretch = 1, rng = Math.random, col = '#ffffff', flatten = 0 } = {}) {
  // PolyhedronGeometry is already non-indexed; calling toNonIndexed() on it only warns.
  const ico = new THREE.IcosahedronGeometry(r, detail);
  const src = ico.index ? ico.toNonIndexed() : ico;
  const p = src.attributes.position.array;
  const seen = new Map();
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const v = new THREE.Vector3();

  for (let i = 0; i < p.length; i += 3) {
    const k = key(p[i], p[i + 1], p[i + 2]);
    let d = seen.get(k);
    if (d === undefined) { d = 1 + (rng() - 0.5) * 2 * jitter; seen.set(k, d); }
    v.set(p[i] * d, p[i + 1] * d * stretch, p[i + 2] * d * squash);
    if (flatten && v.y < 0) v.y *= 1 - flatten;
    p[i] = v.x; p[i + 1] = v.y + r * stretch * (flatten ? 0.5 : 1) * 0; p[i + 2] = v.z;
  }
  src.deleteAttribute('normal');
  src.deleteAttribute('uv');
  paint(src, col);
  src.computeVertexNormals();
  return src;
}

// Concave-swept cone. `curve` > 1 pulls the profile in and gives the storybook witch hat;
// = 1 is a plain cone; < 1 bells it outward.
export function spire(sides, r, h, { curve = 1.55, rings = 4, rot = 0, col = '#ffffff', flare = 0 } = {}) {
  const stack = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const rr = r * Math.pow(1 - t, curve) + flare * r * Math.sin(t * Math.PI) * 0.35;
    stack.push(ringCircle(sides, Math.max(rr, 0.001), h * t, rot + t * 0.12));
  }
  return loft(stack, { col, capTop: false });
}

// Gabled roof with overhang and an optional sagging ridge — a dead-straight ridge is the
// fastest way to look untouched.
export function gable(w, d, h, { over = 0.22, sag = 0.05, col = '#ffffff', thick = 0.1 } = {}) {
  const m = new Mesh();
  const W = w / 2 + over, D = d / 2 + over;
  const dip = h * sag;
  const ridge = z => [0, h - dip * (1 - Math.abs(z / D)) * 0, z];
  const rTop = [[0, h, -D], [0, h - dip, 0], [0, h, D]];
  const eaveL = z => [-W, 0, z], eaveR = z => [W, 0, z];
  const zs = [-D, 0, D];
  const c = typeof col === 'function' ? col : () => col;
  for (let i = 0; i < 2; i++) {
    m.quad(eaveL(zs[i]), eaveL(zs[i + 1]), rTop[i + 1], rTop[i], c(0, i, 0.5));
    m.quad(rTop[i], rTop[i + 1], eaveR(zs[i + 1]), eaveR(zs[i]), c(1, i, 0.5));
  }
  m.tri(eaveL(-D), rTop[0], eaveR(-D), c(2, 0, 0));
  m.tri(eaveR(D), rTop[2], eaveL(D), c(2, 1, 0));
  const g = m.geo();
  if (thick) return g;
  return g;
}

// Hipped roof: four slopes to a short ridge. Reads richer than a gable from an iso angle.
export function hip(w, d, h, { over = 0.2, ridge = 0.42, col = '#ffffff' } = {}) {
  const m = new Mesh();
  const W = w / 2 + over, D = d / 2 + over, R = (d / 2) * ridge;
  const a = [-W, 0, D], b = [W, 0, D], c = [W, 0, -D], e = [-W, 0, -D];
  const r0 = [0, h, R], r1 = [0, h, -R];
  const k = typeof col === 'function' ? col : () => col;
  m.tri(a, b, r0, k(0, 0, 0.5));
  m.tri(c, e, r1, k(0, 1, 0.5));
  m.quad(b, c, r1, r0, k(1, 0, 0.5));
  m.quad(e, a, r0, r1, k(1, 1, 0.5));
  return m.geo();
}

// Extruded ribbon along a path. Paths, roads, river beds, bridge decks, fence rails.
export function ribbon(pts, width, { col = '#ffffff', lift = 0.02, taperEnds = 0 } = {}) {
  const m = new Mesh();
  const k = typeof col === 'function' ? col : () => col;
  const side = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    let dx = q[0] - o[0], dz = q[2] - o[2];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    let hw = (Array.isArray(width) ? width[i] : width) / 2;
    if (taperEnds) {
      const t = Math.min(i, pts.length - 1 - i) / (pts.length * 0.5);
      hw *= 1 - taperEnds * (1 - Math.min(1, t));
    }
    side.push([[p[0] - dz * hw, p[1] + lift, p[2] + dx * hw], [p[0] + dz * hw, p[1] + lift, p[2] - dx * hw]]);
  }
  for (let i = 0; i < side.length - 1; i++) {
    m.quad(side[i][0], side[i][1], side[i + 1][1], side[i + 1][0], k(i, 0, i / side.length));
  }
  return m.geo();
}

// Two independent edge polylines skinned together. `ribbon()` assumes a level cross-section, which
// floats clear of the downhill bank on any side slope — this is the version for that case, and for
// roads and paths, which hit it constantly.
export function strip(left, right, { col = '#ffffff' } = {}) {
  const m = new Mesh();
  const k = typeof col === 'function' ? col : () => col;
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n - 1; i++) m.quad(left[i], right[i], right[i + 1], left[i + 1], k(i, 0, i / n));
  return m.geo();
}

// ── operations ───────────────────────────────────────────────────────────────────────────────

export function paint(geo, col) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const fn = typeof col === 'function' ? col : null;
  const k = fn ? null : rgb(col);
  const p = geo.attributes.position.array;
  for (let i = 0; i < n; i += 3) {
    const c = fn ? rgb(fn(p[i * 3 + 1], i / 3, p[i * 3], p[i * 3 + 2])) : k;
    for (let j = 0; j < 3; j++) { arr[(i + j) * 3] = c[0]; arr[(i + j) * 3 + 1] = c[1]; arr[(i + j) * 3 + 2] = c[2]; }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

// Vertical gradient across the form's own bounds. Foliage and terrain both live on this.
export function gradient(geo, bottom, top, { power = 1 } = {}) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const span = Math.max(1e-4, max.y - min.y);
  const pos = geo.attributes.position.array;
  const col = geo.attributes.color.array;
  for (let i = 0; i < pos.length; i += 9) {
    const yc = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3;
    const c = mix(bottom, top, Math.pow(THREE.MathUtils.clamp((yc - min.y) / span, 0, 1), power));
    for (let j = 0; j < 3; j++) {
      col[i + j * 3] = c[0]; col[i + j * 3 + 1] = c[1]; col[i + j * 3 + 2] = c[2];
    }
  }
  return geo;
}

// Per-triangle value break-up. Cheap, and the single clearest tell between a render that looks
// authored and one that looks like default material fills.
export function speckle(geo, amt = 0.06, rng = Math.random) {
  const col = geo.attributes.color.array;
  for (let i = 0; i < col.length; i += 9) {
    const d = 1 + (rng() - 0.5) * 2 * amt;
    for (let j = 0; j < 9; j++) col[i + j] *= d;
  }
  return geo;
}

// Loosens a form off the grid. Applied per unique position so shared edges stay welded.
export function jitter(geo, amt, rng = Math.random, { axis = [1, 1, 1] } = {}) {
  const p = geo.attributes.position.array;
  const seen = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const k = `${p[i].toFixed(3)},${p[i + 1].toFixed(3)},${p[i + 2].toFixed(3)}`;
    let d = seen.get(k);
    if (!d) { d = [(rng() - 0.5) * 2 * amt, (rng() - 0.5) * 2 * amt, (rng() - 0.5) * 2 * amt]; seen.set(k, d); }
    p[i] += d[0] * axis[0]; p[i + 1] += d[1] * axis[1]; p[i + 2] += d[2] * axis[2];
  }
  geo.computeVertexNormals();
  return geo;
}

// Leans a form about its base — used on trunks, chimneys, fence posts, gravestones.
export function bend(geo, radians, { axis = 'x', from = 0 } = {}) {
  const p = geo.attributes.position.array;
  geo.computeBoundingBox();
  const h = Math.max(1e-4, geo.boundingBox.max.y - from);
  for (let i = 0; i < p.length; i += 3) {
    const t = Math.max(0, (p[i + 1] - from) / h);
    const a = radians * t * t;
    const s = Math.sin(a), c = Math.cos(a);
    const y = p[i + 1] - from;
    if (axis === 'x') { const x = p[i]; p[i] = x * c - y * s; p[i + 1] = x * s + y * c + from; }
    else { const z = p[i + 2]; p[i + 2] = z * c - y * s; p[i + 1] = z * s + y * c + from; }
  }
  geo.computeVertexNormals();
  return geo;
}

// Re-welds normals so a form reads smooth instead of faceted. Reach for it on exactly the few
// shapes that want it — water, cloth, a domed hill — never globally.
export function smooth(geo, tol = 3) {
  const p = geo.attributes.position.array;
  geo.computeVertexNormals();
  const n = geo.attributes.normal.array;
  const acc = new Map();
  const key = i => `${p[i].toFixed(tol)},${p[i + 1].toFixed(tol)},${p[i + 2].toFixed(tol)}`;
  for (let i = 0; i < p.length; i += 3) {
    const k = key(i);
    const a = acc.get(k) || [0, 0, 0];
    a[0] += n[i]; a[1] += n[i + 1]; a[2] += n[i + 2];
    acc.set(k, a);
  }
  for (let i = 0; i < p.length; i += 3) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    n[i] = a[0] / l; n[i + 1] = a[1] / l; n[i + 2] = a[2] / l;
  }
  geo.attributes.normal.needsUpdate = true;
  return geo;
}

export function transform(geo, { pos = [0, 0, 0], ry = 0, rx = 0, rz = 0, scale = 1 } = {}) {
  const m = new THREE.Matrix4();
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  m.compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(...s),
  );
  geo.applyMatrix4(m);
  return geo;
}

export const matrix = ({ pos = [0, 0, 0], ry = 0, rx = 0, rz = 0, scale = 1 } = {}) => {
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(...s),
  );
};
