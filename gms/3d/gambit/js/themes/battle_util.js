// Shared helpers for theme battle anims (owner: battle-1). Used by fantasy/battles.js and
// halloween/battles.js. Nothing here is theme-specific.
//
//  - prep(ctx, nominalMs): honours a D24 cap (ctx.capMs / ctx.battleCapMs / ctx.timedCap) by
//    returning a ctx whose tween/wait are time-compressed so the battle fits the cap.
//  - Pools: battle FX objects are created once per board FX group, parked off-screen (culled)
//    so the board's renderer.compile() on theme load builds their shaders up front
//    (kit.addFxWarmup). Geometry/materials are module-level and shared; nothing is
//    allocated on the GPU per battle.
//  - finish(c): leaves the attacker exactly on ctx.to at rest pose.
import { THREE, addFxWarmup, parkFX, ease } from './kit.js';

export const { PI, sin, cos, min, max, abs, random } = Math;
export const R = (a, b) => a + Math.random() * (b - a);

/**
 * Battle timing. `measuredMs` = the anim's raw 1× length (tween time incl. ~560 ms of camera
 * focus/release, measured with tools/battle_cdp.mjs). Tweens are scaled so the whole battle lands
 * on `targetMs` at 1× (default 2.4 s), and — when a D24 cap is signalled (ctx.capMs /
 * ctx.battleCapMs / ctx.timedCap / ctx.online&&ctx.timed) — so it fits the cap in real time at
 * the current speed (camera focus is skipped when capped).
 */
const DEFAULT_CAP = 1200, FOCUS_MS = 760;
export function prep(ctx, measuredMs, targetMs = 2500) {
  const cap = ctx.capMs ?? ctx.battleCapMs ?? (ctx.timedCap || (ctx.online && ctx.timed) ? DEFAULT_CAP : 0);
  const rate = ctx.speed || 1, bodyMs = max(1, measuredMs - FOCUS_MS);
  let f = min(1, (targetMs - FOCUS_MS) / bodyMs);
  if (cap > 0) f = min(f, (cap * 0.92 * rate) / bodyMs);
  if (globalThis.__BATTLE_RAW && !(cap > 0)) f = 1;   // tools/battle_cdp.mjs: measure raw lengths
  const c = f < 1
    ? { ...ctx, tween: (ms, fn, ez) => ctx.tween(ms * f, fn, ez), wait: ms => ctx.wait(ms * f) }
    : { ...ctx };
  c.timeScale = f;
  c.capped = cap > 0;
  c.lite = c.capped || rate >= 5;           // fewer particles + no camera moves when it's a blur anyway
  c.n = k => Math.max(1, Math.round(c.lite ? k * 0.6 : k));
  c.big = !c.lite;                          // battle-2: full spectacle (camera push-in, slow-mo)
  return c;
}

/** Camera focus around the fight unless capped / fast (kit.focusFight already skips at 5×). */
export async function focus(c, body, o = {}) {
  if (c.capped || !c.camera) return body();
  return c.kit.focusFight(c, body, o);
}

/** Fixed-step-ish simulation driven by a linear tween: step(dtMs, k). Safe under skip. */
export function sim(c, ms, step) {
  let last = 0;
  return c.tween(ms, (e, k) => { const dt = (k - last) * ms; last = k; step(dt, k); });
}

/** Attacker exactly on its target square, upright, scale 1. */
export function finish(c) {
  const A = c.attacker;
  if (!A) return;
  A.position.copy(c.to); A.quaternion.identity(); A.scale.set(1, 1, 1);
}

export const vh = V => V?.userData?.height || 1;
export const vr = V => V?.userData?.radius || 0.35;

