/**
 * Entities: the roster, the pool, and the world tick that ties flight, guns,
 * damage and AI together.
 *
 * Everything is pooled and nothing is allocated in the tick. The one non-obvious
 * piece is how an aircraft slot is RECYCLED: `createFlight` and `createPilot`
 * both fork an RNG off `ctx.rng` once, at construction, and P4's flight object
 * has no reset. So each slot hands them an RNG **it keeps a reference to** and
 * reseeds between rounds, and a short neutral "quench" flight drains the closure
 * timers (limiter hold, greyout, roll assist, stall bias) that no outside caller
 * can reach. Both are measured rather than assumed — `tools/sim.mjs --recycle`
 * runs the same duel isolated and in sequence and requires identical hashes.
 *
 * SI throughout. Pure: no DOM, no clock, no Math.random.
 */

import { createRNG } from '../core/rng.js';
import { G_SI, RHO0, AGILITY_MARGIN, makeAirframe, AIRFRAME_BY_ID, REFERENCE } from '../data/tables.js';
import { createFlight } from './flight.js';
import { createPilot } from './pilot.js';
import { makeHP, cloneAirframe, refit, updateDamage, aircraftCollision, groundContact,
         HULL_M, HP_REF, WRECK } from './damage.js';
import { makeGun, updateGun, updateBullets, GUN_BY_ID, GUNS, offNose, leadPoint } from './weapons.js';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------- the roster -- */
/**
 * DESIGN §5.1, in SI. `CD0` is NOT authored: it is fitted from the declared
 * level top speed, because §5.1 gives `m / S / T0 / V_max` and those four
 * over-determine it. Same for the flutter coefficient, which is fitted to
 * R-08's `terminal = Vne x 1.02-1.05`. Anything hand-typed here would be a
 * fifth number that disagrees with the other four.
 *
 * cols: id, name, structure, m, S, T0, vmax, kInd, omLo(deg), stress, role
 */
const ROSTER_SI = [
  ['kestrel', 'Kestrel scout',   60,   530,  18.0, 2050, 52, 0.0700,  92, 1.00, 'turner'],
  ['wasp',    'Wasp scout',      55,   495,  17.0, 2500, 62, 0.0690,  86, 1.02, 'energy'],
  ['shrike',  'Shrike triplane', 80,   570,  21.0, 2700, 55, 0.0620, 108, 1.06, 'turner'],
  ['drover',  'Drover two-seat', 190,  980,  32.0, 3100, 46, 0.0740,  72, 0.92, 'steady'],
  ['ox',      'Ox transport',    320, 2100,  58.0, 4200, 38, 0.0800,  55, 0.80, 'steady'],
  ['marlin',  'Marlin bomber',   420, 3400,  74.0, 6000, 42, 0.0790,  60, 0.80, 'steady'],
  ['nightjar', 'Nightjar bomber', 380, 3000, 66.0, 5200, 40, 0.0790,  65, 0.82, 'steady'],
  ['anvil',   'Anvil (armoured)', 340,  900, 27.0, 3000, 48, 0.0760,  70, 0.76, 'steady'],
];

/** DESIGN §5.1's gun column, where it does not match a player tier exactly. */
const ROSTER_GUNS = {
  kestrel:  { guns: 1, dmg: 4, rate: 7,  range: GUNS.rangeEff, ammo: 600 },
  wasp:     { guns: 1, dmg: 5, rate: 8,  range: GUNS.rangeEff, ammo: 600 },
  shrike:   { guns: 2, dmg: 5, rate: 8,  range: GUNS.rangeEff, ammo: 700 },
  drover:   { guns: 1, dmg: 5, rate: 7,  range: GUNS.rangeEff, ammo: 600 },
  ox:       { guns: 0, dmg: 0, rate: 1,  range: GUNS.rangeEff, ammo: 0 },
  marlin:   { guns: 0, dmg: 0, rate: 1,  range: GUNS.rangeEff, ammo: 0 },
  nightjar: { guns: 0, dmg: 0, rate: 1,  range: GUNS.rangeEff, ammo: 0 },
  // §5.3 A5 "only ever accepts head-on merges and WANTS the trade". A trade he
  // loses is not a trade; with an ordinary scout gun the merge was the player's
  // best move and refusing it — his stated counter — measured -18 points.
  anvil:    { guns: 2, dmg: 7, rate: 10, range: GUNS.rangeEff, ammo: 900 },
};

