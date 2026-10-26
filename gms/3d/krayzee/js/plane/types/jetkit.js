import * as THREE from 'three';
import { Builder, monotone, airfoilLoop, lerp, clamp } from '../geom.js';
import { uvPlan } from '../livery.js';

// Shared geometry for the big types (jumbo, herc): polar fuselage sections with an optional upper-deck hump,
// swept wing panels, lathe nacelles, multi-wheel bogies and a vertex-shader spinner for several fans/props in ONE
// draw call. Build frame as for the other types: x right, y up (ground y = 0), z = station aft of the nose.

// ---------- fuselage sections ----------
// keys: [station, yc, w, ht, hb, nt, nb, hy, ha, hh, fy, fa, fb]; the main body is a superellipse around (0, yc) with
// half-width w, top ht, bottom hb (exponents nt/nb); the hump is an ellipse centred (0, hy), half-width ha, half-height
// hh; the belly fairing (or sponsons) an ellipse centred (0, fy), fa x fb. All three are soft-unioned.
export function sectionTable(keys) {
  const S = keys.map((k) => k[0]);
  const F = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => monotone(S, keys.map((k) => k[c] ?? 0)));
  return (s) => ({ s, yc: F[0](s), w: F[1](s), ht: F[2](s), hb: F[3](s), nt: F[4](s) || 2, nb: F[5](s) || 2, hy: F[6](s), ha: F[7](s), hh: F[8](s), fy: F[9](s), fa: F[10](s), fb: F[11](s) });
}
const SOFT = 0.16;
// polar radius from (0, yc) at angle t (0 = top, pi/2 = right, pi = bottom)
export function secR(sec, t) {
  const sx = Math.abs(Math.sin(t)), cy = Math.cos(t);
  const top = cy >= 0, h = top ? sec.ht : sec.hb, n = top ? sec.nt : sec.nb;
  const r1 = 1 / ((sx / Math.max(1e-4, sec.w)) ** n + (Math.abs(cy) / Math.max(1e-4, h)) ** n) ** (1 / n);
  const r2 = ellR(sx, cy, sec.hy - sec.yc, sec.ha, sec.hh), r3 = ellR(sx, cy, (sec.fy ?? 0) - sec.yc, sec.fa ?? 0, sec.fb ?? 0);
  if (!r2 && !r3) return r1;
  const m = Math.max(r1, r2, r3);
  return m + SOFT * Math.log(Math.exp((r1 - m) / SOFT) + Math.exp((r2 - m) / SOFT) + Math.exp((r3 - m) / SOFT));
}
// far intersection of the ray (sx, cy) from the origin with an ellipse centred dy above it (0 = miss)
function ellR(sx, cy, dy, a, b) {
  if (!(a > 0.05 && b > 0.05)) return 0;
  const A = (sx * sx) / (a * a) + (cy * cy) / (b * b), B = (-2 * cy * dy) / (b * b), C = (dy * dy) / (b * b) - 1;
  const D = B * B - 4 * A * C;
  if (D < 0) return 0;
  const r = (-B + Math.sqrt(D)) / (2 * A);
  return r > 0 ? r : 0;
}
export function secPt(sec, t, inset = 0) {
  const r = secR(sec, t) - inset;
  return [Math.sin(t) * r, sec.yc + Math.cos(t) * r, sec.s];
}
// half-width of the section at height y (bisection on the polar shape), for placing things against the skin
export function secHalfWidth(sec, y) {
  let lo = 0.0001, hi = Math.PI - 0.0001;
  const yAt = (t) => sec.yc + Math.cos(t) * secR(sec, t);
  if (y >= yAt(lo) || y <= yAt(hi)) return 0;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (yAt(m) > y) lo = m; else hi = m; }
  const t = (lo + hi) / 2;
  return Math.sin(t) * secR(sec, t);
}
// angle t whose point is at height y on the right side (upper or lower half)
export function secAngleAtY(sec, y) {
  let lo = 0.0001, hi = Math.PI - 0.0001;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sec.yc + Math.cos(m) * secR(sec, m) > y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// Lofts a closed fuselage over `stations`; ring of N points (N even). UVs from uvFn(p, right).
export function loftFuselage(B, secFn, stations, N, uvFn, color) {
  const rings = stations.map((s) => { const sec = secFn(s); const r = []; for (let j = 0; j < N; j++) r.push(secPt(sec, (j / N) * Math.PI * 2)); return r; });
  B.loft(rings, {
    out: (p, i) => [p[0], p[1] - secFn(stations[i]).yc, 0],
    splits: [[0, N / 2, (p) => uvFn(p, true)], [N / 2, N, (p) => uvFn(p, false)]],
    color,
  });
  return rings;
}

// Patch of skin between stations s0..s1 and angles t0..t1, pushed outward by `off` (glass panes, panels).
export function skinPatch(B, secFn, s0, s1, t0, t1, ns, nt, off, uv, color, out = true) {
  const rows = [];
  for (let i = 0; i <= ns; i++) {
    const sec = secFn(lerp(s0, s1, i / ns)), r = [];
    for (let j = 0; j <= nt; j++) r.push(secPt(sec, lerp(t0, t1, j / nt), -off));
    rows.push(r);
  }
  const mid = rows[ns >> 1][nt >> 1], sec = secFn(mid[2]);
  B.loft(rows, { closed: false, out: () => (out ? [mid[0], mid[1] - sec.yc, 0] : [-mid[0], -(mid[1] - sec.yc), 0]), uv: () => uv, color });
  return rows;
}

// ---------- wings ----------
// plan(x) -> { le, c, y, thk } at span station x (x >= 0; mirrored by the caller). Lofts span stations xs.
export function wingPanel(B, plan, xs, foil, nC, { cFrom = 0, cTo = 1, roundNose = false, regT, regB, caps = [true, true], capUV, sign = 1, uvT, uvB } = {}) {
  const { loop, topCount } = airfoilLoop(foil, nC, cFrom, cTo, roundNose);
  const top = topCount - 1 + (cFrom > 0 && roundNose ? 3 : 0);
  const rings = xs.map((x) => {
    const w = plan(Math.abs(x));
    return loop.map(([xc, yv]) => [x, w.y + yv * w.c * w.thk + (w.twist || 0) * (xc - 0.25) * w.c, w.le + xc * w.c]);
  });
  const ut = uvT || ((p) => uvPlan(regT, p[0], p[2])), ub = uvB || ((p) => uvPlan(regB, p[0], p[2]));
  B.loft(rings, {
    out: () => [0, 1, 0],
    splits: [[0, top, ut], [top, loop.length, ub]],
    capStart: caps[0], capEnd: caps[1], capUV: capUV || ut,
  });
  return rings;
}
export function spanSteps(a, b, step) {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}
// a point on the airfoil surface at chord fraction f (upper or lower) for the plan at x
export function wingSurf(plan, foil, x, f, upper = true) {
  const w = plan(Math.abs(x)), [yu, yl] = foil(f);
  return [x, w.y + (upper ? yu : yl) * w.c * w.thk, w.le + f * w.c];
}

// ---------- spin shader: rotate vertices about their per-vertex hub (axis +Z) by a uniform angle ----------
// One mesh holds every fan/prop: attribute `hub` (vec3) is each vertex's rotation centre; angle comes from getAngle().
export function spinPatch(mat, key, getAngle) {
  const U = { value: 0 };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.uSpin = U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 hub;\nuniform float uSpin;\nmat2 spinM() { float c = cos(uSpin), s = sin(uSpin); return mat2(c, s, -s, c); }')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal.xy = spinM() * objectNormal.xy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xy = hub.xy + spinM() * (transformed.xy - hub.xy);');
  };
  const base = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (base ? base() : '') + '-spin-' + key;
  return { uniform: U, update: () => { U.value = getAngle(); } };
}
// Builds a spinning mesh from per-hub builders: parts = [{ hub:[x,y,z], build(B) }] (geometry built around the hub).
export function spinMesh(name, parts, mat, spin) {
  const B = new Builder(), hubs = [];
  for (const p of parts) {
    const b0 = B.count;
    p.build(B);
    for (let i = b0; i < B.count; i++) hubs.push(...p.hub);
  }
  const g = B.build();
  g.setAttribute('hub', new THREE.Float32BufferAttribute(hubs, 3));
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.onBeforeRender = spin.update;
  m.frustumCulled = false;
  return m;
}
// stand-ins the rig can poke (propGroup.rotation.z, propMesh.visible, disc.visible/rotation) without moving anything
export function propProxy(meshes = []) {
  const o = { rotation: { z: 0 }, _v: true };
  Object.defineProperty(o, 'visible', { get() { return o._v; }, set(v) { o._v = v; for (const m of meshes) m.visible = v; }, configurable: true });
  return o;
}

