// GAMBIT theme kit — the shared toolkit for sculptors and animators.
// Owner: board agent. Themes receive this module as `kit`.
// Read js/themes/MODEL_GUIDE.md first. Everything here is plain functions; nothing
// needs `new` except Timeline (the board makes those for you, see ctx.tween).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };

// ---------------------------------------------------------------------------
// Easings: f(k) for k in [0,1]
// ---------------------------------------------------------------------------
export const ease = {
  linear: k => k,
  quadIn: k => k * k,
  quadOut: k => k * (2 - k),
  quadInOut: k => (k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k),
  cubicIn: k => k * k * k,
  cubicOut: k => 1 - Math.pow(1 - k, 3),
  cubicInOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  expoOut: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  expoIn: k => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
  sineInOut: k => -(Math.cos(Math.PI * k) - 1) / 2,
  backOut: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  backIn: k => { const c1 = 1.70158, c3 = c1 + 1; return c3 * k * k * k - c1 * k * k; },
  elasticOut: k => (k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  bounceOut: k => {
    const n1 = 7.5625, d1 = 2.75;
    if (k < 1 / d1) return n1 * k * k;
    if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
    if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
    return n1 * (k -= 2.625 / d1) * k + 0.984375;
  },
};
/** 0→1→0 bump, peak at k=0.5. */
export const bump = k => Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];

// ---------------------------------------------------------------------------
// Timeline — the clock every animation runs on. The board owns one per move and
// advances it each frame; `rate` is the battle speed (1, 2, 5). `finish()` is how
// a tap skips a battle: every running tween jumps to its end state and every later
// tween/wait resolves instantly, so the anim code runs to completion in microtasks
// and leaves a consistent final state. RULE: animate only with tween()/wait(),
// never setTimeout/requestAnimationFrame, or skipping and speed will not work.
// ---------------------------------------------------------------------------
export class Timeline {
  constructor(rate = 1) { this.rate = rate; this.items = []; this.instant = false; this.time = 0; }
  get busy() { return this.items.length > 0; }
  /** tween(ms, fn(easedK, rawK), easing) -> Promise. fn(…,0) runs immediately. */
  tween(ms, fn, easing = ease.linear) {
    return new Promise(resolve => {
      if (this.instant || !(ms > 0)) { fn(easing(1), 1); resolve(); return; }
      fn(easing(0), 0);
      this.items.push({ t: 0, ms, fn, easing, resolve });
    });
  }
  wait(ms) { return this.tween(ms, () => {}); }
  /** Tween numeric props: tl.to(obj.position, {y: 1}, 200, ease.quadOut) */
  to(target, props, ms, easing = ease.linear) {
    const start = {};
    for (const k in props) start[k] = target[k];
    return this.tween(ms, e => { for (const k in props) target[k] = start[k] + (props[k] - start[k]) * e; }, easing);
  }
  update(dtMs) {
    if (!this.items.length) return;
    const d = dtMs * this.rate;
    this.time += d;
    const items = this.items.slice();
    for (const it of items) {
      it.t += d;
      const k = Math.min(1, it.t / it.ms);
      try { it.fn(it.easing(k), k); } catch (e) { console.error(e); }
      if (k >= 1) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); it.resolve(); }
    }
  }
  finish() {
    this.instant = true;
    const items = this.items; this.items = [];
    for (const it of items) { try { it.fn(it.easing(1), 1); } catch (e) { console.error(e); } it.resolve(); }
  }
}

// ---------------------------------------------------------------------------
// Vectors / paths
// ---------------------------------------------------------------------------
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** Parabolic arc: writes into out. height = apex above the straight line. */
export function arc(out, from, to, height, t) {
  out.lerpVectors(from, to, t);
  out.y += 4 * height * t * (1 - t);
  return out;
}
/** Horizontal unit direction from a to b (y=0). Falls back to `fallback` or +x. */
export function flatDir(a, b, fallback) {
  const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  if (d.lengthSq() < 1e-6) return fallback ? fallback.clone() : new THREE.Vector3(1, 0, 0);
  return d.normalize();
}
export function flatDist(a, b) { return Math.hypot(b.x - a.x, b.z - a.z); }
/** Axis to tilt something "forward" along horizontal dir (rotation by +angle leans it toward dir). */
export function tiltAxis(dir) { return new THREE.Vector3().crossVectors(UP, dir).normalize(); }
/** Set obj orientation to: lean `angle` radians toward dir, then spin `spin` around Y. */
export function setLean(obj, dir, angle, spin = 0) {
  obj.quaternion.setFromAxisAngle(tiltAxis(dir), angle);
  if (spin) obj.quaternion.multiply(_q.setFromAxisAngle(UP, spin));
}

// ---------------------------------------------------------------------------
// Materials. Side colours must read from straight overhead, on BOTH square colours:
// light side = warm ivory with a darkened silhouette edge, dark side = ebony with a
// light rim glow. Use sideMaterial(color) unless you have a reason not to.
// ---------------------------------------------------------------------------
// Side convention (Aaron's refs): WHITE = ivory/gold with BLUE accents,
// BLACK = black/chrome with RED accents. `accent` is for cloth, gems, banners, glows.
export const palette = {
  w: { base: '#f2e8d5', roughness: 0.36, metalness: 0.0, accent: '#2f6fe0', gold: '#f2c66d',
       rim: { mode: 'darken', color: '#000000', strength: 0.55, power: 2.2 } },
  b: { base: '#2a201b', roughness: 0.30, metalness: 0.0, accent: '#d4262e', gold: '#c9a35a',
       rim: { mode: 'glow', color: '#ff6a4a', strength: 0.5, power: 2.6 } },
};
/** Ready-made premium looks (used by Classic): polished gold vs glossy black chrome. */
export const metalLooks = {
  w: { color: '#f4c76a', metalness: 1.0, roughness: 0.2, rim: { mode: 'darken', color: '#3a2205', strength: 0.6, power: 2.0 } },
  // black: deep lacquered chrome; a cool silver fresnel rim outlines it on dark squares and a
  // "top sheen" puts a bright cap on upward faces so it reads from straight overhead
  b: { color: '#1c1d22', metalness: 0.9, roughness: 0.1,
       rim: { mode: 'glow', color: '#c8d4f4', strength: 0.26, power: 3.4, top: { color: '#e8eeff', strength: 0.32, power: 18 } } },
};
/**
 * Board colours — THE place to tune square contrast for every theme that uses them.
 * Rule: the dark square must sit clearly between black pieces and light squares in value
 * (black pieces must read on dark squares from overhead).
 */