/** §5.1's rear gunners. An arc, not a cone, and it is why you never sit at six. */
const ROSTER_TURRETS = {
  drover:   [{ arc: 200 * DEG, bearing: Math.PI, dmg: 4, rate: 6, ammo: 400 }],
  ox:       [{ arc: 180 * DEG, bearing: Math.PI, dmg: 4, rate: 6, ammo: 400 },
             { arc: 180 * DEG, bearing: 0,       dmg: 4, rate: 6, ammo: 400 }],
  marlin:   [{ arc: 180 * DEG, bearing: Math.PI, dmg: 5, rate: 6, ammo: 500 },
             { arc: 180 * DEG, bearing: 0,       dmg: 5, rate: 6, ammo: 500 },
             { arc: 200 * DEG, bearing: Math.PI, dmg: 5, rate: 6, ammo: 500 }],
  nightjar: [{ arc: 180 * DEG, bearing: Math.PI, dmg: 5, rate: 6, ammo: 500, noTracer: true },
             { arc: 180 * DEG, bearing: 0,       dmg: 5, rate: 6, ammo: 500, noTracer: true }],
};

/** Level-flight fit. T = D at V_max, with the induced term at that speed removed. */
function fitCD0(m, S, T0, vmax, CLmax, kInd) {
  const q = 0.5 * RHO0 * vmax * vmax;
  const CL = (m * G_SI) / (q * S);
  return Math.max(0.02, T0 / (q * S) - kInd * CL * CL);
}

/** R-08: the flutter term is whatever makes the powered vertical terminal land on Vne x 1.035. */
function fitFlutter(m, S, T0, CD0, vne) {
  const v = vne * 1.035;
  const u = (v - 70) / 40;
  if (u <= 0) return 0;
  const need = (T0 + m * G_SI) / (0.5 * RHO0 * v * v * S * CD0);
  return Math.max(0, (need - 1) / (u * u));
}

function buildEnemyAirframe(row) {
  const [id, name, structure, m, S, T0, vmax, kInd, omLoDeg, stress] = row;
  const CLmax = 1.459;
  const CD0 = fitCD0(m, S, T0, vmax, CLmax, kInd);
  const vne = vmax * 1.51;
  const cFlutter = fitFlutter(m, S, T0, CD0, vne);
  const omLo = omLoDeg * DEG;
  return makeAirframe({ id, name, m, S, CLmax, CD0, kInd, T0, vne, cFlutter,
                        stressLimit: stress, am: AGILITY_MARGIN, omLo, omHi: omLo * 0.705 });
}

export const ENEMY_TYPES = Object.freeze(ROSTER_SI.map(row => {
  const [id, name, structure, m, S, T0, vmax, kInd, omLoDeg, stress, role] = row;
  return Object.freeze({
    id, name, structure, role, vmaxDeclared: vmax,
    airframe: buildEnemyAirframe(row),
    gun: ROSTER_GUNS[id] || null,
    turrets: ROSTER_TURRETS[id] || null,
    armour: id === 'anvil' ? 0.62 : 1,          // §5.3 A5: armoured, and it is the whole ace
    gasbag: false,
  });
}));
export const ENEMY_BY_ID = Object.freeze(Object.fromEntries(ENEMY_TYPES.map(t => [t.id, t])));

/** Player-side aircraft are P4's airframes; the roster wraps them the same way. */
export function playerType(airframeId = 'kite_b1', gunTier = 't2') {
  const af = AIRFRAME_BY_ID[airframeId] || REFERENCE;
  return { id: 'player:' + af.id, name: af.name, structure: HP_REF.structure, role: 'player',
           airframe: af, gun: { ...GUN_BY_ID[gunTier] }, turrets: null, armour: 1, gasbag: false,
           vmaxDeclared: 0 };
}

/* ------------------------------------------------------------------ pool --- */

const POOL_AIRCRAFT = 16;
const POOL_BULLETS = 512;
const POOL_CHUTES = 8;
const QUENCH_SECS = 1.0;
/** Isolation switch for the harness: force every AI onto one P4 pilot tier. */
export let TIER_FORCE = '';
export const setTierForce = (t) => { TIER_FORCE = t || ''; return TIER_FORCE; };
const DT_FIXED = 1 / 60;