// ---------- wheels ----------
// tyre + hub as a lathe about the axle (x axis) centred at c
export function wheel(B, c, r, w, n, cols, RM) {
  const prof = [[-w / 2, r * 0.62], [-w / 2, r * 0.86], [-w * 0.45, r * 0.97], [-w * 0.3, r], [w * 0.3, r], [w * 0.45, r * 0.97], [w / 2, r * 0.86], [w / 2, r * 0.62]];
  const rings = prof.map(([x, rr]) => { const ring = []; for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; ring.push([c[0] + x, c[1] + Math.cos(a) * rr, c[2] + Math.sin(a) * rr]); } return ring; });
  B.loft(rings, { out: (p) => [0, p[1] - c[1], p[2] - c[2]], color: cols.tire, uv: () => RM.rubber });
  for (const sg of [-1, 1]) {
    const ring = []; const nn = Math.max(6, n >> 1);
    for (let j = 0; j < nn; j++) { const a = (j / nn) * Math.PI * 2; ring.push([c[0] + sg * w * 0.42, c[1] + Math.cos(a) * r * 0.63, c[2] + Math.sin(a) * r * 0.63]); }
    const ci = B.v([c[0] + sg * w * 0.36, c[1], c[2]], [sg, 0, 0], RM.steel, cols.hub), b0 = B.count;
    for (const p of ring) B.v(p, [sg, 0, 0], RM.steel, cols.hub);
    for (let j = 0; j < nn; j++) { const a = b0 + j, b = b0 + ((j + 1) % nn); if (sg > 0) B.t(ci, a, b); else B.t(ci, b, a); }
  }
}

