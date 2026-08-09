/**
 * Shared spell juice: decals, impact bursts, wind-ups, screen feedback.
 *
 * Everything a spell leaves behind that is neither a fluid (world.surfaces) nor
 * a solid (props / terrain / debris) lives here as a pooled decal. Decals are
 * flat SoA and swap-removed, so a fight that leaves 300 scorch marks costs one
 * linear walk and no garbage.
 *
 * Colours are authored the way they should LOOK — the renderer squares them into
 * pseudo-linear space, so saturated primaries go nuclear. Everything below is
 * deliberately desaturated.
 */

import { LAYER } from '../gfx/renderer.js';

export const TAU = Math.PI * 2;

export const SCHOOL = {
  fire:  { key: 'fire',  base: [1.00, 0.72, 0.34], hot: [1.00, 0.94, 0.74], dark: [0.72, 0.24, 0.10] },
  storm: { key: 'storm', base: [0.70, 0.85, 1.00], hot: [0.96, 0.99, 1.00], dark: [0.36, 0.44, 0.90] },
  earth: { key: 'earth', base: [0.80, 0.68, 0.50], hot: [1.00, 0.90, 0.70], dark: [0.34, 0.28, 0.21] },
  decay: { key: 'decay', base: [0.66, 0.90, 0.42], hot: [0.88, 1.00, 0.66], dark: [0.24, 0.38, 0.14] },
  void:  { key: 'void',  base: [0.70, 0.54, 0.96], hot: [0.93, 0.87, 1.00], dark: [0.18, 0.09, 0.30] },
  life:  { key: 'life',  base: [1.00, 0.60, 0.58], hot: [1.00, 0.87, 0.83], dark: [0.44, 0.11, 0.16] },
};

/* ------------------------------------------------------------------ *
 * Decals
 * ------------------------------------------------------------------ */

const CAP = 512;
const F = (n) => new Float32Array(n);
const dx = F(CAP), dy = F(CAP), dw = F(CAP), dh = F(CAP), dr = F(CAP);
const cr = F(CAP), cg = F(CAP), cb = F(CAP), ca = F(CAP);
const dlife = F(CAP), dmax = F(CAP), dhold = F(CAP), dgrow = F(CAP), dspin = F(CAP);
const dglow = F(CAP), dsink = F(CAP);
const dlayer = new Uint8Array(CAP), dadd = new Uint8Array(CAP);
const dtex = new Array(CAP);
let dn = 0;

/** Oldest non-permanent decal is recycled when the pool fills — never stall. */
function slot() {
  if (dn < CAP) return dn++;
  let worst = 0, worstScore = Infinity;
  for (let i = 0; i < CAP; i++) {
    const s = dlife[i] / (dmax[i] || 1);
    if (s < worstScore) { worstScore = s; worst = i; }
  }
  return worst;
}

/**
 * @param o.life seconds; use a big number (600) for "permanent" — the world
 *        remembers, but not so hard that a 40-minute level accumulates forever.
 * @param o.hold 0..1 fraction of life spent at full alpha before fading.
 */
export function decal(o) {
  const i = slot();
  dx[i] = o.x; dy[i] = o.y;
  dw[i] = o.w; dh[i] = o.h === undefined ? o.w : o.h;
  dr[i] = o.rot || 0;
  const c = o.color;
  cr[i] = c[0]; cg[i] = c[1]; cb[i] = c[2]; ca[i] = c[3] === undefined ? 1 : c[3];
  const l = o.life === undefined ? 12 : o.life;
  dlife[i] = l; dmax[i] = l;
  dhold[i] = o.hold === undefined ? 0.55 : o.hold;
  dgrow[i] = o.grow || 0;
  dspin[i] = o.spin || 0;
  dglow[i] = o.glow || 0;
  dsink[i] = o.sink || 0;
  dlayer[i] = o.layer === undefined ? LAYER.TERRAIN_FRONT : o.layer;
  dadd[i] = o.add ? 1 : 0;
  dtex[i] = o.tex || null;
  return i;
}

