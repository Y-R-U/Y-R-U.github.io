/**
 * Damage: geometry first, arithmetic second.
 *
 * A bullet hits what it geometrically hits. There is no damage roll, no
 * "chance to hit a component", and no hitbox that is a circle around the
 * aeroplane. Three capsules (fuselage, upper wing, lower wing) plus four
 * sub-rects along the fuselage, and where you shoot from decides what breaks.
 * That is the whole reason six o'clock low is the deadly position, and it is
 * why nothing in the game ever says so.
 *
 * Everything here is SI — metres, m/s, seconds. World units are the renderer's
 * problem (D26).
 *
 * Pure: no DOM, no clock, no Math.random. Randomness arrives as an rng.
 */

import { G_SI, RHO0 } from '../data/tables.js';

/* ------------------------------------------------------------ geometry --- */

/**
 * R-10 gives "upper wing 11.0 x 1.17 m offset -1.17 n, lower wing 10.4 x 1.17 m
 * offset +0.91 n", rescaled from DESIGN §3.1's 8.5 and 8.0. Those are WINGSPANS
 * — a Camel's span is 8.5 m against a 5.7 m fuselage — and this is a side-view
 * game, where a wing is seen edge-on and is one chord long, not one span.
 *
 * Taken literally the set is not merely inaccurate, it deletes a mechanic:
 * capsules 11 m long roof and floor the entire fuselage, so the fuel tank and
 * the pilot can never be hit from ANY aspect, "six o'clock low" becomes
 * identical to "six o'clock", and there is no fire in the game. Measured, both
 * ways — `--colliders span` ships the literal reading and `--combat` prints the
 * component histogram for each. See docs/P5_NOTES.md §2 and the report.
 *
 * Body frame: `bx` forward from the CG, `bn` along the body normal with
 * POSITIVE = the belly side (DESIGN writes the upper wing at -0.9 n, so its `n`
 * already points at the ground; this keeps that convention).
 */
export const HULL_M = 9.6;                       // R-10: 6.0 m x K 1.6, drawn 64 wu

/** The side-view set: chord-length wings where a biplane actually carries them. */
export const COLLIDERS_PROFILE = Object.freeze({
  fuselage: { part: 'fuselage', len: 9.60, thick: 1.82, cx: 0.00, cn: 0.00 },
  wingU:    { part: 'wingU',    len: 5.40, thick: 1.10, cx: +1.00, cn: -1.30 },
  wingL:    { part: 'wingL',    len: 5.00, thick: 1.10, cx: +0.80, cn: +0.95 },
});

/** R-10 read literally. Kept so the difference is a measurement, not an opinion. */
export const COLLIDERS_SPAN = Object.freeze({
  fuselage: { part: 'fuselage', len: 9.60, thick: 1.82, cx: 0.00, cn: 0.00 },
  wingU:    { part: 'wingU',    len: 11.00, thick: 1.17, cx: +0.30, cn: -1.17 },
  wingL:    { part: 'wingL',    len: 10.40, thick: 1.17, cx: +0.10, cn: +0.91 },
});

export let COLLIDERS = COLLIDERS_PROFILE;
let CAPSULES = [COLLIDERS.fuselage, COLLIDERS.wingU, COLLIDERS.wingL];

/** Harness only. Shipped code never calls this; `--colliders span` does. */
export function setColliderSet(name) {
  COLLIDERS = name === 'span' ? COLLIDERS_SPAN : COLLIDERS_PROFILE;
  CAPSULES = [COLLIDERS.fuselage, COLLIDERS.wingU, COLLIDERS.wingL];
  return name === 'span' ? 'span' : 'profile';
}

/**
 * The fuselage sub-rects, in body coordinates, laid out so §3.1's "hit from"
 * column is true of the geometry rather than of a comment: the tank is in the
 * belly aft of the wing (below, astern-low), the pilot sits above it (above,
 * astern-high), the engine is the front third, the tail is the back quarter.
 */