function makeEntity(i) {
  return {
    slot: i, id: '', alive: false, side: 1, type: null,
    flight: null, pilot: null, pilots: null, ai: null, gun: null, turrets: null,
    hp: makeHP(220), hpMax: makeHP(220),
    armour: 1, gasbag: false, objective: false,
    dead: false, state: 'PATROL', spin: 0, wingOff: false, bailed: false,
    burning: false, fireT: 0, blowT: 0, fireOut: false, leak: false, pilotHit: false,
    flightHP: 0, tookDamage: 0, lastHitBy: '', lastHitT: 99,
    target: null, shootingAt: '', wantsFire: true,
    shotsFired: 0, hits: 0, kills: 0,
    morale: 0.7, moraleBase: 0.7, k: 0.6, aggro: 1,
    leaderId: '', formSlot: 0, fled: false, grudge: 0,
    // P6: §4.5's ladder multiplies enemy gun damage; §4.7's carry count is read
    // by ace A9's target filter. Carry MASS is deferred to P14 — see P6_NOTES §9.
    dmgMult: 1, carrying: 0, special: '', specialAmmo: 0,
    born: 0, lived: 0, wasDead: false,
  };
}

export function createWorld(ctx = {}, opts = {}) {
  const rng = ctx.rng || createRNG(1);
  const alloc = { aircraft: 0, bullets: 0, chutes: 0, airframes: 0 };

  const aircraft = [];
  const freeSlots = [];
  for (let i = 0; i < POOL_AIRCRAFT; i++) { const e = makeEntity(i); alloc.aircraft++; aircraft.push(e); freeSlots.push(e); }

  const bullets = [];
  for (let i = 0; i < POOL_BULLETS; i++) {
    alloc.bullets++;
    bullets.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, dmg: 0, inc: 1, side: 1, owner: '' });
  }
  let bulletCursor = 0;

  const chutes = [];
  for (let i = 0; i < POOL_CHUTES; i++) { alloc.chutes++; chutes.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, id: '', cut: false }); }

  const byIdMap = new Map();
  let idSeq = 0;

  const world = {
    ctx, rng, alloc, aircraft, bullets, chutes,
    t: 0, dt: DT_FIXED,
    live: [],                       // live aircraft, rebuilt in place each tick
    /**
     * The arena. `js/sim/world.js` (P9) owns wind and terrain; these are the
     * three environment facts a DUEL needs and DESIGN §7.5 specifies them, so
     * the mode supplies them rather than a world module that does not exist.
     */
    arena: { cloudLo: -560, cloudHi: -420, dark: false, updrafts: null, lineX: 1000, halfW: 1000 },
    stats: { fled: 0, killed: 0, bailed: 0, silkShot: 0 },
    blooded: false,
    /**
     * P6. `js/sim/crates.js` installs itself here (`createCrateField(world)`),
     * and the four hook points below are the whole of its coupling to the world
     * tick: the crate physics, the gun candidate list, the bullet pass and the
     * framing box. `crateMoraleFloor` is §4.5's ladder step 4 — "enemy morale
     * floor rises by 0.15" — read by `ai.js`'s flee decision.
     */
    crates: null,
    crateMoraleFloor: 0,
  };

  world.byId = (id) => byIdMap.get(id) || null;

  world.takeBullet = () => {
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[(bulletCursor + i) % bullets.length];
      if (!b.alive) { bulletCursor = (bulletCursor + i + 1) % bullets.length; return b; }
    }
    return null;
  };

  /** Recycle a slot. Quench first, then reseed, then seat the state. */
  function seat(e, type, o) {
    const af = e.af || (e.af = {});
    cloneAirframe(type.airframe, af);
    if (!e.flight) {
      // one flight object and one pilot per slot, for the life of the world
      e.rngFlight = createRNG(1); e.rngPilot = createRNG(1); e.rngAI = createRNG(1);
      e.flight = createFlight({ rng: { fork: () => e.rngFlight } }, { airframe: af, id: 'slot' + e.slot });
      const pctx = { rng: { fork: () => e.rngPilot } };
      e.pilots = {
        novice:    createPilot(pctx, { tier: 'novice',    id: 'slot' + e.slot }),
        competent: createPilot(pctx, { tier: 'competent', id: 'slot' + e.slot }),
        ace:       createPilot(pctx, { tier: 'ace',       id: 'slot' + e.slot }),
      };
    } else {
      quench(e);
    }
    const seed = (rng.next() * 0xffffffff) >>> 0;
    e.rngFlight.reseed(seed ^ 0x9e3779b9);
    e.rngPilot.reseed(seed ^ 0x85ebca6b);
    e.rngAI.reseed(seed ^ 0xc2b2ae35);
    e.rng = e.rngAI;

    const f = e.flight;
    f.sx = o.xM ?? 0; f.sy = o.yM ?? -400;
    const v = o.speed ?? 40;
    f.theta = o.theta ?? 0;
    f.svx = Math.cos(f.theta) * v; f.svy = Math.sin(f.theta) * v;
    // `roll` is which SIDE the canopy is on, not a boolean "upright". P4's
    // `inverted` test is `roll * cos(theta) < 0`, so an aeroplane spawned flying
    // LEFT with roll = +1 is upside down. Every hostile in the duel starts
    // heading -x, so the first version of this spawned every single opponent
    // inverted and then made it spend a second of the merge rolling upright —
    // a silent, systematic bias in favour of the player in every duel measured.
    f.roll = o.roll ?? (Math.cos(f.theta) >= 0 ? 1 : -1);
    f.q = 0; f.fuel = o.fuel ?? 100; f.fuelOut = false;
    f.throttle = 1; f.stalled = false; f.stallCount = 0;
    f.limiterOn = true; f.limiterReleased = false;
    f.greyout = 0; f.blackout = 0; f.lag = 0; f.inverted = false; f.rolling = false;
    f.overVneHP = 0; f.overStressHP = 0; f.damageHP = 0;
    f.tailGone = false; f.engineOut = false;
    f.stress = 0; f.stressPeak = 0; f.alpha = 0; f.alphaW = 0; f.n = 1;
    f.axisY = 0; f.axisX = 0;
    f.setInput(0, 0);
    f.update(1e-6);

    e.id = o.id || (type.id + '#' + (++idSeq));
    e.side = o.side ?? 1;
    e.type = type;
    e.armour = type.armour;
    e.gasbag = type.gasbag;
    e.objective = !!o.objective;
    if (o.hp) { for (const k in o.hp) { e.hp[k] = o.hp[k]; e.hpMax[k] = o.hpMax ? o.hpMax[k] : o.hp[k]; } }
    else { makeHP(type.structure, e.hp); makeHP(type.structure, e.hpMax); }
    e.gun = type.gun && type.gun.guns > 0
      ? makeGun('t1', { coolHand: !!o.coolHand, coneHalf: o.coneHalf })
      : null;
    if (e.gun) { e.gun.tier = type.gun.tier ? type.gun.tier : type.gun; e.gun.ammo = o.ammo ?? type.gun.ammo; }
    e.turrets = type.turrets ? type.turrets.map(t => ({ ...t, cool: 0, ammoLeft: t.ammo, acquireT: 0 })) : null;
    e.dead = false; e.state = 'PATROL'; e.spin = 0; e.wingOff = false; e.bailed = false;
    e.burning = false; e.fireT = 0; e.blowT = 0; e.fireOut = false; e.leak = false; e.pilotHit = false;
    e.flightHP = 0; e.tookDamage = 0; e.lastHitBy = ''; e.lastHitT = 99;
    e.target = null; e.shootingAt = ''; e.wantsFire = true;
    e.shotsFired = 0; e.hits = 0; e.kills = 0;
    e.morale = o.morale ?? 0.7; e.moraleBase = e.morale;
    e.k = o.k ?? 0.6; e.aggro = o.aggro ?? 1;
    // P4_NOTES §10.5: the three tiers are what make skill differ at the STICK.
    // `k` on top of that is what makes it differ at the GUN. Both, not one.
    /**
     * P4's three tiers, restored. Both reasons they were quarantined were root
     * causes in `pilot.js` and both are fixed: the roll sign in the load-factor
     * conversion (which made `ace`'s finer stick amplify a heading bias) and
     * `envelope` dividing `nMax` before the stick was solved (which made
     * `novice`'s 0.62 produce a LARGER stick, so the worse pilot out-turned the
     * better one). `--p5fixtures kMonotone` and `tools/lab/sym2.mjs` are the
     * guards; `setTierForce` is the isolation switch that found it.
     */
    e.pilot = TIER_FORCE ? e.pilots[TIER_FORCE]
            : e.k < 0.45 ? e.pilots.novice : e.k < 0.75 ? e.pilots.competent : e.pilots.ace;
    e.pilot.setIntent('level');
    e.pilot.setAxisX(0);
    e.leaderId = o.leaderId || ''; e.formSlot = o.formSlot || 0;
    e.fled = false; e.grudge = o.grudge || 0;
    e.dmgMult = o.dmgMult ?? (world.crates && e.side !== 1 ? world.crates.dmgMult : 1);
    e.carrying = 0; e.special = o.special || ''; e.specialAmmo = o.specialAmmo || 0;
    e.ai = null;
    e.born = world.t; e.lived = 0;
    e.alive = true;
    refit(e);
    byIdMap.set(e.id, e);
    return e;
  }

  /**
   * The closure state P4's flight object owns and nobody outside can reach:
   * `holdT` (limiter release), `greyT`/`blackT`, `uprightT`/`rollT`, `dropT`,
   * `qBias`, `stallCut` and the control-lag buffer. Every one of them decays or
   * clears within a second of neutral, un-stalled flight, so a second of it is
   * a provably sufficient reset. If P4 ever adds `flight.reset()` this goes.
   */
  function quench(e) {
    const f = e.flight;
    f.sy = -600; f.sx = 0; f.theta = 0; f.roll = 1;
    f.svx = 40; f.svy = 0; f.fuel = 1e9;
    f.tailGone = false; f.engineOut = false;
    cloneAirframe(e.af.base || REFERENCE, e.af);
    f.setInput(0, 0);
    const n = Math.round(QUENCH_SECS / DT_FIXED);
    for (let i = 0; i < n; i++) { f.setInput(0, 0); f.update(DT_FIXED); }
  }

  world.spawn = (type, o = {}) => {
    let e = null;
    for (let i = 0; i < aircraft.length; i++) if (!aircraft[i].alive) { e = aircraft[i]; break; }
    if (!e) return null;
    return seat(e, type, o);
  };

  world.despawn = (e) => { e.alive = false; byIdMap.delete(e.id); };

  world.reset = () => {
    for (let i = 0; i < aircraft.length; i++) aircraft[i].alive = false;
    for (let i = 0; i < bullets.length; i++) bullets[i].alive = false;
    for (let i = 0; i < chutes.length; i++) chutes[i].alive = false;
    byIdMap.clear();
    if (world.crates) world.crates.reset();
    world.crateMoraleFloor = 0;
    world.t = 0; idSeq = 0;
    world.stats.fled = 0; world.stats.killed = 0; world.stats.bailed = 0; world.stats.silkShot = 0;
    world.blooded = false;
  };

  /* ------------------------------------------------------------- the tick -- */

  const live = world.live;
  const TGT = { astern: false, range: 0, closure: 0 };

  world.update = (dt) => {
    world.t += dt;
    live.length = 0;
    for (let i = 0; i < aircraft.length; i++) {
      const e = aircraft[i];
      if (!e.alive) continue;
      e.wasDead = e.dead;          // snapshot BEFORE anything can kill it this tick
      live.push(e);
    }

    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      e.lived += dt;
      if (e.dead) { updateWreck(e, dt); continue; }
      if (e.ai) e.ai.update(dt, world, e);
      else if (e.control) e.control(e, dt, world);
      e.pilot.update(dt, e.flight);
      // DESIGN §1.10's anti-overshoot cut needs a target to sit behind, and P4
      // shipped the hook with nothing to feed it. This is that feed.
      const t = nearestAhead(e, live, TGT);
      e.flight.update(dt, t);
      if (world.arena.updrafts) applyUpdraft(e, world.arena, dt);
    }

    if (world.crates) world.crates.update(dt);

    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (e.dead || !e.gun) continue;
      // P6: silk is appended to the candidate list only for a side that is set
      // to engage it, and weapons.js scores it strictly below any aeroplane, so
      // the assist never shoots a canopy while somebody is shooting at you.
      updateGun(world, e, world.crates ? world.crates.targetsFor(e) : live, dt);
    }
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (e.dead || !e.turrets) continue;
      updateTurrets(world, e, live, dt);
    }

    updateBullets(world, dt);
    if (world.crates) world.crates.bulletPass(dt);

    for (let i = 0; i < live.length; i++) updateDamage(live[i], dt, ctx);
    // Deaths are detected once, at the END of the tick, against a snapshot taken
    // at the start. The first version checked inside the damage pass — but the
    // kill happens in `updateBullets`, which runs BEFORE it, so every aircraft
    // was already flagged dead by the time anything looked and the notification
    // never fired once. The flee rate read exactly 0.0% and the morale trace
    // looked perfectly healthy, because the terms that were missing are events.
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (!e.wasDead && e.dead) noticeDeath(e);
    }

    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (live[i].dead && live[j].dead) continue;
        aircraftCollision(live[i], live[j], ctx);
      }
    }
    for (let i = 0; i < live.length; i++) {
      const r = groundContact(live[i], ctx);
      if (r === 'kill' && live[i].dead) world.despawn(live[i]);
    }
    return world;
  };

  /**
   * §5.2's morale table has six terms and two of them — "a wingman dies within
   * 250 m" and "per player kill in the last 15 s" — are events, not per-tick
   * quantities. The first version implemented both as methods and then never
   * called either, so a squadron watched its friends burn without noticing and
   * the flee rate measured exactly 0.0%. Nothing in a per-tick morale trace
   * would have shown it; only counting bug-outs did.
   */
  function noticeDeath(dead) {
    for (let i = 0; i < live.length; i++) {
      const o = live[i];
      if (o === dead || !o.alive || o.dead || !o.ai) continue;
      if (o.side === dead.side) {
        const d = Math.hypot(o.flight.sx - dead.flight.sx, o.flight.sy - dead.flight.sy);
        o.ai.onFriendlyLost(d);
      } else if (dead.lastHitBy && o.side !== dead.side) {
        // a streak is felt by the side being killed, not by the killer's own
      }
    }
    const killer = byIdMap.get(dead.lastHitBy);
    if (killer) {
      for (let i = 0; i < live.length; i++) {
        const o = live[i];
        if (!o.alive || o.dead || !o.ai || o.side === killer.side) continue;
        o.ai.onPlayerKill();
      }
    }
  }

  function updateWreck(e, dt) {
    const f = e.flight;
    f.theta += e.spin * dt * (e.wingOff ? WRECK.wingOffFall : 1);
    f.setInput(0, 0);
    f.update(dt);
    if (f.sy >= 0) { world.stats.killed++; world.despawn(e); }
  }

  function applyUpdraft(e, arena, dt) {
    const w = updraftAt(arena, e.flight.sx, e.flight.sy);
    if (w !== 0) e.flight.sy -= w * dt;    // the air mass carries it; airspeed unchanged
  }

  return world;
}