/** A stain built from several overlapping blobs — reads as painted, not stamped. */
export function splat(rng, x, y, radius, color, count, opts) {
  const o = opts || EMPTY;
  for (let k = 0; k < count; k++) {
    const a = rng.angle();
    const rad = Math.pow(rng.next(), 0.6) * radius;
    const s = radius * rng.range(0.35, 0.85) * (1 - rad / (radius * 2.2));
    decal({
      x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad * 0.35,
      w: s * rng.range(1.6, 2.6), h: s * rng.range(0.5, 0.9),
      rot: rng.range(-0.25, 0.25),
      color: [color[0], color[1], color[2], (color[3] === undefined ? 1 : color[3]) * rng.range(0.5, 1)],
      life: o.life === undefined ? 90 : o.life,
      hold: o.hold === undefined ? 0.7 : o.hold,
      layer: o.layer === undefined ? LAYER.TERRAIN_FRONT : o.layer,
      add: o.add, glow: o.glow, tex: o.tex, sink: o.sink,
    });
  }
}
const EMPTY = {};

export function updateDecals(dt) {
  for (let i = 0; i < dn; i++) {
    const l = dlife[i] - dt;
    if (l <= 0) {
      const j = --dn;
      if (i !== j) {
        dx[i] = dx[j]; dy[i] = dy[j]; dw[i] = dw[j]; dh[i] = dh[j]; dr[i] = dr[j];
        cr[i] = cr[j]; cg[i] = cg[j]; cb[i] = cb[j]; ca[i] = ca[j];
        dlife[i] = dlife[j]; dmax[i] = dmax[j]; dhold[i] = dhold[j];
        dgrow[i] = dgrow[j]; dspin[i] = dspin[j]; dglow[i] = dglow[j]; dsink[i] = dsink[j];
        dlayer[i] = dlayer[j]; dadd[i] = dadd[j]; dtex[i] = dtex[j];
      }
      i--;
      continue;
    }
    dlife[i] = l;
    if (dgrow[i]) { const g = 1 + dgrow[i] * dt; dw[i] *= g; dh[i] *= g; }
    if (dspin[i]) dr[i] += dspin[i] * dt;
    if (dsink[i]) dy[i] += dsink[i] * dt;
  }
}

export function drawDecals(R) {
  const tex = R.blob;
  let glows = 0;
  for (let i = 0; i < dn; i++) {
    const t = dlife[i] / dmax[i];
    const h = dhold[i];
    const k = t >= h ? 1 : (h > 0 ? t / h : 1);
    const a = ca[i] * k;
    if (a <= 0.004) continue;
    R.sprite({
      tex: dtex[i] || tex,
      x: dx[i], y: dy[i], w: dw[i], h: dh[i], rot: dr[i],
      r: cr[i], g: cg[i], b: cb[i], a,
      layer: dlayer[i], add: dadd[i] === 1,
    });
    if (dglow[i] > 0.001 && glows < 24) {
      glows++;
      R.light({
        x: dx[i], y: dy[i], radius: dw[i] * 1.6,
        r: cr[i], g: cg[i], b: cb[i],
        intensity: dglow[i] * k, flicker: 0.35,
      });
    }
  }
}

export function decalCount() { return dn; }
export function clearDecals() { dn = 0; }

/* ------------------------------------------------------------------ *
 * Screen feedback, budgeted
 *
 * Five auto-casting circles will happily request hitstop sixty times a second.
 * A budget that refills over time keeps the big hits punchy and stops the small
 * ones from turning the game into a slideshow.
 * ------------------------------------------------------------------ */

let stopBudget = 1, shakeBudget = 1, wavesThisTick = 0;

export function feedbackTick(dt) {
  stopBudget = Math.min(1, stopBudget + dt * 0.9);
  shakeBudget = Math.min(1, shakeBudget + dt * 1.4);
}