export const SUBRECTS = Object.freeze([
  { part: 'engine', x0: +1.60, x1: +4.80, n0: -0.91, n1: +0.91 },
  { part: 'pilot',  x0: -2.50, x1: +0.70, n0: -0.91, n1: +0.00 },
  { part: 'fuel',   x0: -2.50, x1: -0.95, n0: +0.00, n1: +0.91 },
  { part: 'tail',   x0: -4.80, x1: -2.50, n0: -0.91, n1: +0.91 },
]);

/** Component list, in the order §3.1 tables them. `structure` is not a collider. */
export const COMPONENTS = Object.freeze(['engine', 'wingU', 'wingL', 'tail', 'fuel', 'pilot']);

/**
 * DESIGN §3.1's player column. Every other aircraft scales all seven by
 * `structure / 220`, so a 60 HP Kestrel has a 12.3 HP tail — which is the number
 * that makes C2's time-to-kill work. See docs/P5_NOTES.md §2.
 */
export const HP_REF = Object.freeze({
  structure: 220, engine: 60, wingU: 70, wingL: 70, tail: 45, fuel: 40, pilot: 30,
});

/** A round does its damage to the component AND 35% of it to Structure (§3.1). */
export const SPILL = 0.35;

/** §3.2, and it is the one number §3.1 and §3.2 disagree on. P5_NOTES §2. */
export const ENGINE_LADDER = Object.freeze({ warn: 0.50, weak: 0.25, weakT: 0.75, deadCD0: 0.012 });

export const FIRE = Object.freeze({
  chance: 0.25,          // §3.1: a destroyed tank catches 25% of the time
  dps: 8,                // §3.2: -8 structure/s
  blowSpeed: 70,         // m/s
  blowSecs: 3.0,         // held, consecutively
  fatal: 12.0,           // s. Not out by then and the aircraft is gone.
  leakBurn: 4,           // fuel burn multiplier once the tank is holed
});

export const COLLISION = Object.freeze({
  acDamage: 60, acExchange: 25, radius: 5.2,
  groundKillVy: 12, landGamma: 12 * Math.PI / 180, landSpeed: 26, groundBounce: 45,
});

/** §3.3. One implementation, used by the player and by everything else that flies. */
export const WRECK = Object.freeze({
  spinLo: 220 * Math.PI / 180, spinHi: 420 * Math.PI / 180,
  cd0Mul: 3.2, bailChance: 0.40, wingOffFall: 0.90,
});

/* ---------------------------------------------------------- HP and refit -- */

export function makeHP(structure, out = null) {
  const s = structure / HP_REF.structure;
  const o = out || { structure: 0, engine: 0, wingU: 0, wingL: 0, tail: 0, fuel: 0, pilot: 0 };
  o.structure = structure;
  for (let i = 0; i < COMPONENTS.length; i++) o[COMPONENTS[i]] = HP_REF[COMPONENTS[i]] * s;
  return o;
}

/**
 * The airframe an aircraft is flying is a MUTABLE copy of its type's base, and
 * damage edits it in place. `createFlight` reads `opts.airframe` fresh every
 * tick and never caches a coefficient, so this is the whole of "component damage
 * changes how it flies" — no second flight object, no allocation, and P4's file
 * is untouched.
 */
export function cloneAirframe(base, out = null) {
  const o = out || {};
  for (const k in base) o[k] = base[k];
  o.base = base;
  return o;
}

/** Recompute the derived fields makeAirframe() would have. Called after any refit. */
function rederive(af) {
  af.W = af.m * G_SI;
  af.vs = Math.sqrt(2 * af.W / (RHO0 * af.S * af.CLmax));
  af.t = af.T0 / af.W;
  af.p0 = af.CD0 / af.CLmax;
  af.kappa = af.kInd * af.CLmax;
}

/**
 * §3.1's destroyed effects, applied to the mutable airframe. Idempotent: it
 * always rebuilds from `af.base`, so nothing compounds if it runs twice.
 */