/** §5.3 A8's authored updraft bands. Visible as rain-streak direction, and yours too. */
export function updraftAt(arena, x, y) {
  const u = arena.updrafts;
  if (!u) return 0;
  for (let i = 0; i < u.length; i++) {
    const b = u[i];
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return b.w;
  }
  return 0;
}

/** Whoever is in front of `e` and closing — the input DESIGN §1.10's throttle cut wants. */
function nearestAhead(e, live, out) {
  const f = e.flight;
  let best = null, bd = 1e9;
  for (let i = 0; i < live.length; i++) {
    const o = live[i];
    if (o === e || !o.alive) continue;
    const dx = o.flight.sx - f.sx, dy = o.flight.sy - f.sy;
    const d = Math.hypot(dx, dy);
    if (d > 120 || d > bd) continue;
    if (Math.abs(offNose(f, o.flight.sx, o.flight.sy)) > 0.6) continue;
    best = o; bd = d;
  }
  if (!best) return null;
  const dx = best.flight.sx - f.sx, dy = best.flight.sy - f.sy;
  const d = Math.max(1e-6, Math.hypot(dx, dy));
  const rvx = f.svx - best.flight.svx, rvy = f.svy - best.flight.svy;
  out.astern = true;
  out.range = d;
  out.closure = (rvx * dx + rvy * dy) / d;
  return out;
}