export const boardLooks = {
  marble: {
    light: '#d8d4cb', lightCloud: 'rgba(140,140,150,0.12)', lightVein: 'rgba(105,108,120,0.42)', lightVein2: 'rgba(185,155,95,0.35)', lightLabel: '#4b5262',
    dark: '#69717f', darkCloud: 'rgba(30,36,52,0.16)', darkVein: 'rgba(210,216,232,0.30)', darkVein2: 'rgba(222,184,104,0.40)', darkLabel: '#ece0bf',
  },
};
/** Accent material for a side (blue for white, red for black), optionally glowing. */
export function accentMaterial(color, { glow = 0, roughness = 0.5, metalness = 0 } = {}) {
  const c = palette[color]?.accent || '#888888';
  return material({ color: c, roughness, metalness, emissive: glow ? c : undefined, emissiveIntensity: glow });
}
const matCache = new Map();
/**
 * material({color, roughness, metalness, emissive, emissiveIntensity, rim, vertexColors,
 *           flatShading, envMapIntensity, transparent, opacity, map, side, physical, clearcoat})
 * Cached by options, so calling it per piece is free. rim = {mode:'darken'|'glow', color, strength, power}.
 */
export function material(o = {}) {
  const key = JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  const P = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new P({
    color: new THREE.Color(o.color ?? '#ffffff'),
    roughness: o.roughness ?? 0.5,
    metalness: o.metalness ?? 0,
    vertexColors: o.vertexColors ?? true,
    flatShading: !!o.flatShading,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    map: o.map || null,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.physical && o.clearcoat) { m.clearcoat = o.clearcoat; m.clearcoatRoughness = o.clearcoatRoughness ?? 0.2; }
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (o.envMapIntensity != null) m.envMapIntensity = o.envMapIntensity;
  if (o.rim) addRim(m, o.rim);
  m.userData.kitCached = true;
  matCache.set(key, m);
  return m;
}
/** The default material for a side ('w'|'b'). Overrides merge onto the palette entry. */
export function sideMaterial(color, overrides = {}) {
  const p = palette[color] || palette.w;
  return material({ color: p.base, roughness: p.roughness, metalness: p.metalness, rim: p.rim, ...overrides,
    rim: overrides.rim === null ? undefined : { ...p.rim, ...(overrides.rim || {}) } });
}
/** Fresnel rim, injected into MeshStandard/Physical. darken = outline, glow = emissive rim. */
export function addRim(m, rim) {
  const col = new THREE.Color(rim.color ?? '#ffffff');
  const mode = rim.mode === 'glow' ? 1 : 0;
  const strength = rim.strength ?? 0.5, power = rim.power ?? 2.5;
  const top = rim.top || { color: '#000000', strength: 0, power: 8 };
  const topCol = new THREE.Color(top.color ?? '#ffffff');
  m.onBeforeCompile = sh => {
    sh.uniforms.uRimColor = { value: col };
    sh.uniforms.uRim = { value: new THREE.Vector3(mode, strength, power) };
    sh.uniforms.uTopColor = { value: topCol };
    sh.uniforms.uTop = { value: new THREE.Vector2(top.strength ?? 0, top.power ?? 8) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform vec3 uRim; uniform vec3 uTopColor; uniform vec2 uTop;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float rimK = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), uRim.z) * uRim.y;
        if (uRim.x < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uRimColor, clamp(rimK, 0.0, 1.0));
        else totalEmissiveRadiance += uRimColor * rimK;
        if (uTop.x > 0.0) {   // sheen on upward-facing surfaces (world space), reads from overhead
          vec3 wN = inverseTransformDirection(normal, viewMatrix);
          totalEmissiveRadiance += uTopColor * pow(max(wN.y, 0.0), uTop.y) * uTop.x;
        }
      }`);
  };
  m.customProgramCacheKey = () => `rim${mode}_${strength}_${power}_${top.strength ?? 0}_${top.power ?? 8}`;
  return m;
}
/** Give obj its own material copies (so fades/flashes don't affect every piece). Board disposes them. */
export function ownMaterials(obj) {
  obj.traverse(o => {
    if (!o.isMesh || o.userData.ownMat) return;
    const src = o.material;
    o.material = Array.isArray(src) ? src.map(cloneMat) : cloneMat(src);
    o.userData.ownMat = true;
  });
  return obj;
}
function cloneMat(m) {
  const c = m.clone();
  if (m.onBeforeCompile) { c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; }
  return c;
}
function forMats(obj, fn) {
  obj.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(fn); });
}

// ---------------------------------------------------------------------------
// Geometry helpers. Units: 1 square = 1 unit, piece base at y=0, Y up.
// ---------------------------------------------------------------------------
/** Lathe profile builder: kit.profile().pt(r,y).arc(cx,cy,R,a0,a1,n).bez(cr,cy,r,y,n).points() */
export function profile() {
  const pts = [];
  const api = {
    pt(r, y) { pts.push(new THREE.Vector2(Math.max(0, r), y)); return api; },
    /** circular arc around (cx,cy), angles in degrees (0 = +r, 90 = up). */
    arc(cx, cy, R, a0, a1, n = 8) {
      for (let i = 0; i <= n; i++) { const a = THREE.MathUtils.degToRad(lerp(a0, a1, i / n)); api.pt(cx + R * Math.cos(a), cy + R * Math.sin(a)); }
      return api;
    },
    /** quadratic bezier from the last point via control (cr,cy) to (r,y). */
    bez(cr, cy, r, y, n = 6) {
      const p0 = pts[pts.length - 1];
      for (let i = 1; i <= n; i++) {
        const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        api.pt(a * p0.x + b * cr + c * r, a * p0.y + b * cy + c * y);
      }
      return api;
    },
    points() { return pts.slice(); },
    get last() { return pts[pts.length - 1]; },
  };
  return api;
}
/** Lathe around Y with a white vertex colour attribute. */
export function lathe(points, { segments = 32, phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  const g = new THREE.LatheGeometry(points, segments, phiStart, phiLength);
  return ensureColor(g);
}
/** A capped wedge of a lathe (battlements, crown points). points = closed cross-section in (r,y). */
export function latheSegment(points, phiStart, phiLength, segments = 6) {
  const body = new THREE.LatheGeometry([...points, points[0]], segments, phiStart, phiLength);
  const caps = [phiStart, phiStart + phiLength].map((phi, i) => {
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.ShapeGeometry(shape);
    const pos = g.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const r = pos.getX(j), y = pos.getY(j);
      pos.setXYZ(j, r * Math.sin(phi), y, r * Math.cos(phi));
    }
    g.computeVertexNormals();
    // cap normal must face away from the wedge
    const want = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)).multiplyScalar(i === 0 ? 1 : -1);
    const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0);
    if (n.dot(want) < 0) { flipFaces(g); }
    return g;
  });
  return merge([body, ...caps]);
}
function flipFaces(g) {
  const idx = g.index;
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); } }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
}
/** Rounded rectangle Shape centred on 0. */
export function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** Bevelled box, centred, w (x) × h (y) × d (z). */
export function bevelBox(w, h, d, bevel = 0.02, segments = 2) {
  const b = Math.min(bevel, w / 2.2, h / 2.2, d / 2.2);
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * b, d - 2 * b, b * 0.6), {
    depth: Math.max(0.0001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: segments, curveSegments: 3,
  });
  g.translate(0, 0, -(h - 2 * b) / 2);
  g.rotateX(-Math.PI / 2);
  return ensureColor(g);
}
/** Extrude a 2D shape (THREE.Shape or [[x,y]...]) along +z, centred on z. */
export function extrude(shape, { depth = 0.1, bevel = 0.02, bevelSegments = 3, curveSegments = 16 } = {}) {
  if (Array.isArray(shape)) shape = new THREE.Shape(shape.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments });
  g.translate(0, 0, -depth / 2);
  return ensureColor(g);
}
export const sphere = (r, w = 16, h = 12) => ensureColor(new THREE.SphereGeometry(r, w, h));
export const cylinder = (rt, rb, h, seg = 24) => ensureColor(new THREE.CylinderGeometry(rt, rb, h, seg));
export const torus = (r, tube, rs = 8, ts = 32) => ensureColor(new THREE.TorusGeometry(r, tube, rs, ts));

/** Transform a geometry in place: place(g, {x,y,z, rx,ry,rz, s, sx,sy,sz}). Returns g. */
export function place(g, t = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx || 0, t.ry || 0, t.rz || 0)),
    new THREE.Vector3(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1));
  g.applyMatrix4(m);
  return g;
}
/** Make sure g has a 'color' attribute (white by default). Needed because kit materials use vertexColors. */
export function ensureColor(g, rgb = [1, 1, 1]) {
  if (!g.attributes.color) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = rgb[0]; a[i * 3 + 1] = rgb[1]; a[i * 3 + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return g;
}
/** Tint a whole geometry's vertex colours (e.g. dark eyes merged into a light head). */
export function tint(g, hexOrRgb) {
  ensureColor(g);
  const c = typeof hexOrRgb === 'number' || typeof hexOrRgb === 'string' ? new THREE.Color(hexOrRgb) : null;
  const rgb = c ? [c.r, c.g, c.b] : hexOrRgb;
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * rgb[0], col.getY(i) * rgb[1], col.getZ(i) * rgb[2]);
  return g;
}
/** Paint vertex colours: fn(x,y,z) -> multiplier number or [r,g,b]. */
export function paint(g, fn) {
  ensureColor(g);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const m = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (m == null) continue;
    const r = Array.isArray(m) ? m : [m, m, m];
    c.setXYZ(i, c.getX(i) * r[0], c.getY(i) * r[1], c.getZ(i) * r[2]);
  }
  return g;
}
/**
 * Carve a groove: vertices within width/2 of the plane (normal·p = offset) and passing
 * `where(x,y,z)` are pushed inward along their normal by depth (smooth falloff) and darkened.
 * Used for the bishop's mitre slot. Needs a reasonably dense mesh.
 */
export function carve(g, { normal, offset = 0, width = 0.04, depth = 0.03, darken = 0.4, where = () => true }) {
  ensureColor(g);
  const n = normal.clone().normalize();
  const p = g.attributes.position, nr = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (!where(x, y, z)) continue;
    const d = Math.abs(n.x * x + n.y * y + n.z * z - offset);
    if (d > width / 2) continue;
    const f = Math.cos((d / (width / 2)) * Math.PI / 2);
    p.setXYZ(i, x - nr.getX(i) * depth * f, y - nr.getY(i) * depth * f, z - nr.getZ(i) * depth * f);
    const k = lerp(1, darken, f);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  p.needsUpdate = true;
  return g;
}
/** Merge geometries into one (normalises attributes: position, normal, color, uv). */
export function merge(geoms) {
  const list = geoms.filter(Boolean).map(g => {
    let x = g.index ? g.toNonIndexed() : g.clone();
    if (!x.attributes.normal) x.computeVertexNormals();
    ensureColor(x);
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) x.deleteAttribute(k);
    x.morphAttributes = {};
    return x;
  });
  const out = mergeGeometries(list, false);
  list.forEach(g => g.dispose());
  return out;
}
/**
 * Build a piece from parts: piece([{geom, mat}, ...]) -> Group with ONE mesh per material
 * (merging is what keeps draw calls low). Parts may also be plain geometries (then `mat` = defMat).
 */
export function piece(parts, defMat) {
  const byMat = new Map();
  for (const p of parts) {
    const geom = p.isBufferGeometry ? p : p.geom, mat = p.isBufferGeometry ? defMat : (p.mat || defMat);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geom);
  }
  const g = new THREE.Group();
  for (const [mat, geoms] of byMat) {
    const mesh = new THREE.Mesh(merge(geoms), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  geomsDispose(parts);
  return g;
}
function geomsDispose(parts) { for (const p of parts) (p.isBufferGeometry ? p : p.geom).dispose(); }
/** Count triangles + meshes of an object (for the gallery and budgets). */
export function stats(obj) {
  let tris = 0, meshes = 0;
  obj.traverse(o => {
    if (!o.isMesh) return; meshes++;
    const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { tris: Math.round(tris), meshes };
}
export function dispose(obj) {
  obj.traverse(o => {
    if (o.isMesh || o.isPoints || o.isSprite) {
      if (o.userData.ownGeom) o.geometry.dispose();
      if (o.userData.ownMat) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    }
  });
}

// ---------------------------------------------------------------------------
// Canvas textures (boards)
// ---------------------------------------------------------------------------
export function canvasTexture(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
/** Draw wood grain into a rect of a 2D context. */
export function drawWood(ctx, x, y, w, h, { base = '#c8a06a', dark = 'rgba(70,40,15,0.18)', light = 'rgba(255,240,210,0.10)', vertical = false, seed = 1, lines = 26 } = {}) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  const L = vertical ? w : h, M = vertical ? h : w;
  for (let i = 0; i < lines; i++) {
    const off = rnd() * L, amp = 1 + rnd() * L * 0.03, freq = 1 + rnd() * 3, ph = rnd() * 6.28;
    ctx.strokeStyle = rnd() < 0.6 ? dark : light; ctx.lineWidth = 0.6 + rnd() * L * 0.012;
    ctx.beginPath();
    for (let j = 0; j <= 24; j++) {
      const m = (j / 24) * M, o = off + Math.sin(j / 24 * freq * 6.28 + ph) * amp;
      const px = vertical ? x + o : x + m, py = vertical ? y + m : y + o;
      j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw polished marble into a rect: soft clouds plus branching veins. */
export function drawMarble(ctx, x, y, w, h, { base = '#ebe8e2', cloud = 'rgba(150,150,160,0.10)', vein = 'rgba(90,90,100,0.55)', vein2 = 'rgba(200,170,110,0.35)', seed = 1, veins = 5 } = {}) {
  let s = (seed * 7919) % 233280 || 1;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 10; i++) { // cloudy mottling
    const cx = x + rnd() * w, cy = y + rnd() * h, r = (0.2 + rnd() * 0.5) * w;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, cloud); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  const stroke = (col, width, x0, y0, ang, len, depth) => {
    let px = x0, py = y0;
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (let k = 0; k < 18; k++) {
      ang += (rnd() - 0.5) * 0.7;
      const nx = px + Math.cos(ang) * len / 18, ny = py + Math.sin(ang) * len / 18;
      ctx.lineWidth = Math.max(0.4, width * (1 - k / 22));
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      if (depth < 2 && rnd() < 0.12) stroke(col, width * 0.55, nx, ny, ang + (rnd() - 0.5) * 1.6, len * 0.45, depth + 1);
      px = nx; py = ny;
    }
  };
  for (let i = 0; i < veins; i++) {
    const a = rnd() * Math.PI * 2, col = rnd() < 0.3 ? vein2 : vein;
    for (const wmul of [3.2, 1.6, 0.7]) { // soft halo then crisp core (same seed path)
      const save = s; ctx.globalAlpha = wmul > 3 ? 0.18 : wmul > 1 ? 0.35 : 1;
      stroke(col, (0.6 + rnd() * 1.4) * wmul * w / 128, x + rnd() * w, y + rnd() * h, a, w * (0.8 + rnd()), 0);
      s = save;
    }
    rnd(); rnd(); rnd(); rnd();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Mid-level animators. All take the anim ctx (for ctx.tween) and return Promises.
// They animate the OUTER object (the board puts the side's yaw on an inner group,
// so rotation 0 / scale 1 = the piece's resting pose).
// ---------------------------------------------------------------------------
/** Hop along an arc. opts: {height, ms, spin (radians), lean, squash (0..1), easing} */
export async function hopTo(ctx, obj, to, o = {}) {
  const from = obj.position.clone(), dir = flatDir(from, to);
  const dist = flatDist(from, to);
  const ms = o.ms ?? clamp(200 + dist * 22, 200, 320), h = o.height ?? clamp(0.3 + dist * 0.09, 0.3, 0.9);
  const spin = o.spin || 0, lean = o.lean ?? 0.18;
  await ctx.tween(ms, (e, k) => {
    arc(obj.position, from, to, h, e);
    setLean(obj, dir, lean * Math.sin(k * Math.PI * 2) * -1 * (k < 0.5 ? 1 : 0.6), spin * e);
  }, o.easing || ease.sineInOut);
  setLean(obj, dir, 0, 0);
  if (o.squash !== 0) await squash(ctx, obj, o.squash ?? 0.22, o.squashMs ?? 70);
}
/** Quick squash-and-recover on landing. */
export function squash(ctx, obj, amount = 0.22, ms = 80) {
  return ctx.tween(ms, (e, k) => {
    const s = bump(k) * amount;
    obj.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
  }).then(() => obj.scale.set(1, 1, 1));
}
/** Slide along the floor with stretch on start and squash on stop. */
export async function slideTo(ctx, obj, to, o = {}) {
  const from = obj.position.clone(), dir = flatDir(from, to), dist = flatDist(from, to);
  const ms = o.ms ?? clamp(180 + dist * 25, 180, 320);
  await ctx.tween(ms, (e, k) => {
    obj.position.lerpVectors(from, to, e);
    obj.position.y = from.y + (to.y - from.y) * e;
    const st = bump(k) * 0.16;
    obj.scale.set(1 - st * 0.4, 1 + st, 1 - st * 0.4);
    // inertia: top lags when accelerating, overshoots when braking
    setLean(obj, dir, k < 0.5 ? -0.14 * bump(k * 2) : 0.2 * bump((k - 0.5) * 2));
  }, o.easing || ease.cubicInOut);
  setLean(obj, dir, 0);
  await squash(ctx, obj, 0.18, 70);
}
/**
 * Tip obj over toward dir about its base edge (radius = base radius).
 * opts: {ms, radius, angle (default 90°), easing}
 */
export function tipOver(ctx, obj, dir, o = {}) {
  const r = o.radius ?? 0.3, ang = o.angle ?? Math.PI / 2;
  const base = obj.position.clone(), axis = tiltAxis(dir);
  const pivot = base.clone().addScaledVector(dir, r);
  const rel = base.clone().sub(pivot);
  return ctx.tween(o.ms ?? 380, e => {
    _q.setFromAxisAngle(axis, ang * e);
    obj.quaternion.copy(_q);
    _v.copy(rel).applyQuaternion(_q);
    obj.position.copy(pivot).add(_v);
  }, o.easing || ease.bounceOut);
}
/** Sink into the floor while shrinking (no material changes needed). */
export function sinkOut(ctx, obj, ms = 260) {
  const y0 = obj.position.y, s0 = obj.scale.clone();
  return ctx.tween(ms, e => {
    obj.position.y = y0 - e * 0.5;
    obj.scale.copy(s0).multiplyScalar(1 - e * 0.9);
  }, ease.quadIn).then(() => { obj.visible = false; });
}
/** Fade out (clones materials first so other pieces are unaffected). */
export function fadeOut(ctx, obj, ms = 250) {
  ownMaterials(obj);
  const mats = []; forMats(obj, m => { m.transparent = true; mats.push([m, m.opacity]); });
  return ctx.tween(ms, e => { for (const [m, o] of mats) m.opacity = o * (1 - e); }).then(() => { obj.visible = false; });
}
/** Flash obj with an emissive colour (hit flash). */
export function flashObject(ctx, obj, color = '#ffffff', ms = 160, strength = 1.6) {
  ownMaterials(obj);
  const c = new THREE.Color(color), mats = [];
  forMats(obj, m => { if (m.emissive) mats.push([m, m.emissive.clone(), m.emissiveIntensity]); });
  return ctx.tween(ms, (e, k) => {
    const f = bump(k) * strength;
    for (const [m, e0, i0] of mats) { m.emissive.copy(e0).lerp(c, Math.min(1, f)); m.emissiveIntensity = Math.max(i0, f); }
  }).then(() => { for (const [m, e0, i0] of mats) { m.emissive.copy(e0); m.emissiveIntensity = i0; } });
}
/** Camera shake (amplitude in world units, ~0.05 small, 0.15 big). */
export function shake(ctx, amp = 0.08, ms = 250) { ctx.camera?.shake(amp, ms); }
/**
 * Focus the camera on the fight, run `body()`, then return. Skipped automatically at 5×.
 * await kit.focusFight(ctx, async () => { ...the fight... }, {zoom: 0.72, tilt: 0.25})
 */
export async function focusFight(ctx, body, o = {}) {
  const use = ctx.camera && (o.force || ctx.speed <= 2);
  const mid = o.point || ctx.from.clone().lerp(ctx.victimPos || ctx.to, 0.6);
  if (use) await ctx.camera.focus(mid, { zoom: o.zoom ?? 0.75, tilt: o.tilt ?? 0.2, ms: o.ms ?? 260 });
  try { await body(); } finally { if (use) await ctx.camera.release({ ms: o.backMs ?? 300 }); }
}

// ---------------------------------------------------------------------------
// FX — one shared particle system per board (2 draw calls: additive + normal),
// plus pooled flashes and ground rings. ctx.fx is this; positions are world space.
// ---------------------------------------------------------------------------
const PVERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aShape;
uniform float uScale;
varying vec3 vColor; varying float vAlpha; varying float vShape;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * uScale / -mv.z);
  vColor = aColor; vAlpha = aAlpha; vShape = aShape;
}`;
const PFRAG = `
varying vec3 vColor; varying float vAlpha; varying float vShape;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a;
  if (vShape < 0.5) a = smoothstep(1.0, 0.15, r);                       // soft puff
  else if (vShape < 1.5) a = pow(1.0 - r, 1.6);                          // spark glow
  else {                                                                 // 4-point sparkle
    float s = max(0.0, 1.0 - abs(p.x) * 7.0 - abs(p.y) * 0.8) + max(0.0, 1.0 - abs(p.y) * 7.0 - abs(p.x) * 0.8);
    a = clamp(s + pow(1.0 - r, 3.0), 0.0, 1.0);
  }
  gl_FragColor = vec4(vColor, a * vAlpha);
  #include <colorspace_fragment>
}`;
class ParticleSystem {
  constructor(cap, blending) {
    this.cap = cap; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap); this.alpha = new Float32Array(cap); this.shape = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
    const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr(this.pos, 3)); g.setAttribute('aColor', attr(this.col, 3));
    g.setAttribute('aSize', attr(this.size, 1)); g.setAttribute('aAlpha', attr(this.alpha, 1)); g.setAttribute('aShape', attr(this.shape, 1));
    g.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 400 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PVERT, fragmentShader: PFRAG,
      transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    this.geom = g;
  }
  spawn(p) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([p.vx, p.vy, p.vz], i * 3); this.col.set(p.rgb, i * 3);
    this.life[i] = 0; this.max[i] = p.life; this.s0[i] = p.size; this.s1[i] = p.sizeEnd; this.a0[i] = p.alpha;
    this.grav[i] = p.gravity; this.drag[i] = p.drag; this.shape[i] = p.shape; this.size[i] = p.size; this.alpha[i] = p.alpha;
  }
  update(dt) {
    const s = dt / 1000;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { this.kill(i); i--; continue; }
      const k = this.life[i] / this.max[i], d = Math.exp(-this.drag[i] * s), j = i * 3;
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * s; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * s; this.pos[j + 1] += this.vel[j + 1] * s; this.pos[j + 2] += this.vel[j + 2] * s;
      if (this.pos[j + 1] < 0.01 && this.grav[i] > 0) { this.pos[j + 1] = 0.01; this.vel[j + 1] *= -0.35; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; }
      this.size[i] = lerp(this.s0[i], this.s1[i], k);
      this.alpha[i] = this.a0[i] * (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9);
    }
    const g = this.geom;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha', 'aShape']) g.attributes[k].needsUpdate = true;
  }
  kill(i) {
    const l = --this.n; if (i === l) return;
    const c3 = (a) => { a[i * 3] = a[l * 3]; a[i * 3 + 1] = a[l * 3 + 1]; a[i * 3 + 2] = a[l * 3 + 2]; };
    c3(this.pos); c3(this.vel); c3(this.col);
    for (const a of [this.life, this.max, this.s0, this.s1, this.a0, this.grav, this.drag, this.shape, this.size, this.alpha]) a[i] = a[l];
  }
  clear() { this.n = 0; this.geom.setDrawRange(0, 0); }
}
/** Rebuild a lightning bolt's ribbon geometry (crossed quads along a jagged path + branches). */
function buildBolt(b) {
  const pos = [];
  const quad = (a, c, w) => {
    // two crossed ribbons so it reads from overhead and from the side
    for (const off of [new THREE.Vector3(w, 0, 0), new THREE.Vector3(0, w, w).normalize().multiplyScalar(w)]) {
      const a1 = a.clone().sub(off), a2 = a.clone().add(off), c1 = c.clone().sub(off), c2 = c.clone().add(off);
      pos.push(...a1.toArray(), ...a2.toArray(), ...c2.toArray(), ...a1.toArray(), ...c2.toArray(), ...c1.toArray());
    }
  };
  const path = (from, to, n, jit, w, depth) => {
    let prev = from.clone();
    for (let i = 1; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (i < n) p.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(jit));
      quad(prev, p, w * (1 - i / (n * 1.6)));
      if (depth < b.branches && Math.random() < 0.18) {
        const end = p.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.6, 0.3), rand(-1, 1)).multiplyScalar(from.distanceTo(to) * 0.35));
        path(p, end, 4, jit * 0.6, w * 0.5, depth + 1);
      }
      prev = p;
    }
  };
  const L = b.from.distanceTo(b.to);
  path(b.from, b.to, Math.max(6, Math.round(L * 8)), L * 0.07, b.w, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  b.mesh.geometry.dispose(); b.mesh.geometry = g;
}
let _glowTex = null;
function glowTexture() {
  return _glowTex || (_glowTex = canvasTexture(64, 64, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  }));
}
/** Created by the board. Theme code uses ctx.fx.* — see the methods below. */
let _scorchTex = null;
function scorchTexture() {
  return _scorchTex || (_scorchTex = canvasTexture(128, 128, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(10,6,4,0.95)'); g.addColorStop(0.45, 'rgba(25,14,8,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2;
    for (let i = 0; i < 9; i++) { // cracks
      let a = Math.random() * 6.28, px = w / 2, py = w / 2; c.beginPath(); c.moveTo(px, py);
      for (let k = 0; k < 6; k++) { a += (Math.random() - 0.5) * 0.9; px += Math.cos(a) * w * 0.07; py += Math.sin(a) * w * 0.07; c.lineTo(px, py); }
      c.stroke();
    }
  }));
}
// ---------------------------------------------------------------------------
// battle-1: FX shader warm-up (additive helper, no change to existing FX behaviour).
// createFX parks one culled, off-screen mesh per kit FX material variant (flash sprite,
// ring/bolt/tint, scorch decal) in the fx group, and runs every hook registered with
// addFxWarmup(fn(group, scene)). The board calls renderer.compile(scene) right after
// createFX on theme load, so those programs are built then instead of mid-battle.
// Parked objects sit far outside the camera frustum (frustumCulled) or are InstancedMeshes
// with count 0, so they cost no draw calls. Warm materials live for the page (tiny).
// ---------------------------------------------------------------------------
const fxWarmups = [];
/** Register fn(group, scene) to run whenever the board creates its FX group (theme load). */
export function addFxWarmup(fn) { if (!fxWarmups.includes(fn)) fxWarmups.push(fn); }
export const PARK = new THREE.Vector3(1000, 0, 1000);
/** Move obj far outside the frustum (keeps it visible so renderer.compile still sees it). */
export function parkFX(obj) {
  obj.position.copy(PARK); obj.visible = true;
  if (obj.isInstancedMesh) obj.count = 0;
  return obj;
}
let _warmMats = null;
function warmFX(group, scene) {
  if (!_warmMats) {
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    _warmMats = {
      geo: new THREE.PlaneGeometry(0.01, 0.01),
      mesh: [
        new THREE.MeshBasicMaterial({ ...add }),                                    // tint
        new THREE.MeshBasicMaterial({ ...add, side: THREE.DoubleSide }),            // ring, lightning
        new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false }), // scorch
      ],
      sprite: new THREE.SpriteMaterial({ map: glowTexture(), ...add, depthTest: false }), // flash
    };
  }
  const w = new THREE.Group(); w.name = 'fx-warm';
  for (const m of _warmMats.mesh) w.add(new THREE.Mesh(_warmMats.geo, m));
  w.add(new THREE.Sprite(_warmMats.sprite));
  parkFX(w); group.add(w);
  for (const fn of fxWarmups) { try { fn(group, scene); } catch (e) { console.error('[kit] fx warmup failed', e); } }
}
export function createFX(scene, { overlayEl = null, flashLight = null } = {}) {
  const add = new ParticleSystem(1600, THREE.AdditiveBlending);
  const norm = new ParticleSystem(900, THREE.NormalBlending);
  const group = new THREE.Group(); group.name = 'fx';
  group.add(norm.points, add.points);
  scene.add(group);
  warmFX(group, scene);   // battle-1
  const flashes = [], rings = [], bolts = [], scorches = [], lightPulses = [];
  // debris: one InstancedMesh of chunky bevelled bits, simple physics
  const DEB = 96;
  const debMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
  const debris = new THREE.InstancedMesh(bevelBox(0.09, 0.07, 0.08, 0.015, 1), debMat, DEB);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEB * 3).fill(1), 3);
  debris.count = 0; debris.frustumCulled = false; debris.castShadow = true; group.add(debris);
  const deb = []; // {p, v, r(axis), a, av, s, life, max, rgb}
  const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _ds = new THREE.Vector3(), _dc = new THREE.Color();
  // board-wide tint plane for coloured flashes (additive, under the pieces)
  const tintMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), tintMat);
  tint.position.y = 0.012; tint.visible = false; tint.renderOrder = 3; group.add(tint);
  const lightBase = flashLight ? { color: flashLight.color.clone(), intensity: flashLight.intensity } : null;
  const tmpC = new THREE.Color();
  const rgb = c => { tmpC.set(c); return [tmpC.r, tmpC.g, tmpC.b]; };
  const range = (v, d) => (Array.isArray(v) ? rand(v[0], v[1]) : v ?? d);

  const fx = {
    rate: 1,
    group,
    get active() { return add.n + norm.n + flashes.length + rings.length + bolts.length + scorches.length + lightPulses.length + deb.length > 0; },
    /** Generic burst. o: {pos, count, color|colors, speed:[a,b], dir, spread(0..1), up, life:[ms,ms],
     *  size:[a,b], sizeEnd (multiplier), gravity, drag, shape:0 puff|1 spark|2 sparkle, blend:'add'|'normal', alpha} */
    burst(o) {
      const sys = o.blend === 'normal' ? norm : add;
      const cols = (o.colors || [o.color || '#ffffff']).map(rgb);
      const dir = o.dir ? o.dir.clone().normalize() : null, spread = o.spread ?? 1;
      for (let i = 0; i < (o.count ?? 20); i++) {
        let vx = rand(-1, 1), vy = rand(-1, 1), vz = rand(-1, 1);
        const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
        if (dir) { vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread; const m = Math.hypot(vx, vy, vz) || 1; vx /= m; vy /= m; vz /= m; }
        vy += o.up ?? 0;
        const sp = range(o.speed, 2), size = range(o.size, 0.08);
        sys.spawn({ x: o.pos.x + rand(-1, 1) * (o.jitter ?? 0), y: o.pos.y, z: o.pos.z + rand(-1, 1) * (o.jitter ?? 0),
          vx: vx * sp, vy: vy * sp, vz: vz * sp, rgb: pick(cols), life: range(o.life, 500), size, sizeEnd: size * (o.sizeEnd ?? 0.3),
          alpha: o.alpha ?? 1, gravity: o.gravity ?? 0, drag: o.drag ?? 1, shape: o.shape ?? 1 });
      }
    },
    /** Hot sparks (impact). */
    sparks(pos, o = {}) {
      fx.burst({ pos, count: o.count ?? 36, colors: o.colors || ['#fff4c0', '#ffc34d', '#ff8a1f'], speed: o.speed || [2.5, 6], dir: o.dir,
        spread: o.spread ?? 0.9, life: o.life || [220, 520], size: o.size || [0.05, 0.11], sizeEnd: 0.2, gravity: o.gravity ?? 9, drag: 2.2, shape: 1 });
    },
    /** Soft smoke puffs (dust, poofs). */
    smoke(pos, o = {}) {
      fx.burst({ pos, count: o.count ?? 14, colors: o.colors || [o.color || '#d9d2c5'], speed: o.speed || [0.4, 1.4], up: o.up ?? 0.6,
        spread: 1, life: o.life || [500, 900], size: o.size || [0.3, 0.55], sizeEnd: 2.1, gravity: -0.4, drag: 2.5, shape: 0,
        blend: 'normal', alpha: o.alpha ?? 0.55, jitter: o.jitter ?? 0.12 });
    },
    /** Magic sparkles (promotion, spells). */
    sparkles(pos, o = {}) {
      fx.burst({ pos, count: o.count ?? 30, colors: o.colors || ['#ffffff', '#ffe58a', '#9fe0ff'], speed: o.speed || [0.6, 2.2], up: o.up ?? 0.8,
        spread: 1, life: o.life || [500, 1000], size: o.size || [0.08, 0.16], sizeEnd: 0.1, gravity: o.gravity ?? -0.3, drag: 1.6, shape: 2, jitter: o.jitter ?? 0.15 });
    },
    /** Chunky dust in a piece's colour (crumble/shatter). */
    dust(pos, o = {}) {
      fx.burst({ pos, count: o.count ?? 40, colors: o.colors || [o.color || '#888888'], speed: o.speed || [1, 3.5], up: o.up ?? 1.2, spread: 1,
        life: o.life || [400, 900], size: o.size || [0.06, 0.13], sizeEnd: 0.6, gravity: 7, drag: 1.2, shape: 0, blend: 'normal', alpha: 1, jitter: 0.15 });
    },
    /** Additive billboard flash. */
    flash(pos, o = {}) {
      const m = new THREE.SpriteMaterial({ map: glowTexture(), color: o.color || '#fff2c8', blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
      const s = new THREE.Sprite(m); s.position.copy(pos); s.renderOrder = 6;
      group.add(s);
      flashes.push({ s, t: 0, ms: o.ms ?? 220, r: o.radius ?? 1.2 });
    },
    /** Expanding ground ring (shockwave). */
    ring(pos, o = {}) {
      const g = new THREE.RingGeometry(0.85, 1, 48); g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({ color: o.color || '#fff0c0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const r = new THREE.Mesh(g, m); r.position.set(pos.x, (pos.y || 0) + 0.02, pos.z); r.renderOrder = 4;
      group.add(r);
      rings.push({ r, t: 0, ms: o.ms ?? 380, R: o.radius ?? 1.1 });
    },
    /** Full-screen colour flash over the canvas (cheap DOM overlay). */
    screenFlash(color = '#ffffff', ms = 160, alpha = 0.5) {
      if (!overlayEl) return;
      overlayEl.style.transition = 'none'; overlayEl.style.background = color; overlayEl.style.opacity = String(alpha);
      requestAnimationFrame(() => { overlayEl.style.transition = `opacity ${Math.round(ms / fx.rate)}ms ease-out`; overlayEl.style.opacity = '0'; });
    },
    /** Rising fire burst (fireball / brazier puff). o: {scale, count, colors} */
    fire(pos, o = {}) {
      const sc = o.scale ?? 1;
      fx.burst({ pos, count: o.count ?? 40, colors: o.colors || ['#fff3b0', '#ffb43a', '#ff6a1a', '#e8361a'], speed: [0.4 * sc, 1.6 * sc], up: 1.2,
        spread: 1, life: [300, 700], size: [0.22 * sc, 0.42 * sc], sizeEnd: 0.15, gravity: -2.5, drag: 2, shape: 0, jitter: 0.12 * sc });
      fx.burst({ pos, count: (o.count ?? 40) / 3, colors: ['#fff6d0'], speed: [0.2, 0.8], up: 0.8, spread: 1, life: [150, 300],
        size: [0.3 * sc, 0.5 * sc], sizeEnd: 0.4, gravity: -1, drag: 2, shape: 0 });
    },
    /** Slow glowing embers drifting up. */
    embers(pos, o = {}) {
      fx.burst({ pos, count: o.count ?? 24, colors: o.colors || ['#ffcf6a', '#ff7a2a', '#ff4a1a'], speed: [0.2, 1.0], up: 1.4, spread: 1,
        life: [900, 1800], size: [0.035, 0.06], sizeEnd: 0.3, gravity: -0.6, drag: 0.8, shape: 1, jitter: o.radius ?? 0.3 });
    },
    /** Chunky debris pieces that bounce on the board. o: {count, colors, speed, up} */
    debris(pos, o = {}) {
      const cols = (o.colors || [o.color || '#8a8580']).map(c => new THREE.Color(c));
      for (let i = 0; i < (o.count ?? 14) && deb.length < DEB; i++) {
        const a = Math.random() * Math.PI * 2, sp = range(o.speed, rand(1.5, 3.5));
        deb.push({ p: new THREE.Vector3(pos.x, pos.y, pos.z), v: new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 3) + Math.random() * 2, Math.sin(a) * sp),
          ax: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), a: 0, av: rand(6, 16), s: rand(0.6, 1.4),
          life: 0, max: rand(900, 1500), c: pick(cols) });
      }
    },
    /** The full works: flash + fireball + sparks + smoke + debris + ring (+ optional scorch). */
    explosion(pos, o = {}) {
      const sc = o.scale ?? 1;
      fx.flash(pos, { color: o.flashColor || '#ffd28a', radius: 2.2 * sc, ms: 260 });
      fx.fire(pos, { scale: sc, count: 50 * sc });
      fx.sparks(pos, { count: 50 * sc, speed: [3, 8] });
      fx.ring({ x: pos.x, y: 0, z: pos.z }, { radius: 1.6 * sc, color: '#ffb35a' });
      fx.debris(pos, { count: 14 * sc, colors: o.debrisColors || ['#6f6a64', '#3d3a36', '#a39b8f'] });
      fx.smoke(pos, { count: 16 * sc, colors: ['#4a4440', '#6d6660', '#2c2826'], alpha: 0.6, size: [0.4 * sc, 0.7 * sc], life: [700, 1300] });
      if (o.scorch !== false) fx.scorch(pos, { radius: 0.7 * sc });
      if (o.boardFlash !== false) fx.boardFlash(o.flashColor || '#ff9a3a', 260, 0.35);
    },
    /** Jagged lightning between two points, flickering for ms. o: {color, width, branches, ms} */
    lightning(from, to, o = {}) {
      const mat = new THREE.MeshBasicMaterial({ color: o.color || '#bfe6ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.renderOrder = 7; mesh.frustumCulled = false;
      group.add(mesh);
      const b = { mesh, from: from.clone(), to: to.clone(), t: 0, ms: o.ms ?? 380, next: 0, w: o.width ?? 0.05, branches: o.branches ?? 2 };
      buildBolt(b); bolts.push(b);
      fx.flash(to, { color: o.color || '#bfe6ff', radius: 1.2, ms: 180 });
    },
    /** Tint the whole board (and the scene light) with a colour for a moment. */
    boardFlash(color = '#ff7a2a', ms = 300, strength = 0.4) {
      lightPulses.push({ t: 0, ms, c: new THREE.Color(color), s: strength });
      tintMat.color.set(color); tint.visible = true;
    },
    /** Dark scorch/crack decal on the board that fades out. o: {radius, ms} */
    scorch(pos, o = {}) {
      const m = new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, opacity: 0.9,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const r = o.radius ?? 0.6;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), m);
      d.rotation.y = Math.random() * 6.28; d.position.set(pos.x, 0.006, pos.z); d.renderOrder = 1;
      group.add(d); scorches.push({ d, t: 0, ms: o.ms ?? 2600 });
    },
    update(dtReal) {
      const dt = dtReal * fx.rate;
      if (add.n) add.update(dt); if (norm.n) norm.update(dt);
      // debris
      if (deb.length) {
        const s = dt / 1000;
        for (let i = deb.length - 1; i >= 0; i--) {
          const d = deb[i]; d.life += dt;
          if (d.life >= d.max) { deb.splice(i, 1); continue; }
          d.v.y -= 9.8 * s; d.p.addScaledVector(d.v, s); d.a += d.av * s;
          if (d.p.y < 0.03) { d.p.y = 0.03; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.av *= 0.6; }
        }
        deb.forEach((d, i) => {
          const k = d.life / d.max, sc = d.s * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
          _dm.compose(d.p, _dq.setFromAxisAngle(d.ax, d.a), _ds.set(sc, sc, sc));
          debris.setMatrixAt(i, _dm); debris.setColorAt(i, d.c);
        });
        debris.count = deb.length; debris.instanceMatrix.needsUpdate = true; debris.instanceColor.needsUpdate = true;
      } else if (debris.count) debris.count = 0;
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i]; b.t += dt;
        if (b.t >= b.ms) { group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bolts.splice(i, 1); continue; }
        if (b.t >= b.next) { buildBolt(b); b.next = b.t + 45; }
        b.mesh.material.opacity = (1 - b.t / b.ms) * (0.6 + Math.random() * 0.4);
      }
      for (let i = scorches.length - 1; i >= 0; i--) {
        const s = scorches[i]; s.t += dtReal; // scorches fade in real time
        if (s.t >= s.ms) { group.remove(s.d); s.d.geometry.dispose(); s.d.material.dispose(); scorches.splice(i, 1); continue; }
        const k = s.t / s.ms; s.d.material.opacity = 0.9 * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      }
      if (lightPulses.length) {
        let best = 0, col = null;
        for (let i = lightPulses.length - 1; i >= 0; i--) {
          const p = lightPulses[i]; p.t += dt;
          if (p.t >= p.ms) { lightPulses.splice(i, 1); continue; }
          const f = p.s * (1 - p.t / p.ms) ** 2; if (f > best) { best = f; col = p.c; }
        }
        tintMat.opacity = best * 0.5; tint.visible = best > 0.001;
        if (col) tintMat.color.copy(col);
        if (flashLight && lightBase) {
          flashLight.color.copy(lightBase.color); if (col) flashLight.color.lerp(col, Math.min(1, best * 1.5));
          flashLight.intensity = lightBase.intensity * (1 + best * 3);
        }
      } else if (tint.visible || (flashLight && lightBase && flashLight.intensity !== lightBase.intensity)) {
        tint.visible = false; if (flashLight && lightBase) { flashLight.color.copy(lightBase.color); flashLight.intensity = lightBase.intensity; }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]; f.t += dt; const k = f.t / f.ms;
        if (k >= 1) { group.remove(f.s); f.s.material.dispose(); flashes.splice(i, 1); continue; }
        const sc = f.r * (0.5 + ease.cubicOut(k)); f.s.scale.set(sc, sc, sc); f.s.material.opacity = 1 - k;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.t += dt; const k = r.t / r.ms;
        if (k >= 1) { group.remove(r.r); r.r.geometry.dispose(); r.r.material.dispose(); rings.splice(i, 1); continue; }
        const sc = 0.1 + r.R * ease.cubicOut(k); r.r.scale.set(sc, 1, sc); r.r.material.opacity = 1 - k;
      }
    },
    setViewport(heightPx, fovDeg) {
      const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
      add.uniforms.uScale.value = s; norm.uniforms.uScale.value = s;
    },
    clear() {
      add.clear(); norm.clear(); deb.length = 0; debris.count = 0; lightPulses.length = 0; tint.visible = false;
      if (flashLight && lightBase) { flashLight.color.copy(lightBase.color); flashLight.intensity = lightBase.intensity; }
      for (const b of bolts) { group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); } bolts.length = 0;
      for (const s of scorches) { group.remove(s.d); s.d.geometry.dispose(); s.d.material.dispose(); } scorches.length = 0;
      for (const f of flashes) { group.remove(f.s); f.s.material.dispose(); } flashes.length = 0;
      for (const r of rings) { group.remove(r.r); r.r.geometry.dispose(); r.r.material.dispose(); } rings.length = 0;
    },
    dispose() { fx.clear(); scene.remove(group); add.geom.dispose(); add.mat.dispose(); norm.geom.dispose(); norm.mat.dispose(); },
  };
  return fx;
}

