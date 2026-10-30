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
const DEFAULT_CAP = 1200, FOCUS_MS = 560;
export function prep(ctx, measuredMs, targetMs = 2400) {
  const cap = ctx.capMs ?? ctx.battleCapMs ?? (ctx.timedCap || (ctx.online && ctx.timed) ? DEFAULT_CAP : 0);
  const rate = ctx.speed || 1, bodyMs = max(1, measuredMs - FOCUS_MS);
  let f = min(1, (targetMs - FOCUS_MS) / bodyMs);
  if (cap > 0) f = min(f, (cap * 0.92 * rate) / bodyMs);
  const c = f < 1
    ? { ...ctx, tween: (ms, fn, ez) => ctx.tween(ms * f, fn, ez), wait: ms => ctx.wait(ms * f) }
    : { ...ctx };
  c.timeScale = f;
  c.capped = cap > 0;
  c.lite = c.capped || rate >= 5;           // fewer particles + no camera moves when it's a blur anyway
  c.n = k => Math.max(1, Math.round(c.lite ? k * 0.6 : k));
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

export { THREE, ease };
