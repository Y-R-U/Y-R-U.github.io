// GAMBIT theme kit — the shared toolkit for sculptors and animators.
// Owner: board agent. Themes receive this module as `kit`.
// Read js/themes/MODEL_GUIDE.md first. Everything here is plain functions; nothing
// needs `new` except Timeline (the board makes those for you, see ctx.tween).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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
  // Halloween flagstones (was halloween/board.js LOOK): limestone vs violet-grey slate, mossy grout
  graveyard: {
    light: '#d8d1bf', lightShade: '#bdb39c', lichen: ['#cfc77e', '#d9a95c', '#b9c08a'], lightLabel: '#4d465c',
    dark: '#6a7182', darkShade: '#565b6c', moss: ['#4f6a3a', '#5f7c40', '#3e5a34'], darkLabel: '#ece3c9',
    grout: '#2b3226', glow: '#7dff6a',
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
  if (o.vertexFX) addVertexFX(m, o.vertexFX);   // kit.vertexMaterial (per-vertex glow/metal)
  if (o.flicker) addFlicker(m, o.flicker);      // shared ambient clock (idle glow flicker)
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
// Ambient animation (board-2): ONE shared time uniform that glow materials opt into, so
// candles flicker and light-lines pulse without breaking instancing. The board advances
// `ambient.time` and renders at a capped rate (only while the `ambientAnim` option is on, the
// tab is visible and something in the scene uses it). Each object gets its own phase (from its
// instance/model origin), so a row of identical lanterns doesn't flicker in lockstep.
//   kit.material({..., emissive, flicker: 'candle' | 'pulse' | {mode, amount, speed, spread}})
//   kit.addFlicker(existingMaterial, opts)          // same, for a material you built yourself
// spread > 0 also varies the phase per vertex position (many flames merged into one mesh).
// ---------------------------------------------------------------------------
export const ambient = { time: { value: 0 } };
const FLICKER_PRESETS = {
  candle: { mode: 'candle', amount: 0.32, speed: 1, spread: 0 },
  pulse: { mode: 'pulse', amount: 0.35, speed: 1, spread: 0 },
  slow: { mode: 'pulse', amount: 0.22, speed: 0.45, spread: 0 },
};
function flickerOpts(f) {
  const base = FLICKER_PRESETS[typeof f === 'string' ? f : f?.mode || 'candle'] || FLICKER_PRESETS.candle;
  return typeof f === 'object' ? { ...base, ...f } : { ...base };
}
const AMB_VERT_HEAD = 'uniform vec4 uAmbF;\nvarying vec3 vAmbO;\nvarying vec3 vAmbW;';
const AMB_VERT_BODY = `
  {
    vec4 ambP = vec4(transformed, 1.0); vec3 ambO = vec3(0.0);
    #ifdef USE_INSTANCING
      ambP = instanceMatrix * ambP; ambO = instanceMatrix[3].xyz;
    #endif
    vAmbW = (modelMatrix * ambP).xyz; vAmbO = (modelMatrix * vec4(ambO, 1.0)).xyz;
  }`;
const AMB_FRAG_HEAD = `uniform float uAmbT; uniform vec4 uAmbF; varying vec3 vAmbO; varying vec3 vAmbW;
float ambK() {
  float ph = fract(sin(dot(floor(vAmbO * 8.0 + 0.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2832
           + uAmbF.w * dot(vAmbW, vec3(7.1, 3.3, 5.9));
  float t = uAmbT * uAmbF.z;
  float w = uAmbF.x < 0.5
    ? 0.55 * sin(t * 6.1 + ph) + 0.3 * sin(t * 13.7 + ph * 1.7 + 1.3) + 0.15 * sin(t * 29.3 + ph * 2.9 + 2.1)
    : sin(t * 2.4 + ph);
  return max(0.0, 1.0 + uAmbF.y * w);
}`;
function ambientChunks(sh, f) {
  sh.uniforms.uAmbT = ambient.time;
  sh.uniforms.uAmbF = { value: new THREE.Vector4(f.mode === 'pulse' ? 1 : 0, f.amount, f.speed, f.spread) };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + AMB_VERT_HEAD)
    .replace('#include <project_vertex>', '#include <project_vertex>' + AMB_VERT_BODY);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + AMB_FRAG_HEAD);
}
function chainCompile(m, tag, fn) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { if (hasPrev) prev.call(m, sh, r); fn(sh, r); };
  m.customProgramCacheKey = () => (hasPrev && prevKey ? prevKey.call(m) : '') + tag;
  return m;
}
/** Make a material's emissive (emissive colour / emissiveMap) flicker or pulse with the shared clock. */
export function addFlicker(m, opts = 'candle') {
  if (m.userData.ambient) return m;
  const f = flickerOpts(opts);
  m.userData.ambient = true;
  return chainCompile(m, '_amb', sh => {
    ambientChunks(sh, f);
    // after the emissive colour/map, before the kit rim glow is added on top
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= ambK();');
  });
}

// ---------------------------------------------------------------------------
// Per-vertex metal / glow (board-2, lifted from fantasy/common.js + scifi/common.js): ONE material
// per side, everything else is vertex data, so a whole piece is 1 draw call per kind.
//   color = albedo,  uv.x = glow amount (emissive = colour * glow * glow-gain),
//   uv.y  = metal amount (metalness = uv.y, roughness lerps toward metalRough).
// Gold trim blends into ivory across one triangle instead of stair-stepping along a material
// split. Use kit.vertexFinish(g, rgb, {glow, metal}) / kit.paintFinish(g, fn) to fill the uv channel
// (Three's primitives ship real UVs that would otherwise read as glow/metal). Options:
//   glow       emissive gain for uv.x (default 2.0)
//   dimGlow    0..1, darken the lit albedo of glowing parts so neon stays saturated (default 0.8)
//   sheenMask  true: the rim's overhead "top sheen" only lights bright, non-glowing surfaces
//              (wells and grooves stay dark from above)  (default true)
//   flicker    'candle' | 'pulse' | {...}: animate the glow channel with the shared ambient clock
// ---------------------------------------------------------------------------
/**
 * kit.vertexMaterial({roughness, metalRough, rim, glow, dimGlow, sheenMask, flicker, envMapIntensity})
 * or kit.vertexMaterial(color) for the palette's side defaults. Cached like kit.material.
 */