// --------------------------------------------------------------------- pools
const pools = new Set();                 // {group, objs: Map}
const byGroup = new WeakMap();
const factories = new Map();             // key -> factory()
function poolFor(group) {
  let p = byGroup.get(group);
  if (!p) {
    // a new FX group means the old one was disposed (theme switch): free its instanced buffers
    for (const q of pools) if (!q.group.parent) { for (const o of q.objs.values()) o.traverse(x => x.isInstancedMesh && x.dispose()); pools.delete(q); }
    p = { group, objs: new Map() }; byGroup.set(group, p); pools.add(p);
  }
  return p;
}
function make(p, key) {
  const f = factories.get(key);
  const o = f();
  o.userData.poolKey = key;
  o.traverse(x => { x.castShadow = false; x.receiveShadow = false; });
  parkFX(o);
  p.group.add(o);
  p.objs.set(key, o);
  return o;
}
addFxWarmup(group => { const p = poolFor(group); for (const k of factories.keys()) if (!p.objs.has(k)) make(p, k); });

/** Register pooled FX objects: {key: () => Object3D}. Call at module load. */
export function definePool(defs) { for (const [k, f] of Object.entries(defs)) factories.set(k, f); }
/** Get the pooled object (positioned at origin, visible). */
export function take(c, key) {
  const p = poolFor(c.fx.group);
  const o = p.objs.get(key) || make(p, key);
  o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.visible = true;
  return o;
}
/** Return pooled objects to their parking spot. */
export function park(...objs) { for (const o of objs) if (o) parkFX(o); }

// ------------------------------------------------------------ shared assets
/** Lazily created module-level singletons (geometry, materials, textures). */
export function once(fn) { let v; return () => (v ??= fn()); }

export const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export const UP = new THREE.Vector3(0, 1, 0);

/** Simple particle-ish instanced body list helper: arrays of {p, v, ax, a, av, s} */
export function writeInstances(im, items, scaleFn) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const s = scaleFn ? scaleFn(it, i) : it.s;
    _m4.compose(it.p, _q.setFromAxisAngle(it.ax, it.a), _s.set(s * (it.sx || 1), s * (it.sy || 1), s * (it.sz || 1)));
    im.setMatrixAt(i, _m4);
  }
  im.count = items.length;
  im.instanceMatrix.needsUpdate = true;
}

/** Fly V off the nearest board edge along dir, tumbling, with a smoke trail (classic launch). */
export function tumbleOff(c, V, dir, { ms = 720, lift = 2.2, spins = 3.2, smoke = '#d9d2c5' } = {}) {
  const p0 = V.position.clone();
  const tEdge = min(...['x', 'z'].map(ax => (dir[ax] ? (Math.sign(dir[ax]) * 5.6 - p0[ax]) / dir[ax] : Infinity)));
  const land = p0.clone().addScaledVector(dir, max(2, tEdge)); land.y = -2.5;
  const axis = c.kit.tiltAxis(dir);
  let lastPuff = 0;
  return c.tween(ms, (e, k) => {
    V.position.set(p0.x + (land.x - p0.x) * k, p0.y + lift * sin(k * PI * 0.75) + (land.y - p0.y) * k * k, p0.z + (land.z - p0.z) * k);
    V.quaternion.setFromAxisAngle(axis, k * PI * spins);
    if (k - lastPuff > 0.08 && k < 1) { lastPuff = k; c.fx.smoke(V.position.clone(), { count: 2, size: [0.18, 0.3], alpha: 0.4, up: 0.1, colors: [smoke] }); }
  }).then(() => { V.visible = false; });
}

/** Tween a material colour toward a target (material must be owned, see kit.ownMaterials). */
export function darken(c, obj, target = '#120c08', ms = 400, amount = 0.9) {
  c.kit.ownMaterials(obj);
  const t = new THREE.Color(target), mats = [];
  obj.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.color && mats.push([m, m.color.clone()])); });
  return c.tween(ms, e => { for (const [m, c0] of mats) m.color.copy(c0).lerp(t, e * amount); }, ease.quadOut);
}