export function refit(ent) {
  const af = ent.af, b = af.base, hp = ent.hp, max = ent.hpMax;
  af.T0 = b.T0; af.CD0 = b.CD0; af.CLmax = b.CLmax; af.stressLimit = b.stressLimit;
  af.m = b.m; af.S = b.S; af.kInd = b.kInd;

  const eFrac = max.engine > 0 ? hp.engine / max.engine : 1;
  if (hp.engine <= 0) { af.T0 = 0; af.CD0 = b.CD0 + ENGINE_LADDER.deadCD0; ent.flight.engineOut = true; }
  else if (eFrac < ENGINE_LADDER.weak) af.T0 = b.T0 * ENGINE_LADDER.weakT;

  if (hp.wingU <= 0) { af.CLmax *= 0.72; af.stressLimit *= 0.60; }
  if (hp.wingL <= 0) { af.CLmax *= 0.85; af.stressLimit *= 0.80; }
  ent.flight.tailGone = hp.tail <= 0;
  rederive(af);
  return af;
}

/* ------------------------------------------------------- falsification --- */
/**
 * P4 put its break-switches on the airframe as `bug`; combat's live on `ctx`,
 * because a gun, a lock and a morale table are not properties of an aeroplane.
 * The forbidden implementation ships INSIDE the module, behind a flag no game
 * ever sets, so it can be measured rather than argued about (D43, D47, D78).
 * `tools/BLESSED_P5.md` records what each one broke.
 */
export const P5_BREAKS = Object.freeze({
  'no-overpenetration': 'damage.js: a destroyed component keeps soaking 65% of every round',
  'no-convergence':     'weapons.js: both gun ports on the boresight, no close-range straddle',
  'hitscan':            'weapons.js: rounds arrive instantly at the target, no drop/lead/dispersion',
  'no-cone':            'weapons.js: the auto-fire cone opens to 90 deg — fire at anything',
  'no-hysteresis':      'weapons.js: the 0.40 s lock hysteresis removed',
  'aim-noise-per-tick': 'ai.js: k-error resampled every tick instead of held per decision',
  'no-morale':          'ai.js: morale never falls, so nothing ever bugs out',
  'no-promotion':       'ai.js: the 2.5 s promotion delay on a dead leader removed',
  'zoom-range':         'weapons.js: gun range scales with ctx.zoom — the forbidden camera coupling',
});
export const bugOf = (ctx) => (ctx && ctx.bug) || '';

/* ------------------------------------------------------ hit allocation ---- */

/**
 * Squared distance between segment AB and segment CD, plus the parameter along
 * AB where it happens. Exact, allocation-free, and the reason bullets do not
 * tunnel: a round covers 7 m in a tick at 420 m/s and the target is 3.25 m tall,
 * so a point-in-shape test at tick resolution would miss most of the hits.
 */
const SEG = { d2: 0, s: 0 };
function seg2seg(ax, an, bx, bn, cx, cn, dx, dn, out) {
  const ux = bx - ax, un = bn - an;
  const vx = dx - cx, vn = dn - cn;
  const wx = ax - cx, wn = an - cn;
  const a = ux * ux + un * un, b = ux * vx + un * vn, c = vx * vx + vn * vn;
  const d = ux * wx + un * wn, e = vx * wx + vn * wn;
  const den = a * c - b * b;
  let s, t;
  if (den < 1e-9) { s = 0; t = c > 1e-9 ? e / c : 0; }
  else { s = (b * e - c * d) / den; t = (a * e - b * d) / den; }
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  // one refinement pass after the clamp, so a clamped s gets the right t
  t = c > 1e-9 ? ((ax + ux * s) - cx) * vx + ((an + un * s) - cn) * vn : 0;
  t = c > 1e-9 ? t / c : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + ux * s - (cx + vx * t), pn = an + un * s - (cn + vn * t);
  out.d2 = px * px + pn * pn; out.s = s;
  return out;
}

const HIT = { part: '', comp: '', bx: 0, bn: 0, s: 0, x: 0, y: 0 };