// ---------- shared rig glue for the big types ----------
export function COCKPIT_STICK(P) {
  const pos = [P.seats[0], P.yoke.y, P.yoke.s];
  return { pos, move(stick, cur) { stick.position.z = pos[2] + cur.elevator * 0.09; stick.rotation.set(0, 0, -cur.aileron * 0.75); } };
}

// shared by jumbo + herc: control surfaces, flaps (Fowler: rotate + run aft), fans/props, gear retraction, stairs/ramp
export function animateBig(ext, cur, dt, ctx, MAXS, o = {}) {
  const h = ext.hinges;
  if (h.ailR) { h.ailR.rotation.x = -cur.aileron * MAXS.aileron; h.ailL.rotation.x = cur.aileron * MAXS.aileron; }
  const el = -(cur.elevator > 0 ? cur.elevator * MAXS.elevUp : cur.elevator * MAXS.elevDown);
  for (const e of [h.elevator, h.elevR, h.elevL]) if (e) e.rotation.x = el;
  if (h.rudder) h.rudder.rotation.x = cur.rudder * MAXS.rudder;
  const fl = Math.max(0, cur.flaps), aft = (o.flapAft ?? 0.9) * Math.min(1, fl * 1.4) ** 0.8;
  for (const k of ['flapInR', 'flapInL', 'flapOutR', 'flapOutL', 'flapR', 'flapL']) {
    const f = h[k];
    if (!f) continue;
    f.rotation.x = fl * MAXS.flaps; f.position.z = aft; f.position.y = -0.12 * fl;
  }
  if (o.fanRate) ctx.fanAngle = ((ctx.fanAngle || 0) - o.fanRate(ctx.rpm ?? 1000) * Math.PI * 2 * dt) % (Math.PI * 200);
  // gear: 1 = down. Retracts by telescoping up into the belly/sponsons.
  const g = ctx.gear ?? 1, gs = ctx.gearShown ?? g;
  const ng = gs + clamp(g - gs, -dt / 7, dt / 7);
  ctx.gearShown = ng;
  for (const gp of [ext.gearPivot, ...(ctx.farGear || [])]) {
    if (!gp) continue;
    gp.visible = ng > 0.02;
    gp.scale.y = lerp(0.12, 1, ng);
    gp.scale.x = gp.scale.z = lerp(0.85, 1, ng);
  }
  if (ext.stairs) ext.stairs.visible = !!ctx.stairs;
  if (ext.ramp) {
    const rs = ctx.rampShown ?? 0, rt = ctx.ramp ?? 0;
    ctx.rampShown = rs + clamp(rt - rs, -dt / 5, dt / 5);
    ext.ramp.rotation.x = ctx.rampShown * (ext.rampMax ?? 0.5);
  }
  if (o.extra) o.extra(ext, cur, dt, ctx);
}

// Additive rig API for the big types: setGear(0..1) (1 = down; travel takes ~7 s), setControls({ gear }),
// gear() (shown position), setStairs(bool) (jumbo) and setRamp(0..1) (herc). Far LODs get their own unmerged gear
// back so an AI jumbo on approach still shows its wheels (one extra call while the gear is down).
export function finishBig(rig, ctx, opts = {}) {
  (ctx.farGear || []).forEach((gp, i) => rig.lod.levels[i + 1]?.object.add(gp));
  const sc = rig.setControls;
  rig.setGear = (v, instant = false) => { ctx.gear = clamp(+v, 0, 1); if (instant) ctx.gearShown = ctx.gear; };
  rig.gear = () => ctx.gearShown ?? 1;
  rig.setControls = (c = {}) => { sc(c); if (typeof c.gear === 'number' && Number.isFinite(c.gear)) ctx.gear = clamp(c.gear, 0, 1); };
  rig.setStairs = (on) => { ctx.stairs = !!on; };
  rig.setRamp = (v) => { ctx.ramp = clamp(+v || 0, 0, 1); };
  // callers set castShadow on every mesh: keep prop discs / spinning blades / lights out of the shadow pass, and the
  // flight deck + pilot too (they sit inside the hull, so their shadows could never be seen)
  const pin = (o) => { if (o.isMesh && !Object.getOwnPropertyDescriptor(o, 'castShadow')?.get) Object.defineProperty(o, 'castShadow', { get: () => false, set() {} }); };
  rig.root.traverse((o) => { if (['propDisc', 'prop', 'fan', 'lights', 'beacon'].includes(o.name)) pin(o); });
  if (rig.cockpit) rig.cockpit.traverse(pin);
  if (opts.gear != null) rig.setGear(opts.gear, true);
  if (opts.stairs) rig.setStairs(true);
  rig.update(0);
  return rig;
}


export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export { clamp, lerp };