/* -------------------------------------------------------------- turrets --- */
/**
 * A gunner traverses, so his weapon is an ARC and he points it himself. The
 * rounds are still real projectiles with drop, dispersion and time of flight —
 * the difference between a gunner and the pilot's fixed guns is where the gun
 * can point, not whether the bullets are honest.
 */
const TL = { x: 0, y: 0, t: 0, range: 0 };
function updateTurrets(world, e, live, dt) {
  const f = e.flight;
  for (let i = 0; i < e.turrets.length; i++) {
    const T = e.turrets[i];
    T.cool -= dt;
    let tgt = null, bd = 1e9;
    for (let j = 0; j < live.length; j++) {
      const c = live[j];
      if (c.side === e.side || c.dead || !c.alive) continue;
      const d = Math.hypot(c.flight.sx - f.sx, c.flight.sy - f.sy);
      if (d > GUNS.rangeEff || d > bd) continue;
      const bear = offNose(f, c.flight.sx, c.flight.sy);
      let rel = bear - T.bearing;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > T.arc * 0.5) continue;
      tgt = c; bd = d;
    }
    if (!tgt) { T.acquireT = 0; continue; }
    T.acquireT += dt;
    if (T.acquireT < GUNS.acquire || T.cool > 0 || T.ammoLeft <= 0) continue;
    T.cool = 1 / T.rate;
    T.ammoLeft--;
    e.shotsFired++;
    leadPoint(f, tgt, TL);
    const b = world.takeBullet();
    if (!b) continue;
    const dx = TL.x - f.sx, dy = TL.y - f.sy;
    const th = Math.atan2(dy, dx) + (e.rng ? e.rng.gauss(0, GUNS.dispersion * 1.6) : 0)
             + (e.rng ? e.rng.gauss(0, (1 - e.k) * 0.6 * (Math.PI / 180)) : 0);
    b.x = f.sx; b.y = f.sy;
    b.vx = Math.cos(th) * GUNS.vMuzzle; b.vy = Math.sin(th) * GUNS.vMuzzle;
    b.t = 0; b.life = GUNS.rangeTracer / GUNS.vMuzzle; b.dmg = T.dmg * (e.dmgMult || 1); b.inc = 1;
    b.side = e.side; b.owner = e.id; b.alive = true;
  }
}