/** Squared distance from a point to a capsule's axis, in body coordinates. */
function pointCapsule2(px, pn, C) {
  const r = C.thick * 0.5;
  const half = Math.max(0, C.len * 0.5 - r);
  const x0 = C.cx - half, x1 = C.cx + half;
  const cx = px < x0 ? x0 : px > x1 ? x1 : px;
  const dx = px - cx, dn = pn - C.cn;
  return dx * dx + dn * dn;
}

/**
 * Where the bullet ENTERS the capsule, not where it comes closest to the axis.
 *
 * The difference is not academic and it cost a rewrite: a round fired from dead
 * astern travels almost parallel to the fuselage axis, so its distance to that
 * axis is constant and closest-approach is degenerate — it returned s = 0, the
 * step's start, which is usually still outside the aeroplane. Every astern hit
 * was then allocated to bare `structure` and the TAIL, the component that makes
 * six o'clock the deadly place, took no damage in any test. The gunnery bench
 * looked entirely reasonable while measuring the wrong thing.
 */
function capsuleEntry(a0x, a0n, a1x, a1n, C) {
  const r = C.thick * 0.5, r2 = r * r;
  if (pointCapsule2(a0x, a0n, C) <= r2) return 0;
  const half = Math.max(0, C.len * 0.5 - r);
  seg2seg(a0x, a0n, a1x, a1n, C.cx - half, C.cn, C.cx + half, C.cn, SEG);
  if (SEG.d2 > r2) return -1;
  let lo = 0, hi = SEG.s;
  if (hi <= 0) hi = 1;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) * 0.5;
    const px = a0x + (a1x - a0x) * m, pn = a0n + (a1n - a0n) * m;
    if (pointCapsule2(px, pn, C) <= r2) hi = m; else lo = m;
  }
  return hi;
}

/**
 * Trace a bullet's step against one aircraft. Returns the HIT record (reused —
 * copy it if you keep it) or null.
 *
 * `ent` needs `flight` (for sx/sy/theta/roll). Nothing else.
 */
export function traceHit(ent, x0, y0, x1, y1) {
  const f = ent.flight;
  const th = f.theta, s = f.roll >= 0 ? 1 : -1;
  const cf = Math.cos(th), sf = Math.sin(th);
  // body axes: fx forward, px the normal with POSITIVE = belly (world +y when level)
  const d0x = x0 - f.sx, d0y = y0 - f.sy;
  const d1x = x1 - f.sx, d1y = y1 - f.sy;
  const a0x = d0x * cf + d0y * sf, a0n = (-d0x * sf + d0y * cf) * s;
  const a1x = d1x * cf + d1y * sf, a1n = (-d1x * sf + d1y * cf) * s;

  let best = -1, bestCap = null;
  for (let i = 0; i < CAPSULES.length; i++) {
    const C = CAPSULES[i];
    const e = capsuleEntry(a0x, a0n, a1x, a1n, C);
    if (e >= 0 && (best < 0 || e < best)) { best = e; bestCap = C; }
  }
  if (!bestCap) return null;

  HIT.s = best;
  HIT.bx = a0x + (a1x - a0x) * best;
  HIT.bn = a0n + (a1n - a0n) * best;
  HIT.x = x0 + (x1 - x0) * best;
  HIT.y = y0 + (y1 - y0) * best;
  HIT.part = bestCap.part;

  if (bestCap.part !== 'fuselage') { HIT.comp = bestCap.part; return HIT; }
  HIT.comp = 'structure';
  for (let i = 0; i < SUBRECTS.length; i++) {
    const R = SUBRECTS[i];
    if (HIT.bx >= R.x0 && HIT.bx <= R.x1 && HIT.bn >= R.n0 && HIT.bn <= R.n1) { HIT.comp = R.part; break; }
  }
  return HIT;
}