/**
 * Reset per-FRAME budgets. Called from the render pass, not the sim step: the
 * shockwave slots age on real rendered time, so a fast-forwarded sim that never
 * renders must not be allowed to issue a second one.
 */
export function frameReset() {
  wavesThisTick = 0;
}

/**
 * ENGINE BUG WORKAROUND. postfx.shockwave() picks a ring slot by "oldest first",
 * but the comparison is `> oldest` starting at 0, so when all four slots have
 * t === 0 — four shockwaves inside a single frame — nothing is ever selected and
 * it dereferences null. One per rendered frame is plenty and cannot trip it.
 * Filed as a REQUEST in HANDOFF.md.
 */
export function shockwave(R, x, y, strength, opt) {
  if (wavesThisTick >= 1) return;
  wavesThisTick++;
  R.fx.shockwave(x, y, strength, opt);
}

export function hitstop(R, seconds, scale) {
  const s = Math.min(seconds, seconds * stopBudget);
  if (s < 0.006) return;
  stopBudget = Math.max(0, stopBudget - s * 3.2);
  R.fx.timeScale(scale === undefined ? 0.06 : scale, s);
}

export function shake(R, strength, seconds) {
  const s = strength * (0.35 + 0.65 * shakeBudget);
  shakeBudget = Math.max(0, shakeBudget - strength * 0.55);
  R.fx.shake(s, seconds === undefined ? 0.38 : seconds);
}

/* ------------------------------------------------------------------ *
 * Reusable emit descriptors. P.emit reads every field it needs, so a
 * module-level object mutated in place keeps the hot path allocation-free.
 * ------------------------------------------------------------------ */

const eA = { x: 0, y: 0, count: 1, vx: 0, vy: 0, speed: 0, speedVar: 0, vSpread: Math.PI, life: 0.5, lifeVar: 0, size: 8, sizeVar: 0, sizeEnd: 1, color: [1, 1, 1, 1], color2: [1, 1, 1, 0], gravity: 0, drag: 0, add: false, layer: LAYER.FX, tex: undefined, glow: 0, stretch: 0, collide: false, bounce: 0.35, fadeIn: 0, jitter: 0, spin: 0, spinVar: 0 };
const cA = [1, 1, 1, 1], cB = [1, 1, 1, 0];

/** Fill the shared descriptor. Always set every field a caller might rely on. */
function E(x, y, count) {
  eA.x = x; eA.y = y; eA.count = count;
  eA.vx = 0; eA.vy = 0; eA.speed = 0; eA.speedVar = 0; eA.vSpread = Math.PI;
  eA.life = 0.5; eA.lifeVar = 0; eA.size = 8; eA.sizeVar = 0; eA.sizeEnd = 1;
  // MUST be undefined, not null: particles.js only falls back to R.blob on
  // `undefined`, and a null texture handle draws as a hard white quad.
  eA.gravity = 0; eA.drag = 0; eA.add = false; eA.layer = LAYER.FX; eA.tex = undefined;
  eA.glow = 0; eA.stretch = 0; eA.collide = false; eA.bounce = 0.35; eA.fadeIn = 0;
  eA.jitter = 0; eA.spin = 0; eA.spinVar = 0;
  eA.color = cA; eA.color2 = cB;
  return eA;
}
function col(a, r, g, b, alpha) { a[0] = r; a[1] = g; a[2] = b; a[3] = alpha; return a; }

export { E as emitDesc, col as setColor, cA as colA, cB as colB };

/* ------------------------------------------------------------------ *
 * Set pieces every spell uses
 * ------------------------------------------------------------------ */

/**
 * Anticipation. Motes converge on the cast point over `t01` of the wind-up, so
 * the player reads "something is coming" before anything leaves Rook's hands.
 */