// ======================================================================= battle-2
// Spectacle layer: every battle is staged for the default LOCKED TOP view on a phone.
//  stage(c, body)   camera pushes in on attacker+victim (~2–3 squares) with a dramatic tilt,
//                   the board dims around the fight, then everything eases back EXACTLY to the
//                   locked pose (focus f -> 0). No push-in when capped (D24) or at 5× (c.lite).
//  camTo / punch    re-frame mid-fight (follow the victim, zoom kick on impact).
//  slowmo(c)        time-scale dip at the moment of impact (~200 ms real), then snaps back.
//  impact(c, pos)   the standard big beat: flashes, shockwave across squares, board tint,
//                   coloured vignette, shake, debris toward the camera, slow-mo, sound.
//  fling / shards   bigger, funnier victim reactions (bounce across the board, fly off the
//                   edge spinning; shatter into ~90 instanced shards in the victim's colours).
//  sound(c, name)   audio agent's sfx(), loaded lazily and fully guarded.
const clamp = (v, a, b) => min(b, max(a, v));
const _sfx = { fn: null, p: null };
function loadSfx() {
  if (!_sfx.p) _sfx.p = import('../audio/index.js').then(m => { _sfx.fn = typeof m.sfx === 'function' ? m.sfx : null; }).catch(() => { _sfx.fn = null; });
  return _sfx.p;
}
try { if (typeof window !== 'undefined') loadSfx(); } catch { /* no audio */ }
/** True once the audio engine's sfx() is loaded (tests). */
export const audioReady = () => !!_sfx.fn;
/** Play a battle sound if the audio engine is present. Never throws. */
export function sound(c, name, o = {}) {
  try { if (_sfx.fn && !c.tl?.instant) _sfx.fn(name, { ctx: c, at: o.at || c.victimPos, ...o }); } catch { /* audio is optional */ }
}

/** Extra tilt (radians) for drama, by the current camera pitch: most from Top, little from 3D. */
function tiltFor(c) {
  const cam = c.camera?.three; if (!cam) return 0.3;
  const len = cam.position.length() || 1, phi = Math.acos(clamp(cam.position.y / len, -1, 1));
  return clamp(0.46 - phi * 0.55, 0.06, 0.46);
}
/** Stage the fight: push-in + dim, run body, ease back to the locked pose. o: {zoom, tilt, point, spot} */
export async function stage(c, body, o = {}) {
  const A0 = c.attacker.position.clone(), Vp = c.victimPos.clone();
  const d = Math.hypot(Vp.x - A0.x, Vp.z - A0.z);
  const mid = o.point || A0.clone().lerp(Vp, 0.58);
  c.fx.spotlight(A0.clone().lerp(Vp, 0.62), { radius: o.spot ?? max(1.25, d * 0.5 + 0.7), dim: c.lite ? 0.32 : 0.58 });
  const cam = c.big && !c.capped && c.camera && c.camera.focus;
  c._cam = cam ? { point: mid.clone().setY(0), zoom: o.zoom ?? clamp((d + 2.3) / 8.4, 0.4, 0.86), tilt: o.tilt ?? tiltFor(c), ready: false } : null;
  try {
    if (cam) { await c.camera.focus(c._cam.point, { zoom: c._cam.zoom, tilt: c._cam.tilt, ms: 360 }); c._cam.ready = true; }
    await body();
  } finally {
    c.fx.spotlight(null);
    if (cam) { c._cam.ready = false; await c.camera.release({ ms: 400 }); }
  }
}
/** Re-frame the pushed-in camera (point / zoom / tilt) over ms (timeline ms, not prep-scaled). */
export function camTo(c, { point, zoom, tilt } = {}, ms = 300, ez = ease.cubicInOut) {
  const s = c._cam; if (!s || !s.ready) return Promise.resolve();
  const p0 = s.point.clone(), z0 = s.zoom, t0 = s.tilt;
  const p1 = point ? point.clone().setY(0) : p0, z1 = zoom ?? z0, t1 = tilt ?? t0;
  return c.tl.tween(ms, e => {
    if (!s.ready) return;
    s.point.lerpVectors(p0, p1, e); s.zoom = z0 + (z1 - z0) * e; s.tilt = t0 + (t1 - t0) * e;
    c.camera.focus(s.point, { zoom: s.zoom, tilt: s.tilt, ms: 0 });
  }, ez);
}
/** Zoom kick toward pos at impact, settling back. */
export function punch(c, pos, k = 0.82) {
  const s = c._cam; if (!s || !s.ready) return Promise.resolve();
  const z0 = s.zoom, p0 = s.point.clone(), p1 = s.point.clone().lerp(pos, 0.35).setY(0);
  return camTo(c, { zoom: z0 * k, point: p1 }, 90, ease.quadOut).then(() => camTo(c, { zoom: z0 * 1.04, point: p0 }, 520, ease.cubicOut));
}
/** Time-scale dip: the whole battle (tweens + particles) runs at `factor` for ~ms real, then snaps back. */
export async function slowmo(c, { factor = 0.18, ms = 210 } = {}) {
  const tl = c.tl;
  if (!tl || !c.big || c.capped || tl.instant) return;
  const base = tl.rate, real = ms / base;
  const steps = [[factor, 0.62], [factor + (1 - factor) * 0.4, 0.2], [factor + (1 - factor) * 0.75, 0.18]];
  try { for (const [f, part] of steps) { if (tl.instant) break; tl.rate = base * f; await tl.wait(real * part * tl.rate); } }
  finally { tl.rate = base; }
}
/** The big impact beat. o: {color, power, ring (radius), slow, shake, sparks (colors), debris (colors),
 *  dust (colors), flash, vignette, sfx, white} */