/**
 * Put `dmg` into `comp`.
 *
 * The over-penetration rule is the one that matters and it is not decoration:
 * once a component is at zero it absorbs nothing, so the round's FULL damage
 * goes to Structure. Concentrated fire therefore punches a hole and then bores
 * through, while fire spread across three components is soaked by all three.
 * That is what makes C2's 0.4-0.8 s time-to-kill and the 6-o'clock rule the
 * same fact, and it is what the two-gun convergence straddle costs you inside
 * 40 m. P5_NOTES §2.
 */
export function applyDamage(ent, comp, dmg, ctx = null, byId = '') {
  if (ent.dead) return 0;
  const raw = dmg * (ent.armour || 1);
  const hp = ent.hp;
  const soak = bugOf(ctx) === 'no-overpenetration';
  let toStruct;
  if (comp !== 'structure' && (hp[comp] > 0 || soak)) {
    const before = hp[comp];
    hp[comp] = Math.max(0, before - raw);
    // Overkill carries. A round that takes the last 2 HP off a spar does not
    // stop in mid-air with four points of damage left in it; the rest goes
    // through into the structure behind, which is the same over-penetration
    // rule applied inside a single round instead of between two.
    const excess = soak ? 0 : Math.max(0, raw - before);
    toStruct = (raw - excess) * SPILL + excess;
    if (hp[comp] <= 0) onComponentLost(ent, comp, ctx);
    else if (comp === 'fuel') ent.leak = true;
  } else {
    toStruct = raw;
  }
  hp.structure -= toStruct;
  ent.tookDamage += raw;
  ent.lastHitBy = byId;
  ent.lastHitT = 0;
  if (ctx && ctx.bus) { EV.id = ent.id; EV.by = byId; EV.comp = comp; EV.dmg = raw; ctx.bus.emit(ent.side === 0 ? 'player:damage' : 'gun:hit', EV); }
  if (hp.structure <= 0) kill(ent, ctx, byId);
  return raw;
}
const EV = { id: '', by: '', comp: '', dmg: 0 };

function onComponentLost(ent, comp, ctx) {
  if (comp === 'fuel') {
    ent.leak = true;
    if (!ent.burning && ent.rng && ent.rng.next() < FIRE.chance) { ent.burning = true; ent.fireT = 0; ent.blowT = 0; }
  }
  if (comp === 'pilot') ent.pilotHit = true;
  refit(ent);
}

/** §3.3 WRECK. The aerodynamic model keeps running; only the pilot stops. */
export function kill(ent, ctx = null, byId = '') {
  if (ent.dead) return;
  ent.dead = true;
  ent.hp.structure = Math.min(ent.hp.structure, 0);
  ent.state = 'WRECK';
  const r = ent.rng;
  const mag = WRECK.spinLo + (r ? r.next() : 0.5) * (WRECK.spinHi - WRECK.spinLo);
  ent.spin = mag * (r ? (r.bool() ? 1 : -1) : 1);
  ent.wingOff = ent.hp.wingU <= 0 || ent.hp.wingL <= 0;
  ent.af.CD0 = ent.af.base.CD0 * WRECK.cd0Mul;
  ent.af.T0 = 0;
  ent.flight.engineOut = true;
  rederive(ent.af);
  ent.bailed = ent.side !== 0 && r ? r.next() < WRECK.bailChance : false;
  if (ctx && ctx.bus) { EV.id = ent.id; EV.by = byId; EV.comp = 'structure'; EV.dmg = 0; ctx.bus.emit(ent.side === 0 ? 'player:died' : 'enemy:killed', EV); }
}

/* --------------------------------------------------------------- per-tick -- */

/**
 * The parts of the damage model that run whether or not anyone is shooting:
 * fire, the blow-out window, the leak, and the structural HP the flight model
 * itself accrues from over-stress and over-Vne (P4 exposes it as `damageHP`
 * and says P5 owns the pool).
 */