export function windup(world, x, y, school, t01, power) {
  const P = world.P, s = SCHOOL[school] || SCHOOL.fire;
  const p = power === undefined ? 1 : power;
  const ring = 90 * p * (1 - t01 * 0.75) + 14;
  const e = E(x, y, 2);
  e.vSpread = Math.PI;
  e.speed = -ring * 2.6;          // negative speed = inbound
  e.speedVar = ring * 0.5;
  e.life = 0.16 + t01 * 0.1;
  e.size = 5 * p; e.sizeEnd = 1.5;
  e.add = true; e.glow = 0.10; e.drag = 0.4;
  e.color = col(cA, s.hot[0], s.hot[1], s.hot[2], 0.9);
  e.color2 = col(cB, s.base[0], s.base[1], s.base[2], 0);
  P.emit(e);
  world.R.light({
    x, y, radius: 120 * p * (0.4 + t01 * 0.8),
    r: s.base[0], g: s.base[1], b: s.base[2],
    intensity: 0.35 * p * t01 * t01, flicker: 0.2,
  });
}

/** The moment of release: a hard flash, a ring, a light pop. */
export function castFlash(world, x, y, school, power, dirX, dirY) {
  const P = world.P, R = world.R, s = SCHOOL[school] || SCHOOL.fire;
  const p = power === undefined ? 1 : power;

  let e = E(x, y, Math.round(10 + 14 * p));
  e.speed = 260 * p; e.speedVar = 200 * p;
  if (dirX !== undefined) { e.vx = dirX; e.vy = dirY; e.vSpread = 0.9; }
  e.life = 0.24; e.lifeVar = 0.14;
  e.size = 9 * p; e.sizeEnd = 0.5; e.drag = 5;
  e.add = true; e.glow = 0.2; e.stretch = 1.4;
  e.color = col(cA, s.hot[0], s.hot[1], s.hot[2], 1);
  e.color2 = col(cB, s.base[0], s.base[1], s.base[2], 0);
  P.emit(e);

  e = E(x, y, 1);
  e.life = 0.16; e.size = 26 * p; e.sizeEnd = 150 * p;
  e.add = true; e.tex = R.disc;
  e.color = col(cA, s.hot[0], s.hot[1], s.hot[2], 0.55);
  e.color2 = col(cB, s.base[0], s.base[1], s.base[2], 0);
  P.emit(e);

  R.light({ x, y, radius: 300 * p, r: s.base[0], g: s.base[1], b: s.base[2], intensity: 1.5 * p });
}

/**
 * Impact. The full checklist in one call: hitstop, shake, flash, radial burst,
 * material-correct chips, a ground decal and a light pop.
 *
 * @param power 0..2 — 0.4 for a bolt tick, 1 for a solid hit, 2 for a meteor.
 */
export function impact(world, x, y, dirX, dirY, school, power, material) {
  const P = world.P, R = world.R, s = SCHOOL[school] || SCHOOL.fire;
  const p = power;

  if (material !== undefined && material !== null) {
    world.materialFx(material, x, y, dirX || 0, dirY || -1, Math.min(2, p * 1.1));
  }

  let e = E(x, y, Math.round(8 + 26 * p));
  e.speed = 300 * p + 120; e.speedVar = 260 * p;
  if (dirX) { e.vx = -dirX; e.vy = -dirY; e.vSpread = 1.25; }
  e.life = 0.3 + 0.3 * p; e.lifeVar = 0.22;
  e.size = 7 + 8 * p; e.sizeEnd = 0.5;
  e.drag = 3.2; e.gravity = 260; e.add = true; e.glow = 0.25; e.stretch = 1.8;
  e.collide = true; e.bounce = 0.3;
  e.color = col(cA, s.hot[0], s.hot[1], s.hot[2], 1);
  e.color2 = col(cB, s.dark[0], s.dark[1], s.dark[2], 0);
  P.emit(e);

  // the ring — cheap, and it is what sells the hit at 25% size
  e = E(x, y, 1);
  e.life = 0.2 + 0.1 * p; e.size = 20 * p + 12; e.sizeEnd = (170 * p + 40);
  e.add = true; e.tex = R.disc;
  e.color = col(cA, s.base[0], s.base[1], s.base[2], 0.5);
  e.color2 = col(cB, s.dark[0], s.dark[1], s.dark[2], 0);
  P.emit(e);

  R.light({ x, y, radius: 200 + 320 * p, r: s.base[0], g: s.base[1], b: s.base[2], intensity: 1.1 + p });

  if (p >= 0.75) {
    hitstop(R, 0.02 + 0.035 * p);
    shake(R, 0.12 * p, 0.24 + 0.1 * p);
    R.fx.flash(s.base[0], s.base[1], s.base[2], 0.05 * p, 0.09);
  }
  if (p >= 1.5) {
    shockwave(R, x, y, Math.min(1.4, p * 0.7));
    R.fx.chroma(0.5 * p, 0.28);
  }
}