/* ------------------------------------------------------- the framing box --- */
/**
 * ARCHITECTURE §4.3.1, rule 18. The sim decides WHICH entities are worth framing
 * and how big their contribution is; `core/camera.js` decides the zoom. Nothing
 * here imports the camera and `lockRange` is passed IN — the camera profile is
 * the single declaration of it, and a second copy in a sim module is exactly the
 * drift D72 cost a whole gate to.
 *
 * Units are WORLD UNITS, because that is what `cam.track` takes.
 */
export const FRAMING = Object.freeze({
  closingWu: 120,        // §4.3.1: a hostile closing faster than this enters the box
  bossSectionWu: 320,    // rule 18: a boss contributes its ENGAGED SECTION only, never the hull
  hullWu: 64,
});

export function framingContributions(world, player, out, lockRangeWu = 1400) {
  out.length = 0;
  if (!player || !player.alive) return out;
  const pf = player.flight;
  const wuOf = (m) => m / 0.15;
  for (let i = 0; i < world.live.length; i++) {
    const e = world.live[i];
    if (e === player || !e.alive || e.side === player.side) continue;
    const f = e.flight;
    const dxWu = wuOf(f.sx - pf.sx), dyWu = wuOf(f.sy - pf.sy);
    const dWu = Math.hypot(dxWu, dyWu);
    if (dWu > lockRangeWu) continue;
    const rvx = wuOf(f.svx - pf.svx), rvy = wuOf(f.svy - pf.svy);
    const closing = dWu > 1e-6 ? -(rvx * dxWu + rvy * dyWu) / dWu : 0;
    const lineOfFire = !e.dead && !!e.gun
      && Math.hypot(f.sx - pf.sx, f.sy - pf.sy) <= e.gun.tier.range
      && Math.abs(offNose(f, pf.sx, pf.sy)) <= e.gun.coneHalf * 1.5;
    if (!lineOfFire && closing <= FRAMING.closingWu) continue;
    const big = e.type && e.type.section ? true : false;
    const size = big ? Math.min(FRAMING.bossSectionWu, e.type.section) : FRAMING.hullWu;
    out.push({ id: e.id, x: wuOf(f.sx), y: wuOf(f.sy), w: size, h: size, weight: 1 });
  }
  // P6 / P5_NOTES §12.4: a contested crate is a framing subject at weight 0, so
  // it widens the box without arming the zoom lock.
  if (world.crates) world.crates.framing(player, out);
  return out;
}