export function updateDamage(ent, dt, ctx = null) {
  const f = ent.flight;
  const dHP = f.damageHP - ent.flightHP;
  if (dHP > 0) { ent.flightHP = f.damageHP; ent.hp.structure -= dHP; if (ent.hp.structure <= 0) kill(ent, ctx, 'airframe'); }

  if (ent.burning && !ent.dead) {
    ent.fireT += dt;
    if (f.speedSI >= FIRE.blowSpeed) ent.blowT += dt; else ent.blowT = 0;
    if (ent.blowT >= FIRE.blowSecs) { ent.burning = false; ent.fireOut = true; ent.fireT = 0; }
    else {
      ent.hp.structure -= FIRE.dps * dt;
      if (ent.fireT >= FIRE.fatal || ent.hp.structure <= 0) kill(ent, ctx, 'fire');
    }
  }
  if (ent.leak && f.fuel > 0) f.fuel = Math.max(0, f.fuel - 0.45 * (FIRE.leakBurn - 1) * dt);
  ent.lastHitT += dt;
}

/* ------------------------------------------------------------ collisions -- */

export function aircraftCollision(a, b, ctx = null) {
  const fa = a.flight, fb = b.flight;
  const dx = fb.sx - fa.sx, dy = fb.sy - fa.sy;
  const d2 = dx * dx + dy * dy;
  const r = COLLISION.radius;
  if (d2 > r * r) return false;
  const d = Math.sqrt(Math.max(1e-6, d2));
  const nx = dx / d, ny = dy / d;
  applyDamage(a, 'structure', COLLISION.acDamage, ctx, b.id);
  applyDamage(b, 'structure', COLLISION.acDamage, ctx, a.id);
  const ex = nx * COLLISION.acExchange, ey = ny * COLLISION.acExchange;
  fa.svx -= ex; fa.svy -= ey; fb.svx += ex; fb.svy += ey;
  return true;
}

/** §3.4's ground row. Returns 'kill' | 'land' | 'bounce' | null. */
export function groundContact(ent, ctx = null) {
  const f = ent.flight;
  if (f.sy < 0) return null;
  const vy = f.svy, v = f.speedSI;
  const gamma = Math.abs(Math.atan2(f.svy, f.svx));
  if (ent.dead) { kill(ent, ctx, 'ground'); f.sy = 0; f.svx = 0; f.svy = 0; return 'kill'; }
  if (vy > COLLISION.groundKillVy) { applyDamage(ent, 'structure', 1e6, ctx, 'ground'); return 'kill'; }
  if (vy <= COLLISION.groundKillVy && gamma < COLLISION.landGamma && v < COLLISION.landSpeed) {
    f.sy = 0; f.svy = 0; return 'land';
  }
  applyDamage(ent, 'structure', COLLISION.groundBounce, ctx, 'ground');
  f.sy = -0.5; f.svy = -Math.abs(vy) * 0.4;
  return 'bounce';
}

/* ------------------------------------------------------------ ground fire -- */
/**
 * §3.5, as pure functions. P9 owns the batteries that call them; they live here
 * because the arithmetic is damage arithmetic and there must be exactly one copy
 * of it. `altM` is metres above ground, `vRel` the target's speed.
 */
export const smallArmsHit = (altM, vRel) => 0.30 * Math.exp(-altM / 90) * Math.exp(-Math.abs(vRel) / 70);
export const SMALL_ARMS = Object.freeze({ damage: 6, rounds: 5, period: 1.4, ceiling: 250 });
export const FLAK = Object.freeze({
  shells: 4, period: 3.2, floorM: 220, fuseLag: 0.55,
  sigma: (rangeM) => 18 + 0.25 * (rangeM / 100),
  damage: 32, inner: 6, outer: 14,
});
export const flakDamage = (distM) => distM <= FLAK.inner ? FLAK.damage
  : distM >= FLAK.outer ? 0 : FLAK.damage * (1 - (distM - FLAK.inner) / (FLAK.outer - FLAK.inner));

/* ------------------------------------------------------------------ misc -- */

/** Kept here so `refit` and `kill` are the only writers of a derived field. */
export { rederive };