// ---------------------------------------------------------------------------
// Default light rig (themes may supply board.lightRig(THREE, kit) returning a Group;
// the first DirectionalLight with castShadow gets the board's shadow setup).
// ---------------------------------------------------------------------------
/**
 * Studio environment scene for PMREM reflections: dim zenith (so a near-overhead camera
 * looking at a glossy board sees no glare blob), bright softboxes low around the sides
 * (so metal and gloss pieces get crisp highlights on their silhouettes).
 * Return it from board.environment as {envScene: kit.studioEnvironment({...})}.
 */
export function studioEnvironment({ top = '#20232b', horizon = '#4a4440', floor = '#0c0c0e', panels = 1.0, warm = '#ffe2b0', cool = '#cfe0ff' } = {}) {
  const scene = new THREE.Scene();
  const tex = canvasTexture(16, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(0.45, horizon); g.addColorStop(0.55, horizon); g.addColorStop(1, floor);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
  scene.add(dome);
  const panel = (color, intensity, w, h, az, el, dist = 12) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity * panels), side: THREE.DoubleSide }));
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    m.position.set(Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, Math.cos(a) * Math.cos(e) * dist);
    m.lookAt(0, 0, 0); scene.add(m);
  };
  panel(warm, 6, 9, 5, -40, 28);     // key softbox, front-left
  panel(cool, 3.5, 10, 4, 140, 22);  // cool rim from behind-right
  panel(warm, 2.5, 4, 8, 95, 15);    // side strip
  panel(cool, 2.0, 4, 8, -105, 12);  // side strip
  panel('#ffffff', 1.2, 5, 5, 0, 75); // small dim top fill (keeps overhead glare low)
  return scene;
}

export function defaultLightRig({ key = 2.2, fill = 0.55, warm = '#fff1dc' } = {}) {
  const g = new THREE.Group(); g.name = 'lights';
  const hemi = new THREE.HemisphereLight('#f4f0ff', '#3a3028', fill);
  const sun = new THREE.DirectionalLight(warm, key);
  sun.position.set(-3.2, 11, 4.5); sun.castShadow = true;
  g.add(hemi, sun, sun.target);
  return g;
}