/** A stretched glowing streak — the shape every projectile core is built from. */
export function drawBolt(R, x, y, dirX, dirY, len, wide, color, alpha, layer) {
  const rot = Math.atan2(dirY, dirX);
  R.sprite({
    tex: R.streak, x, y, w: wide, h: len, rot: rot + Math.PI * 0.5,
    r: color[0], g: color[1], b: color[2], a: alpha,
    layer: layer === undefined ? LAYER.FX : layer, add: true,
  });
}

/** Soft additive orb with a hot core. Reads as light, not as a sprite. */
export function drawOrb(R, x, y, size, color, alpha, coreBoost) {
  R.sprite({ tex: R.blob, x, y, w: size * 2.4, h: size * 2.4, r: color[0], g: color[1], b: color[2], a: alpha * 0.5, layer: LAYER.FX, add: true });
  R.sprite({ tex: R.disc, x, y, w: size, h: size, r: Math.min(1, color[0] + (coreBoost || 0.3)), g: Math.min(1, color[1] + (coreBoost || 0.3)), b: Math.min(1, color[2] + (coreBoost || 0.3)), a: alpha, layer: LAYER.FX, add: true });
}

/** Jagged polyline between two points, written into a shared buffer. */
const boltPts = new Float32Array(64);
export function jagged(rng, x0, y0, x1, y1, segs, amp) {
  const n = Math.min(segs, 30);
  const ddx = x1 - x0, ddy = y1 - y0;
  const nx = -ddy, ny = ddx;
  const L = Math.hypot(ddx, ddy) || 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = Math.sin(t * Math.PI) * amp;
    const o = (rng.next() * 2 - 1) * w;
    boltPts[i * 2] = x0 + ddx * t + (nx / L) * o;
    boltPts[i * 2 + 1] = y0 + ddy * t + (ny / L) * o;
  }
  return n;
}
export function drawJagged(R, n, color, alpha, thick, layer) {
  for (let i = 0; i < n; i++) {
    R.line(boltPts[i * 2], boltPts[i * 2 + 1], boltPts[i * 2 + 2], boltPts[i * 2 + 3],
      thick, { r: color[0], g: color[1], b: color[2], a: alpha },
      layer === undefined ? LAYER.FX : layer, { add: true });
  }
}
export { boltPts };

/** Ground contact point below (x,y): used to drop decals onto real ground. */
export function groundUnder(world, x, y, maxDist) {
  const g = world.groundY(x, y, maxDist === undefined ? 400 : maxDist);
  return Number.isNaN(g) ? NaN : g;
}

/** Scorch a real ground point. No-op in mid-air, which is what you want. */
export function scorch(world, x, y, radius, strength, tint) {
  const gy = groundUnder(world, x, y, 260);
  if (Number.isNaN(gy)) return;
  const c = tint || [0.10, 0.085, 0.08];
  world.terrain.scorch(x, gy - 2, radius, strength);
  splat(world.rng, x, gy - 3, radius * 0.8, [c[0], c[1], c[2], 0.72 * strength], 4, { life: 240, hold: 0.85 });
}