export function impact(c, pos, o = {}) {
  const { fx, kit } = c, P = o.power ?? 1, col = o.color || '#ffd28a';
  const ground = pos.clone().setY(0);
  fx.flash(pos, { color: col, radius: 2.8 * P, ms: 320 });
  if (o.white !== false) fx.flash(pos, { color: '#ffffff', radius: 1.7 * P, ms: 170 });
  if (o.ring !== false) fx.shockwave(ground, { radius: (o.ring || 2.6) * P, color: col, dustColors: o.dust });
  fx.boardFlash(o.tint || col, 420, (o.tintStrength ?? 0.3) * P);
  if (c.big) fx.vignette(o.vignette || col, 520, 0.7);
  kit.shake(c, (o.shake ?? 0.11) * P, 420);
  if (o.sparks) fx.sparks(pos, { count: c.n(90 * P), colors: o.sparks, speed: [4, 11], size: [0.08, 0.17], up: 0.8, life: [300, 700] });
  if (o.debris) fx.debris(pos, { count: c.n(20 * P), colors: o.debris, speed: [1.5, 4.5], up: 6.5, size: 1.6 });
  if (o.sfx) sound(c, o.sfx, { at: pos });
  punch(c, pos);
  if (o.slow !== false) slowmo(c, typeof o.slow === 'object' ? o.slow : undefined);
}