export function vertexMaterial(o = {}) {
  if (typeof o === 'string') o = { roughness: palette[o]?.roughness ?? 0.35, rim: palette[o]?.rim };
  const { roughness = 0.35, metalRough = 0.24, rim, glow = 2.0, dimGlow = 0.8, sheenMask = true, flicker = null, envMapIntensity } = o;
  return material({ color: '#ffffff', roughness, metalness: 1, rim, envMapIntensity,
    vertexFX: { metalRough, glow, dimGlow, sheenMask, flicker: flicker ? flickerOpts(flicker) : null } });
}
function addVertexFX(m, v) {
  if (v.flicker) m.userData.ambient = true;
  return chainCompile(m, `_vfx${v.metalRough}_${v.glow}_${v.dimGlow}_${+v.sheenMask}_${v.flicker ? 'a' : ''}`, sh => {
    if (v.flicker) ambientChunks(sh, v.flicker);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFX = uv;');
    let fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFX;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - ${v.dimGlow.toFixed(3)} * clamp(vFX.x, 0.0, 1.0);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${v.metalRough.toFixed(3)}, vFX.y);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vFX.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vFX.x * ${v.glow.toFixed(3)}${v.flicker ? ' * ambK()' : ''};`);
    if (v.sheenMask) fs = fs.replace('totalEmissiveRadiance += uTopColor *', 'totalEmissiveRadiance += clamp(dot(vColor.rgb, vec3(0.3, 0.59, 0.11)) * 12.0, 0.0, 1.0) * (1.0 - clamp(vFX.x, 0.0, 1.0)) * uTopColor *');
    sh.fragmentShader = fs;
  });
}
/** Flat finish for a vertexMaterial part: sets color (linear [r,g,b] or hex) + uv (glow, metal). */
export function vertexFinish(g, col, { glow = 0, metal = 0 } = {}) {
  const c3 = toRGB(col), n = g.attributes.position.count;
  const c = new Float32Array(n * 3), u = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { c[i * 3] = c3[0]; c[i * 3 + 1] = c3[1]; c[i * 3 + 2] = c3[2]; u[i * 2] = glow; u[i * 2 + 1] = metal; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  return g;
}
/** Re-finish per vertex: fn(x,y,z) -> [r,g,b] | {c?, glow?, metal?} | null (keep). */
export function paintFinish(g, fn) {
  if (!g.attributes.color || !g.attributes.uv) vertexFinish(g, [1, 1, 1]);
  const p = g.attributes.position, c = g.attributes.color, u = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (!v) continue;
    const col = Array.isArray(v) ? v : v.c;
    if (col) { const k = toRGB(col); c.setXYZ(i, k[0], k[1], k[2]); }
    if (!Array.isArray(v)) { if (v.glow != null) u.setX(i, v.glow); if (v.metal != null) u.setY(i, v.metal); }
  }
  c.needsUpdate = true; u.needsUpdate = true;
  return g;
}
const rgbCache = new Map();
/** sRGB hex (or THREE.Color, or linear [r,g,b]) -> linear [r,g,b] (what vertex colours want). */
export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  if (hex?.isColor) return [hex.r, hex.g, hex.b];
  if (!rgbCache.has(hex)) { const c = new THREE.Color(hex); rgbCache.set(hex, [c.r, c.g, c.b]); }
  return rgbCache.get(hex);
}
const toRGB = rgb;

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
// More geometry helpers (board-2, adopted from the sculptors' local copies; their copies may
// stay, these are the shared versions for new work).
// ---------------------------------------------------------------------------
function hash3(x, y, z) { let h = 2166136261; for (const v of [x, y, z]) { h ^= Math.floor(v * 1000) | 0; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; }
/** Smooth 3D value noise in [0,1] (deterministic). Good for mottling, moss, bark. */
export function noise3(x, y = 0, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = t => t * t * (3 - 2 * t), xf = f(x - xi), yf = f(y - yi), zf = f(z - zi);
  let s = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++)
    s += (a ? xf : 1 - xf) * (b ? yf : 1 - yf) * (c ? zf : 1 - zf) * hash3(xi + a, yi + b, zi + c);
  return s;
}
/** Set vertex colours absolutely (paint() multiplies): fn(x,y,z) -> [r,g,b] | hex | null (keep). */
export function colorize(g, fn) {
  ensureColor(g);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (v != null) { const k = rgb(v); c.setXYZ(i, k[0], k[1], k[2]); }
  }
  c.needsUpdate = true;
  return g;
}
/**
 * Move vertices: fn(x,y,z) -> [x,y,z]; recomputes normals. Welds a non-indexed geometry first
 * (kit.merge / latheSegment output) unless {weld:false}, so the result shades smooth, not faceted.
 */
export function deform(g, fn, { weld = true } = {}) {
  if (weld && !g.index) { const w = mergeVertices(g, 1e-5); if (w !== g) { g.dispose(); g = w; } }
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, v[0], v[1], v[2]); }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
/**
 * Loft an elliptical tube along a spine in the y-z plane (mirror-symmetric in x): necks, tails,
 * tentacles, horse skulls. spine(u) -> [y, z] for u in 0..1; sec(u, phi) -> [a, b] = half-width
 * along x and half-height along the in-plane normal (phi 0 = +x, PI/2 = the "top" side).
 * Ends get a fan cap. Run the spine toward -z so the normal points up. color(u, phi) -> rgb.
 * The result has g.userData.frame(u) -> {y, z, ny, nz} for attaching parts along the spine.
 */
export function loft(spine, sec, { rings = 32, segs = 24, color } = {}) {
  const pos = [], cols = [], idx = [];
  const frame = u => {
    const [y, z] = spine(u), e = 1e-3, a = spine(Math.max(0, u - e)), b = spine(Math.min(1, u + e));
    let ty = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(ty, tz) || 1; ty /= L; tz /= L;
    return { y, z, ny: -tz, nz: ty };
  };
  const C = (u, ph) => (color ? rgb(color(u, ph)) : [1, 1, 1]);
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, f = frame(u);
    for (let j = 0; j < segs; j++) {
      const ph = (j / segs) * Math.PI * 2, [a, b] = sec(u, ph), o = b * Math.sin(ph);
      pos.push(a * Math.cos(ph), f.y + f.ny * o, f.z + f.nz * o);
      cols.push(...C(u, ph));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = (i + 1) * segs + j, c = i * segs + (j + 1) % segs, d = (i + 1) * segs + (j + 1) % segs;
    idx.push(a, b, c, c, b, d);
  }
  for (const [ring, u, flip] of [[0, 0, false], [rings, 1, true]]) {
    const f = frame(u), ci = pos.length / 3;
    pos.push(0, f.y, f.z); cols.push(...C(u, Math.PI / 2));
    for (let j = 0; j < segs; j++) {
      const a = ring * segs + j, b = ring * segs + (j + 1) % segs;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.frame = frame;
  return g;
}
/**
 * A flame / wisp tongue authored along +y from the origin, tip curling toward -z. Vertex colours
 * ramp base -> mid -> tip through colors (3 hex or rgb). Merge several (rotated) for a mane or a fire.
 */
export function flameTongue({ len = 0.16, rad = 0.035, curl = 0.35, flat = 0.6, wob = 0, segs = 7, rings = 9, colors = ['#d4440a', '#f47a10', '#ffc24a'] } = {}) {
  const p = profile().pt(0, -rad * 0.4);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const r = t < 0.22 ? rad * Math.sin((t / 0.22) * Math.PI / 2 + 0.25) : rad * Math.pow(1 - (t - 0.22) / 0.78, 1.25);
    p.pt(Math.max(i === rings ? 0 : 0.002, r), t * len);
  }
  const g = deform(lathe(p.points(), { segments: segs }), (x, y, z) => {
    const t = clamp(y / len, 0, 1);
    return [x + Math.sin(t * Math.PI * 2.2 + wob) * rad * 0.7 * t, y, z * flat - curl * len * t * t * t * 1.4 + Math.sin(t * Math.PI) * rad * 0.4];
  });
  const [f0, f1, f2] = colors.map(rgb), mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return colorize(g, (x, y) => { const t = clamp(y / len, 0, 1); return t < 0.5 ? mix3(f0, f1, t / 0.5) : mix3(f1, f2, (t - 0.5) / 0.5); });
}
/**
 * Longest-edge bisection until every edge is shorter than L, so a flat decal can be bent onto a
 * curved surface (wrapDecal) without its middle sinking in. Returns a new position-only geometry.
 */
export function refine(g, L) {
  const src = (g.index ? g.toNonIndexed() : g).attributes.position, out = [];
  const V = i => [src.getX(i), src.getY(i), src.getZ(i)];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const split = (a, b, c, depth) => {
    const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), m = Math.max(ab, bc, ca);
    if (m < L * L || depth > 8) { out.push(...a, ...b, ...c); return; }
    if (m === ab) { const p = mid(a, b); split(a, p, c, depth + 1); split(p, b, c, depth + 1); }
    else if (m === bc) { const p = mid(b, c); split(a, b, p, depth + 1); split(a, p, c, depth + 1); }
    else { const p = mid(c, a); split(a, b, p, depth + 1); split(p, b, c, depth + 1); }
  };
  for (let i = 0; i < src.count; i += 3) split(V(i), V(i + 1), V(i + 2), 0);
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return r;
}
/**
 * Bend a thin extruded decal (local u = x right, v = y up, depth d along z, front cap +z) onto a
 * surface of revolution r = R(theta, y), centred at angle theta (lathe convention x = r sin,
 * z = r cos). lift = how proud the front sits (the back is buried). refine() it first.
 */
export function wrapDecal(g, { theta = 0, y0 = 0, R, lift = 0.003, d }) {
  return deform(g, (u, v, zl) => {
    const y = y0 + v;
    let a = theta + u / R(theta, y);
    a = theta + u / R(a, y);
    const r = R(a, y) + lift - (d / 2 - zl) * 1.2;
    return [r * Math.sin(a), y, r * Math.cos(a)];
  }, { weld: false });
}
/**
 * Hard-surface lathe (from scifi/common.js): crisp creases, chamfers, grooves, faceted or partial.
 * pts = [[r, y, finish, smooth?], ...]; finish = {c: hex|rgb, glow?, metal?} or a key resolved by
 * opts.finish(key) (default white). The finish colours the segment ENDING at that point. Creases stay
 * sharp unless the point is marked smooth. Walk the outer surface bottom -> top (closed sections
 * counter-clockwise, r right / y up) and normals face out.
 * opts: seg, phiStart, phiLength, flat (faceted: octagons...), closed, caps, finish.
 * Returns non-indexed geometry with position, normal, color, uv (uv = glow, metal: vertexMaterial).
 */
export function hsLathe(pts, { seg = 40, phiStart = 0, phiLength = Math.PI * 2, flat = false, closed = false, caps = false, finish } = {}) {
  const fin = k => {
    const f = (typeof k === 'string' || k == null) ? (finish ? finish(k) : { c: [1, 1, 1] }) : k;
    return { c: rgb(f.c ?? [1, 1, 1]), glow: f.glow || 0, metal: f.metal || 0 };
  };
  const P = pts.map(p => ({ r: p[0], y: p[1], f: fin(p[2]), s: !!p[3] }));
  const n = P.length, nSeg = closed ? n : n - 1, segN = [];
  const cf = flat ? Math.cos(phiLength / seg / 2) : 1;
  for (let i = 0; i < nSeg; i++) {
    const a = P[i], b = P[(i + 1) % n], dr = (b.r - a.r) * cf, dy = b.y - a.y, L = Math.hypot(dr, dy) || 1;
    segN.push([dy / L, -dr / L]);
  }
  const nrmAt = (i, j) => {
    if (!P[j].s) return segN[i];
    const other = j === i ? i - 1 : i + 1, o = closed ? segN[(other + nSeg) % nSeg] : segN[other];
    if (!o) return segN[i];
    const x = segN[i][0] + o[0], y = segN[i][1] + o[1], L = Math.hypot(x, y) || 1;
    return [x / L, y / L];
  };
  const pos = [], nor = [], col = [], uv = [];
  const push = (r, y, phi, nr, ny, f, phiN = phi) => {
    pos.push(r * Math.sin(phi), y, r * Math.cos(phi)); nor.push(nr * Math.sin(phiN), ny, nr * Math.cos(phiN));
    col.push(f.c[0], f.c[1], f.c[2]); uv.push(f.glow, f.metal);
  };
  for (let i = 0; i < nSeg; i++) {
    const j0 = i, j1 = (i + 1) % n, A = P[j0], B = P[j1];
    if (Math.hypot(B.r - A.r, B.y - A.y) < 1e-7) continue;
    const nA = nrmAt(i, j0), nB = nrmAt(i, j1), f = B.f;
    for (let k = 0; k < seg; k++) {
      const p0 = phiStart + (k / seg) * phiLength, p1 = phiStart + ((k + 1) / seg) * phiLength, pc = (p0 + p1) / 2;
      const q0 = flat ? pc : p0, q1 = flat ? pc : p1;
      const tri = v => { for (const [r, y, ph, nn, phN] of v) push(r, y, ph, nn[0], nn[1], f, phN); };
      tri([[A.r, A.y, p0, nA, q0], [B.r, B.y, p1, nB, q1], [B.r, B.y, p0, nB, q0]]);
      tri([[A.r, A.y, p0, nA, q0], [A.r, A.y, p1, nA, q1], [B.r, B.y, p1, nB, q1]]);
    }
  }
  if (caps && phiLength < Math.PI * 2 - 1e-6) {
    const tris = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p.r, p.y)), []);
    for (const [phi, sgn] of [[phiStart, -1], [phiStart + phiLength, 1]]) {
      const nx = Math.cos(phi) * sgn, nz = -Math.sin(phi) * sgn;
      for (const t of tris) for (const j of t) {
        const p = P[j], f = P[0].f;
        pos.push(p.r * Math.sin(phi), p.y, p.r * Math.cos(phi)); nor.push(nx, 0, nz);
        col.push(f.c[0], f.c[1], f.c[2]); uv.push(f.glow, f.metal);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return fixWinding(g);
}
/** Make every triangle's winding agree with its vertex normals (non-indexed geometry). */
export function fixWinding(g) {
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position.array, nrm = g.attributes.normal.array, attrs = Object.values(g.attributes);
  for (let t = 0; t < p.length / 9; t++) {
    const o = t * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const d = cx * (nrm[o] + nrm[o + 3] + nrm[o + 6]) + cy * (nrm[o + 1] + nrm[o + 4] + nrm[o + 7]) + cz * (nrm[o + 2] + nrm[o + 5] + nrm[o + 8]);
    if (d < 0) for (const a of attrs) {
      const s = a.itemSize, arr = a.array, i1 = (t * 3 + 1) * s, i2 = (t * 3 + 2) * s;
      for (let k = 0; k < s; k++) { const tmp = arr[i1 + k]; arr[i1 + k] = arr[i2 + k]; arr[i2 + k] = tmp; }
    }
  }
  return g;
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
  // battle-2: a dissolve that keeps the material (flipping `transparent` would compile a new
  // shader variant mid-animation): the piece thins, stretches and flickers out.
  const s0 = obj.scale.clone(), y0 = obj.position.y;
  return ctx.tween(ms, (e, k) => {
    const w = Math.max(0.02, 1 - e);
    obj.scale.set(s0.x * w, s0.y * (1 + 0.35 * e), s0.z * w);
    obj.position.y = y0 + 0.15 * e;
    obj.visible = k < 0.55 || ((k * 40) | 0) % 2 === 0;
  }, ease.quadIn).then(() => { obj.visible = false; });
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
// battle-2: every mesh FX (flash sprites, rings, bolts, scorches, the fight spotlight) is POOLED.
// The pools are filled when createFX runs and parked off-frustum (kit.parkFX), so the board's
// compile on theme load builds every program they need; a battle only re-uses them (no new
// materials, geometries or shader programs mid-battle, nothing for the GC but tiny vectors).
// Lightning writes into a preallocated buffer: a dark under-ribbon (normal blend, wide) plus a
// bright additive core, so bolts read on cream squares too.
const BOLT_MAX = 3000;                                   // vertices per layer
const _bA = new THREE.Vector3(), _bB = new THREE.Vector3(), _bD = new THREE.Vector3(), _bP = new THREE.Vector3(), _bQ = new THREE.Vector3();
function buildBolt(b) {
  const P = b.pos, half = BOLT_MAX * 3;
  let nd = 0, nb = 0;                                    // vertex counts (dark, bright)
  const put = (layer, v) => {
    if (layer) { if (nb >= BOLT_MAX) return; P[half + nb * 3] = v.x; P[half + nb * 3 + 1] = v.y; P[half + nb * 3 + 2] = v.z; nb++; }
    else { if (nd >= BOLT_MAX) return; P[nd * 3] = v.x; P[nd * 3 + 1] = v.y; P[nd * 3 + 2] = v.z; nd++; }
  };
  const quad = (a, c, w) => {
    _bD.subVectors(c, a).normalize();
    _bP.crossVectors(_bD, UP); if (_bP.lengthSq() < 1e-6) _bP.set(1, 0, 0); _bP.normalize();   // horizontal side: reads from Top
    _bQ.crossVectors(_bD, _bP).normalize();                                                   // the crossed ribbon: reads from the side
    for (const off of [_bP, _bQ]) for (let layer = 0; layer < 2; layer++) {
      if (!layer && !b.dark) continue;
      const ww = layer ? w : w * 2.6;
      if ((layer ? nb : nd) + 6 > BOLT_MAX) continue;
      const a1 = _bA.copy(a).addScaledVector(off, -ww), a2 = a.clone().addScaledVector(off, ww);
      const c1 = _bB.copy(c).addScaledVector(off, -ww), c2 = c.clone().addScaledVector(off, ww);
      put(layer, a1); put(layer, a2); put(layer, c2); put(layer, a1); put(layer, c2); put(layer, c1);
    }
  };
  const path = (from, to, n, jit, w, depth) => {
    let prev = from.clone();
    for (let i = 1; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (i < n) p.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1) * 0.6, rand(-1, 1)).multiplyScalar(jit));
      quad(prev, p, w * (1 - i / (n * 1.6)));
      if (depth < b.branches && Math.random() < b.branchP) {
        const L = from.distanceTo(to);
        const end = p.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.8, 0.2), rand(-1, 1)).multiplyScalar(L * 0.4));
        if (end.y < 0.02) end.y = 0.02;                   // branches crawl over the board
        path(p, end, 5, jit * 0.6, w * 0.55, depth + 1);
      }
      prev = p;
    }
  };
  const L = b.from.distanceTo(b.to);
  path(b.from, b.to, Math.max(7, Math.round(L * 8)), L * 0.08, b.w, 0);
  const g = b.mesh.geometry;
  g.clearGroups(); g.addGroup(0, nd, 0); g.addGroup(BOLT_MAX, nb, 1);
  const attr = g.attributes.position; attr.needsUpdate = true;
}
let _glowTex = null;
function glowTexture() {
  return _glowTex || (_glowTex = canvasTexture(64, 64, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  }));
}
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
/** battle-2: fight spotlight — black, clear in a small centre disc, dark everywhere else. */
const SPOT_IN = 0.07;                                    // clear radius as a fraction of the plane half-size
let _spotTex = null;
function spotTexture() {
  return _spotTex || (_spotTex = canvasTexture(256, 256, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(SPOT_IN, 'rgba(0,0,0,0.5)');
    g.addColorStop(SPOT_IN * 3.2, 'rgba(0,0,0,0.92)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  }));
}
// ---------------------------------------------------------------------------
// battle-1: FX shader warm-up. createFX runs every hook registered with
// addFxWarmup(fn(group, scene)) after filling its own pools. The board calls
// renderer.compile(scene) right after createFX on theme load, so every program is built then.
// Parked objects sit far outside the camera frustum (frustumCulled) or are InstancedMeshes
// with count 0, so they cost no draw calls.
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
function warmFX(group, scene) {
  for (const fn of fxWarmups) { try { fn(group, scene); } catch (e) { console.error('[kit] fx warmup failed', e); } }
}
const ADD_MAT = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
let _fxGeo = null;
const fxGeo = () => _fxGeo || (_fxGeo = {
  ringThin: new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2),
  ringThick: new THREE.RingGeometry(0.62, 1, 64).rotateX(-Math.PI / 2),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
});
/** A tiny object pool: get() reuses a parked object or makes one; put() parks it again. */
function fxPool(group, make, n) {
  const free = [];
  const p = {
    get() { const o = free.pop() || (() => { const m = make(); m.userData.fxPooled = true; group.add(m); return m; })(); o.visible = true; return o; },
    put(o) { parkFX(o); free.push(o); },
  };
  for (let i = 0; i < n; i++) { const o = make(); o.userData.fxPooled = true; group.add(o); p.put(o); }
  return p;
}

export function createFX(scene, { overlayEl = null, flashLight = null } = {}) {
  const add = new ParticleSystem(3200, THREE.AdditiveBlending);
  const norm = new ParticleSystem(2000, THREE.NormalBlending);
  const group = new THREE.Group(); group.name = 'fx';
  group.add(norm.points, add.points);
  scene.add(group);
  const G = fxGeo();
  const flashes = [], rings = [], bolts = [], scorches = [], lightPulses = [];
  // pools (battle-2)
  const flashPool = fxPool(group, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), ...ADD_MAT, depthTest: false })); s.renderOrder = 6; return s; }, 10);
  const ringPool = fxPool(group, () => { const r = new THREE.Mesh(G.ringThin, new THREE.MeshBasicMaterial({ ...ADD_MAT, side: THREE.DoubleSide })); r.renderOrder = 4; return r; }, 10);
  const boltPool = fxPool(group, () => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(BOLT_MAX * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.addGroup(0, 0, 0); g.addGroup(BOLT_MAX, 0, 1);
    const dark = new THREE.MeshBasicMaterial({ color: '#05060c', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const bright = new THREE.MeshBasicMaterial({ ...ADD_MAT, side: THREE.DoubleSide });
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.01);   // culled while parked; frustumCulled=false while live
    const m = new THREE.Mesh(g, [dark, bright]); m.renderOrder = 7; m.userData.pos = pos;
    return m;
  }, 4);
  const scorchPool = fxPool(group, () => {
    const d = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, opacity: 0.9,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    d.renderOrder = 1; return d;
  }, 6);
  // debris: one InstancedMesh of chunky bevelled bits, simple physics
  const DEB = 180;
  const debMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
  const debris = new THREE.InstancedMesh(bevelBox(0.09, 0.07, 0.08, 0.015, 1), debMat, DEB);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEB * 3).fill(1), 3);
  debris.count = 0; debris.frustumCulled = false; debris.castShadow = true; group.add(debris);
  const deb = []; // {p, v, r(axis), a, av, s, life, max, rgb}
  const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _ds = new THREE.Vector3();
  // board-wide tint plane for coloured flashes (additive, under the pieces)
  const tintMat = new THREE.MeshBasicMaterial({ color: '#ffffff', ...ADD_MAT, opacity: 0 });
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), tintMat);
  tint.position.y = 0.012; tint.renderOrder = 3; parkFX(tint); group.add(tint);
  // fight spotlight (battle-2): dims the board around the fight so bright FX read on cream squares
  const spotMat = new THREE.MeshBasicMaterial({ map: spotTexture(), transparent: true, depthWrite: false, opacity: 0 });
  const spot = new THREE.Mesh(G.plane, spotMat); spot.renderOrder = 2; parkFX(spot); group.add(spot);
  const spotS = { cur: 0, target: 0, rate: 8, p: new THREE.Vector3(), r: 1.6 };
  warmFX(group, scene);   // battle-1
  const lightBase = flashLight ? { color: flashLight.color.clone(), intensity: flashLight.intensity } : null;
  const tmpC = new THREE.Color();
  const rgb = c => { tmpC.set(c); return [tmpC.r, tmpC.g, tmpC.b]; };
  const range = (v, d) => (Array.isArray(v) ? rand(v[0], v[1]) : v ?? d);
  const endFlash = f => { flashPool.put(f.s); };
  const endRing = r => { ringPool.put(r.r); };
  const endBolt = b => { b.mesh.frustumCulled = true; boltPool.put(b.mesh); };
  const endScorch = s => { scorchPool.put(s.d); };

  const fx = {
    rate: 1,
    group,
    get active() { return add.n + norm.n + flashes.length + rings.length + bolts.length + scorches.length + lightPulses.length + deb.length > 0 || spotS.cur > 0.001 || spotS.target > 0; },
    /** Generic burst. o: {pos, count, color|colors, speed:[a,b], dir, spread(0..1), up, life:[ms,ms],
     *  size:[a,b], sizeEnd (multiplier), gravity, drag, shape:0 puff|1 spark|2 sparkle, blend:'add'|'normal', alpha,
     *  jitter, flat (0..1: squash vertical velocity, for ground-hugging dust)} */
    burst(o) {
      const sys = o.blend === 'normal' ? norm : add;
      const cols = (o.colors || [o.color || '#ffffff']).map(rgb);
      const dir = o.dir ? o.dir.clone().normalize() : null, spread = o.spread ?? 1, flat = o.flat ?? 0;
      for (let i = 0; i < (o.count ?? 20); i++) {
        let vx = rand(-1, 1), vy = rand(-1, 1), vz = rand(-1, 1);
        const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
        if (dir) { vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread; const m = Math.hypot(vx, vy, vz) || 1; vx /= m; vy /= m; vz /= m; }
        if (flat) { vy *= 1 - flat; const m = Math.hypot(vx, vz) || 1, t = Math.hypot(vx, vy, vz) || 1; vx *= t / m; vz *= t / m; }
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
        spread: o.spread ?? 0.9, life: o.life || [220, 520], size: o.size || [0.05, 0.11], sizeEnd: 0.2, gravity: o.gravity ?? 9, drag: 2.2, shape: 1, up: o.up });
    },
    /** Soft smoke puffs (dust, poofs). */
    smoke(pos, o = {}) {
      fx.burst({ pos, count: o.count ?? 14, colors: o.colors || [o.color || '#d9d2c5'], speed: o.speed || [0.4, 1.4], up: o.up ?? 0.6,
        spread: 1, life: o.life || [500, 900], size: o.size || [0.3, 0.55], sizeEnd: o.sizeEnd ?? 2.1, gravity: -0.4, drag: 2.5, shape: 0,
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
      const s = flashPool.get(); s.material.color.set(o.color || '#fff2c8'); s.material.opacity = 1;
      s.position.copy(pos); s.scale.setScalar(0.01);
      flashes.push({ s, t: 0, ms: o.ms ?? 220, r: o.radius ?? 1.2 });
    },
    /** Expanding ground ring (shockwave). o: {color, radius, ms, thick, dark (normal-blended dark ring), alpha, y} */
    ring(pos, o = {}) {
      const r = ringPool.get();
      r.geometry = o.thick ? G.ringThick : G.ringThin;
      r.material.color.set(o.color || (o.dark ? '#000000' : '#fff0c0'));
      r.material.blending = o.dark ? THREE.NormalBlending : THREE.AdditiveBlending;
      r.renderOrder = o.dark ? 3 : 4;
      r.position.set(pos.x, (o.y ?? pos.y ?? 0) + (o.dark ? 0.016 : 0.02), pos.z); r.scale.set(0.01, 1, 0.01);
      rings.push({ r, t: 0, ms: o.ms ?? 380, R: o.radius ?? 1.1, a: o.alpha ?? (o.dark ? 0.5 : 1) });
    },
    /** battle-2: a big shockwave across several squares: dark outer ring (reads on cream), bright
     *  thick ring, a fast thin ring and ground dust blown outward. o: {radius, color, ms, dust, dustColors} */
    shockwave(pos, o = {}) {
      const R = o.radius ?? 2.6, ms = o.ms ?? 560, p = { x: pos.x, y: 0, z: pos.z };
      fx.ring(p, { radius: R * 1.06, dark: true, thick: true, ms, alpha: o.darkAlpha ?? 0.42 });
      fx.ring(p, { radius: R, color: o.color || '#fff0c0', thick: true, ms, alpha: o.alpha ?? 0.7 });
      fx.ring(p, { radius: R * 1.45, color: o.color2 || '#ffffff', ms: ms * 0.75, alpha: 0.8 });
      if (o.dust !== false) fx.burst({ pos: new THREE.Vector3(pos.x, 0.06, pos.z), count: o.dustCount ?? 46, colors: o.dustColors || ['#5a524a', '#7a7066', '#3a3430'],
        speed: [R * 1.6, R * 2.6], flat: 0.92, up: 0.25, spread: 1, life: [500, 850], size: [0.22, 0.4], sizeEnd: 2.2, gravity: -0.2, drag: 3.2, shape: 0, blend: 'normal', alpha: 0.55, jitter: 0.2 });
    },
    /** Full-screen colour flash over the canvas (cheap DOM overlay). color may be any CSS background. */
    screenFlash(color = '#ffffff', ms = 160, alpha = 0.5) {
      if (!overlayEl) return;
      overlayEl.style.transition = 'none'; overlayEl.style.background = color; overlayEl.style.opacity = String(alpha);
      requestAnimationFrame(() => { overlayEl.style.transition = `opacity ${Math.round(ms / Math.max(0.2, fx.rate))}ms ease-out`; overlayEl.style.opacity = '0'; });
    },
    /** battle-2: coloured vignette pulse (screen edges) — the board-wide "impact" colour. */
    vignette(color = '#ff5a1a', ms = 420, alpha = 0.75) {
      fx.screenFlash(`radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, ${color} 130%)`, ms, alpha);
    },
    /** Rising fire burst (fireball / brazier puff). o: {scale, count, colors} */
    fire(pos, o = {}) {
      const sc = o.scale ?? 1;
      fx.burst({ pos, count: o.count ?? 40, colors: o.colors || ['#fff3b0', '#ffb43a', '#ff6a1a', '#e8361a'], speed: [0.4 * sc, 1.6 * sc], up: 1.2,
        spread: 1, life: [300, 700], size: [0.22 * sc, 0.42 * sc], sizeEnd: 0.15, gravity: -2.5, drag: 2, shape: 0, jitter: 0.12 * sc });
      fx.burst({ pos, count: (o.count ?? 40) / 3, colors: ['#fff6d0'], speed: [0.2, 0.8], up: 0.8, spread: 1, life: [150, 300],
        size: [0.3 * sc, 0.5 * sc], sizeEnd: 0.4, gravity: -1, drag: 2, shape: 0 });
    },
    /** battle-2: layered fire — dark smoke under-layer (normal blend: keeps the flames readable on
     *  light squares), flames, a white-hot core and embers. o: {scale, colors, smoke, count} */
    inferno(pos, o = {}) {
      const sc = o.scale ?? 1, n = o.count ?? 40, cols = o.colors || ['#fff3b0', '#ffb43a', '#ff6a1a', '#e8361a'];
      fx.burst({ pos, count: n * 0.45, colors: o.smoke || ['#1a1412', '#2a2220', '#3a302a'], speed: [0.3 * sc, 1.2 * sc], up: 1.0, spread: 1,
        life: [700, 1300], size: [0.4 * sc, 0.7 * sc], sizeEnd: 2.0, gravity: -1.4, drag: 2, shape: 0, blend: 'normal', alpha: 0.62, jitter: 0.2 * sc });
      fx.burst({ pos, count: n, colors: cols, speed: [0.6 * sc, 2.2 * sc], up: 1.3, spread: 1, life: [320, 720],
        size: [0.3 * sc, 0.55 * sc], sizeEnd: 0.2, gravity: -2.8, drag: 2, shape: 0, jitter: 0.16 * sc });
      fx.burst({ pos, count: n * 0.3, colors: [cols[0], '#ffffff'], speed: [0.2, 0.9], up: 0.6, spread: 1, life: [160, 320],
        size: [0.45 * sc, 0.75 * sc], sizeEnd: 0.4, gravity: -1, drag: 2, shape: 0 });
      fx.burst({ pos, count: n * 0.5, colors: cols.slice(1, 3), speed: [1.5 * sc, 4 * sc], up: 2.2, spread: 1, life: [700, 1400],
        size: [0.05, 0.09], sizeEnd: 0.3, gravity: 1.5, drag: 1.2, shape: 1, jitter: 0.2 * sc });
    },
    /** Slow glowing embers drifting up. */
    embers(pos, o = {}) {
      fx.burst({ pos, count: o.count ?? 24, colors: o.colors || ['#ffcf6a', '#ff7a2a', '#ff4a1a'], speed: [0.2, 1.0], up: 1.4, spread: 1,
        life: [900, 1800], size: o.size || [0.035, 0.06], sizeEnd: 0.3, gravity: -0.6, drag: 0.8, shape: 1, jitter: o.radius ?? 0.3 });
    },
    /** Chunky debris pieces that bounce on the board. o: {count, colors, speed, up, size} — a big `up`
     *  throws them toward an overhead camera (perspective makes them grow: sells depth from Top). */
    debris(pos, o = {}) {
      const cols = (o.colors || [o.color || '#8a8580']).map(c => new THREE.Color(c));
      const sz = o.size ?? 1;
      for (let i = 0; i < (o.count ?? 14) && deb.length < DEB; i++) {
        const a = Math.random() * Math.PI * 2, sp = range(o.speed, rand(1.5, 3.5));
        deb.push({ p: new THREE.Vector3(pos.x, pos.y, pos.z), v: new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 3) + Math.random() * 2 * (o.upVar ?? 1), Math.sin(a) * sp),
          ax: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), a: 0, av: rand(6, 16), s: rand(0.6, 1.4) * sz,
          life: 0, max: range(o.life, rand(900, 1500)), c: pick(cols) });
      }
    },
    /** The full works: flash + layered fireball + sparks + shockwave + debris (+ scorch, board flash). */
    explosion(pos, o = {}) {
      const sc = o.scale ?? 1;
      fx.flash(pos, { color: o.flashColor || '#ffd28a', radius: 3.2 * sc, ms: 320 });
      fx.inferno(pos, { scale: 1.5 * sc, count: 60 * sc, colors: o.fireColors });
      fx.sparks(pos, { count: 70 * sc, speed: [4, 10], size: [0.07, 0.14], colors: o.sparkColors });
      fx.shockwave(pos, { radius: 2.6 * sc, color: o.ringColor || '#ffb35a' });
      fx.debris(pos, { count: 22 * sc, colors: o.debrisColors || ['#6f6a64', '#3d3a36', '#a39b8f'], speed: [2, 5], up: 5, size: 1.5 });
      if (o.scorch !== false) fx.scorch(pos, { radius: 1.0 * sc });
      if (o.boardFlash !== false) fx.boardFlash(o.flashColor || '#ff9a3a', 320, 0.45);
    },
    /** Jagged branching lightning between two points, flickering for ms. Lights the board.
     *  o: {color, width, branches, branchP, ms, dark (under-ribbon, default true), light (board flash, default true)} */
    lightning(from, to, o = {}) {
      const mesh = boltPool.get();
      mesh.position.set(0, 0, 0); mesh.frustumCulled = false;
      mesh.material[1].color.set(o.color || '#bfe6ff');
      const b = { mesh, pos: mesh.userData.pos, from: from.clone(), to: to.clone(), t: 0, ms: o.ms ?? 380, next: 0, w: o.width ?? 0.05,
        branches: o.branches ?? 2, branchP: o.branchP ?? 0.18, dark: o.dark !== false };
      buildBolt(b); bolts.push(b);
      fx.flash(to, { color: o.color || '#bfe6ff', radius: o.flashRadius ?? 1.2, ms: 180 });
      if (o.light !== false) fx.boardFlash(o.color || '#bfe6ff', b.ms, o.lightStrength ?? 0.3);
    },
    /** Tint the whole board (and the scene light) with a colour for a moment. */
    boardFlash(color = '#ff7a2a', ms = 300, strength = 0.4) {
      lightPulses.push({ t: 0, ms, c: new THREE.Color(color), s: strength });
      tintMat.color.set(color); tint.position.set(0, 0.012, 0); tint.visible = true;
    },
    /** Dark scorch/crack decal on the board that fades out. o: {radius, ms} */
    scorch(pos, o = {}) {
      const d = scorchPool.get(), r = o.radius ?? 0.6;
      d.material.opacity = 0.9; d.scale.set(r * 2, 1, r * 2);
      d.rotation.y = Math.random() * 6.28; d.position.set(pos.x, 0.006, pos.z);
      scorches.push({ d, t: 0, ms: o.ms ?? 2600 });
    },
    /** battle-2: dim the board around a fight (point, clear radius in world units). spotlight(null) lifts it. */
    spotlight(point, o = {}) {
      if (!point) { spotS.target = 0; spotS.rate = o.rate ?? 6; return; }
      spotS.p.set(point.x, 0, point.z); spotS.r = o.radius ?? 1.6; spotS.target = o.dim ?? 0.55; spotS.rate = o.rate ?? 7;
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
          if (d.p.y < 0.03 && Math.abs(d.p.x) < 4.6 && Math.abs(d.p.z) < 4.6) { d.p.y = 0.03; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.av *= 0.6; }
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
        if (b.t >= b.ms) { endBolt(b); bolts.splice(i, 1); continue; }
        if (b.t >= b.next) { buildBolt(b); b.next = b.t + 45; }
        const f = (1 - b.t / b.ms) * (0.6 + Math.random() * 0.4);
        b.mesh.material[1].opacity = f; b.mesh.material[0].opacity = 0.5 * f;
      }
      for (let i = scorches.length - 1; i >= 0; i--) {
        const s = scorches[i]; s.t += dtReal; // scorches fade in real time
        if (s.t >= s.ms) { endScorch(s); scorches.splice(i, 1); continue; }
        const k = s.t / s.ms; s.d.material.opacity = 0.9 * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      }
      // spotlight
      if (spotS.cur > 0.001 || spotS.target > 0) {
        spotS.cur += (spotS.target - spotS.cur) * (1 - Math.exp(-spotS.rate * dt / 1000));
        if (spotS.target === 0 && spotS.cur < 0.004) { spotS.cur = 0; parkFX(spot); }
        else { const S = (2 * spotS.r) / SPOT_IN; spot.position.set(spotS.p.x, 0.011, spotS.p.z); spot.scale.set(S, 1, S); }
        spotMat.opacity = spotS.cur;
      }
      if (lightPulses.length) {
        let best = 0, col = null;
        for (let i = lightPulses.length - 1; i >= 0; i--) {
          const p = lightPulses[i]; p.t += dt;
          if (p.t >= p.ms) { lightPulses.splice(i, 1); continue; }
          const f = p.s * (1 - p.t / p.ms) ** 2; if (f > best) { best = f; col = p.c; }
        }
        tintMat.opacity = best * 0.5; if (best <= 0.001) parkFX(tint);
        if (col) tintMat.color.copy(col);
        if (flashLight && lightBase) {
          flashLight.color.copy(lightBase.color); if (col) flashLight.color.lerp(col, Math.min(1, best * 1.5));
          flashLight.intensity = lightBase.intensity * (1 + best * 3);
        }
      } else if (tint.position.x !== PARK.x || (flashLight && lightBase && flashLight.intensity !== lightBase.intensity)) {
        parkFX(tint); if (flashLight && lightBase) { flashLight.color.copy(lightBase.color); flashLight.intensity = lightBase.intensity; }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]; f.t += dt; const k = f.t / f.ms;
        if (k >= 1) { endFlash(f); flashes.splice(i, 1); continue; }
        const sc = f.r * (0.5 + ease.cubicOut(k)); f.s.scale.set(sc, sc, sc); f.s.material.opacity = 1 - k;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.t += dt; const k = r.t / r.ms;
        if (k >= 1) { endRing(r); rings.splice(i, 1); continue; }
        const sc = 0.1 + r.R * ease.cubicOut(k); r.r.scale.set(sc, 1, sc); r.r.material.opacity = r.a * (1 - k) ** 1.3;
      }
    },
    setViewport(heightPx, fovDeg) {
      const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
      add.uniforms.uScale.value = s; norm.uniforms.uScale.value = s;
    },
    clear() {
      add.clear(); norm.clear(); deb.length = 0; debris.count = 0; lightPulses.length = 0; parkFX(tint);
      spotS.cur = 0; spotS.target = 0; spotMat.opacity = 0; parkFX(spot);
      if (flashLight && lightBase) { flashLight.color.copy(lightBase.color); flashLight.intensity = lightBase.intensity; }
      for (const b of bolts) endBolt(b); bolts.length = 0;
      for (const s of scorches) endScorch(s); scorches.length = 0;
      for (const f of flashes) endFlash(f); flashes.length = 0;
      for (const r of rings) endRing(r); rings.length = 0;
    },
    dispose() {
      fx.clear(); scene.remove(group); add.geom.dispose(); add.mat.dispose(); norm.geom.dispose(); norm.mat.dispose();
      group.traverse(o => {
        if (!o.userData.fxPooled && o !== spot && o !== tint && o !== debris) return;
        if (o.geometry && o.geometry !== G.ringThin && o.geometry !== G.ringThick && o.geometry !== G.plane) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose());
      });
    },
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