/** Fling V along dir: bounces across the board spinning, then flies off the edge. Ends hidden. */
export function fling(c, V, dir, { ms = 1000, up = 6.5, speed = 5.2, spin = 14, bounce = 0.55, trail = '#d9d2c5', dust = ['#8a8070', '#6c6458'] } = {}) {
  const p = V.position.clone(), v = new THREE.Vector3(dir.x * speed, up, dir.z * speed);
  const axis = c.kit.tiltAxis(dir), q = new THREE.Quaternion(), qy = new THREE.Quaternion();
  let ang = 0, yaw = 0, av = spin, lastPuff = 0, T = 0;
  return sim(c, ms, (dt, k) => {
    const s = dt / 1000; T += s;
    v.y -= 18 * s; p.addScaledVector(v, s); ang += av * s; yaw += av * 0.6 * s;
    const onBoard = Math.abs(p.x) < 4.15 && Math.abs(p.z) < 4.15;
    if (p.y < 0 && onBoard && v.y < 0) {
      p.y = 0; v.y *= -bounce; v.x *= 0.85; v.z *= 0.85; av *= -0.8;
      c.fx.dust(p.clone().setY(0.05), { count: c.n(10), colors: dust, speed: [0.6, 1.8], up: 0.6 });
      c.fx.ring(p, { radius: 0.7, color: '#ffffff', ms: 260, alpha: 0.6 });
      c.kit.shake(c, 0.04, 140);
      sound(c, 'thud', { at: p, gain: 0.7 });
    }
    V.position.copy(p);
    V.quaternion.copy(q.setFromAxisAngle(axis, ang)).premultiply(qy.setFromAxisAngle(UP, yaw));
    if (k - lastPuff > 0.06 && k < 1 && p.y > 0.3) { lastPuff = k; c.fx.smoke(p.clone(), { count: 2, size: [0.18, 0.3], alpha: 0.4, up: 0.1, colors: [trail] }); }
    if (k >= 1 || p.y < -3) V.visible = false;
  });
}

const SH = 110;
const shardAsset = once(() => {
  const g = new THREE.OctahedronGeometry(0.1, 0); g.scale(1, 1.9, 0.7);
  return { g, m: new THREE.MeshStandardMaterial({ roughness: 0.18, metalness: 0.35, flatShading: true, emissive: '#1a1c24', emissiveIntensity: 1 }) };
});
definePool({
  'u.shards': () => {
    const { g, m } = shardAsset();
    const im = new THREE.InstancedMesh(g, m, SH);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SH * 3).fill(1), 3);
    im.frustumCulled = false; return im;
  },
});
/** Shatter V into many shards in `colors`, thrown up toward the camera and outward; V is hidden.
 *  o: {count, ms, speed, up, away (Vector3 bias), size} */
export async function shards(c, V, colors, { count = 90, ms = 900, speed = [1.5, 4.2], up = [3, 7.5], away = null, size = 1 } = {}) {
  const im = take(c, 'u.shards');
  const cols = colors.map(h => new THREE.Color(h));
  const h = vh(V), n = min(SH, c.n(count)), base = V.position.clone();
  const items = [];
  for (let i = 0; i < n; i++) {
    const a = R(0, PI * 2), sp = R(speed[0], speed[1]);
    const v = new THREE.Vector3(cos(a) * sp, R(up[0], up[1]), sin(a) * sp);
    if (away) v.addScaledVector(away, R(0.8, 2.2));
    items.push({ p: base.clone().add(new THREE.Vector3(R(-0.18, 0.18), R(0.05, h), R(-0.18, 0.18))), v,
      ax: new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(), a: R(0, 6), av: R(8, 20), s: R(0.6, 1.6) * size });
    im.setColorAt(i, cols[i % cols.length]);
  }
  im.instanceColor.needsUpdate = true;
  V.visible = false;
  try {
    await sim(c, ms, (dt, k) => {
      const s = dt / 1000;
      for (const it of items) {
        it.v.y -= 14 * s; it.p.addScaledVector(it.v, s); it.a += it.av * s;
        if (it.p.y < 0.04 && Math.abs(it.p.x) < 4.15 && Math.abs(it.p.z) < 4.15) { it.p.y = 0.04; it.v.y *= -0.4; it.v.x *= 0.6; it.v.z *= 0.6; it.av *= 0.5; }
      }
      writeInstances(im, items, it => it.s * (k > 0.7 ? max(0.01, 1 - (k - 0.7) / 0.3) : 1));
    });
  } finally { park(im); }
}

export { THREE, ease };
