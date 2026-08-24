/**
 * The parachute crates — D4's signature mechanic, DESIGN §4.
 *
 * A crate is ONE drag body with a pendulum hung under it. That single choice is
 * what makes everything else fall out for free: the same drag law gives the
 * terminal descent, the horizontal relaxation onto the wind (DESIGN §4.2's
 * "~1.3 s time constant" is DERIVED here, not authored — see `tau()`), the
 * curve a shear layer puts in the fall, and the shorter, tighter fall of a crate
 * whose canopy has been cut. Nothing in this file re-declares a number the
 * physics already implies.
 *
 * The three takes, and the whole reason the mechanic exists:
 *
 *   fly through   1.0x, guaranteed, and it costs you 4-10 s of position
 *   cut the silk  1.6x IF it lands friendly-side and does not burst
 *   deny it       0, and the enemy gets nothing — which is often correct
 *
 * The optimum is to cut LOW, which drags the player into the small-arms
 * envelope over the trenches at the altitude where a stall is fatal. That is
 * DESIGN's best decision and it is not softened here.
 *
 * SI throughout, +y DOWN, altitude = -y. Pure: no DOM, no WebGL, no clock, no
 * Math.random, no camera. Nothing allocates after `createCrateField`.
 */

import { noise1 } from '../core/math.js';
import { G_SI, RHO0, H_SCALE } from '../data/tables.js';
import { density } from './aero.js';
import { GUNS } from './weapons.js';
import { applyDamage, bugOf } from './damage.js';

/* ---------------------------------------------------------- the constants -- */
/**
 * Authored in SI. Every derived quantity below is checked against a physical
 * identity by `crateIdentity()` at load, per anti-footgun rule 16 — that is the
 * check that caught D29's 9.5x gravity error and it is cheap.
 *
 * T18, and the one number in DESIGN §4.2 that had to move. §4.2 authors
 * `CdA = 24 m^2` and derives a 7.75 m/s terminal from it. That cannot be right
 * under D28: the canopy deploys as the crate enters reachable sky at 1,500 m and
 * the player gets "~90 s and not ten minutes", and 1,500 m at 7.75 m/s is 193 s.
 * The register itself says T18 is "derived; only `CdA` is a guess", so `CdA` is
 * what moves. ARCHITECTURE §3.4 independently states the descent as 17 m/s over
 * "1,500 m of reachable sky in 88 s" — and 17 m/s is exactly the COLUMN AVERAGE
 * of the value below once the real atmosphere is in the loop, because terminal
 * rises as the air thins. Two documents agree; DESIGN §4.2's `CdA` is the third
 * and it is the one that is wrong.
 */
export const CRATE = Object.freeze({
  m: 90,                  // kg. Load-bearing in TWO other systems — §4.6.2's zeppelin
                          // ballast and §4.7's +90 kg carry weight — so it does not move.
  CdA: 6.951,             // m^2. See above. terminal(SL) = 14.40 m/s, column mean 16.7
  /**
   * DESIGN §4.3's "falls ballistically at ~35 m/s", and this one IS authored to
   * the design rather than to a box.
   *
   * A tumbling 2.44 m box (3.9 m drawn, at K 1.6) has a real CdA near 4 m^2 and
   * would fall at 19 m/s — and that measured out as a mechanic with no teeth: a
   * cut would then save only 30 m of drift on a high cut and the altitude
   * structure of §4.3 collapses. 35 m/s needs CdA 1.18, which is a smaller body
   * than the crate is DRAWN as. That is not a contradiction, it is the same
   * declaration the canopy already makes: **a crate and its canopy are drawn at
   * legibility scale (the 12.6 m silk is a 2.7 m aerodynamic canopy, the 3.9 m
   * box is a 1.3 m aerodynamic body) and their drag areas are authored in SI to
   * the design targets** — exactly as the 9.6 m hull is 6.0 m of aeroplane.
   * ARCHITECTURE §3.4's 50 m/s needs CdA 0.57 and is struck; DESIGN's 35 wins.
   */
  CdACut: 1.177,
  L: 6.0,                 // m, shroud length. T = 2*pi*sqrt(L/g) = 4.914 s (§4.2)
  swing0: 3.0,            // m, initial swing amplitude at deployment
  swingDamp: 0.055,       // 1/s on the amplitude envelope. §4.2 guesses 0.15 — measured,
                          // that leaves a dead canopy after 30 s of a 90 s fall and gate
                          // K6 has nothing to measure. See docs/P6_NOTES.md §3.
  collect: 9.0,           // m, fly-through radius (§4.3). Generous on purpose: a phone.
  silkRounds: 6,          // §4.3: six rounds collapse a canopy...
  boxRounds: 12,          // ...twelve into the box destroy it
  cutHiM: 250,            // m — above this a cut is a "high" cut, T20's 35% burst
  cutLoM: 120,            // m — below this 95% survives
  /**
   * T20, and it MOVED — from §4.3's 0.35 to 0.60 — because the register's own
   * named test for it cannot be passed at 0.35 and the arithmetic is short
   * enough to check by hand. T20's test is "the expected value of a high cut
   * must be BELOW a fly-through". At 0.35:
   *
   *     0.65 x 1.6 + 0.35 x 0.5 = 1.2175      which is above 1.0, not below it
   *
   * and it is worse than a wrong guess, because K3 and K4 are then JOINTLY
   * UNSATISFIABLE on the burst alone: K3 needs the multiplier >= 1.395 and K4
   * needs it < 1.269. No value of T19 satisfies both. Solving for the burst
   * chance that sinks a high cut at T19 = 1.6 gives 0.545; 0.60 clears it with
   * margin and reads as a rule a player learns in one go — cut it high and it
   * probably breaks. `node tools/sim.mjs --evmodel` prints the whole derivation.
   *
   * The alternative the manager may prefer: keep 0.35 and make a burst crate
   * worth 0 rather than 0.5, which needs only 0.375. It is a smaller move on
   * this number and a larger one on §4.3's other one.
   */
  burstHi: 0.60,
  burstLo: 0.05,
  multFly: 1.00,          // §4.3's three values, T19
  multCut: 1.60,
  multBurst: 0.50,
  // Drawn sizes, from ARCHITECTURE §3.4. The colliders are the DRAWN object,
  // exactly as the 9.6 m hull is, because the player shoots at what is on screen.
  boxW: 3.9, boxH: 3.3,
  silkW: 12.6, silkH: 5.0,
  gustHz: 0.08, gustAmp: 0.25, gustNoise: 0.08,   // §4.2's gust term, verbatim
  fallTau: 1.3,           // §4.2's CLAIMED horizontal time constant. NOT used by the sim —
                          // it is the number `tau()` is checked against. See §3 of the notes.
});

/** Terminal descent at an altitude, from the drag identity. Nothing else defines it. */
export const terminalAt = (altM, cut = false) =>
  Math.sqrt(2 * CRATE.m * G_SI / (density(altM) * (cut ? CRATE.CdACut : CRATE.CdA)));

/**
 * The horizontal relaxation time constant, DERIVED. DESIGN §4.2 asserts "about
 * 1.3 s"; this is what the drag law actually gives, and the two agreeing is the
 * corroboration that `CdA` above is not merely a number chosen to pass K1.
 */
export const tau = (altM, cut = false) => {
  const v = terminalAt(altM, cut);
  return 2 * CRATE.m / (density(altM) * (cut ? CRATE.CdACut : CRATE.CdA) * v);
};

export const swingOmega = Math.sqrt(G_SI / CRATE.L);           // rad/s
export const swingPeriod = 2 * Math.PI / swingOmega;           // s

/** §4.4's drop table. Register T22 — `mean` is what §10.3 checks. */
export const CONTENTS = Object.freeze([
  { kind: 'supply',     w: 0.42, scrip: 17, lo: 10, hi: 25 },
  { kind: 'ammo',       w: 0.18, scrip: 8,  rounds: 180 },
  { kind: 'fuel',       w: 0.12, scrip: 6,  fuel: 0.35 },
  { kind: 'parts',      w: 0.12, scrip: 20, repair: 45, component: 0.40 },
  { kind: 'ordnance',   w: 0.08, scrip: 14, special: true },
  { kind: 'intel',      w: 0.05, scrip: 10, reveal: true },
  { kind: 'contraband', w: 0.03, scrip: 75, lo: 60, hi: 90, marks: true },
].map(Object.freeze));

export const CONTENT_BY_KIND = Object.freeze(Object.fromEntries(CONTENTS.map(c => [c.kind, c])));

/** §4.4's expected Scrip-equivalent. Computed from the table, never typed. */
export const CRATE_EV = CONTENTS.reduce((s, c) => s + c.w * c.scrip, 0);   // 15.57

/** §6's per-act multiplier on everything a crate is worth. */
export const ACT_MULT = Object.freeze([1.0, 1.0, 1.6, 2.4, 3.4, 4.6]);

/**
 * §4.5, register T21. When the ENEMY banks a crate it is a live reinforcement,
 * not a number on a ledger. This is the whole reason a crate is a battlefield
 * objective rather than a shop, and it is what makes denial correct.
 */
export const LADDER = Object.freeze([
  { step: 1, spawn: 'kestrel', delay: 8 },
  { step: 2, dmgMult: 1.12 },
  { step: 3, spawn: 'drover',  delay: 8 },
  { step: 4, spawn: 'wasp',    delay: 8, moraleFloor: 0.15 },
]);

/**
 * §3.5's small-arms curve, register T17. It lives here rather than in a world
 * module because it is the COST SIDE of the canopy-cut play and gate K3 cannot
 * be measured without it: the 1.6x exists to drag the player into this envelope.
 * `js/sim/world.js` (P9) should adopt it; see docs/P6_NOTES.md §9.
 */
export const SMALL_ARMS = Object.freeze({
  p0: 0.30, altScale: 90, velScale: 70,     // 0.30 * e^(-alt/90) * e^(-|v|/70)
  dmg: 6, burst: 5, period: 1.4,
  ceilM: 250,                               // §3.5: above this they do not reach at all
  reachM: 400,                              // slant range of an MG nest
});

export const smallArmsP = (altM, speed) =>
  altM > SMALL_ARMS.ceilM ? 0
    : SMALL_ARMS.p0 * Math.exp(-altM / SMALL_ARMS.altScale) * Math.exp(-Math.abs(speed) / SMALL_ARMS.velScale);

/** Where ground fire lands. Ground fire comes from BELOW, so the belly takes it. */
const GF_COMPONENTS = ['structure', 'structure', 'structure', 'wingL', 'fuel', 'engine', 'pilot'];

/* ------------------------------------------------------------ the identity -- */
/**
 * Rule 16. Every derived number above, re-derived a different way, and the
 * column integrated in closed form so a divergence from the measured fall shows
 * up as a disagreement rather than as a plausible number.
 *
 *   dz/dt = v_SL * exp(z / 2H)      (terminal scales as 1/sqrt(sigma))
 *   t     = (2H / v_SL) * (1 - exp(-z / 2H))
 */
export function crateIdentity() {
  const vSL = terminalAt(0);
  const q = 0.5 * RHO0 * CRATE.CdA * vSL * vSL;      // drag at terminal, sea level
  const H = H_SCALE, z = 1500;
  const tCol = (2 * H / vSL) * (1 - Math.exp(-z / (2 * H)));
  return {
    vTermSL: vSL,
    dragAtTerminal: q, weight: CRATE.m * G_SI,        // must be equal
    balance: Math.abs(q - CRATE.m * G_SI),
    vTerm1500: terminalAt(1500),
    columnMean: z / tCol,                              // ARCHITECTURE §3.4 says 17 m/s
    columnSecs: tCol,                                  // D28 says ~90 s
    tauSL: tau(0), tauDesign: CRATE.fallTau,           // DESIGN §4.2 says ~1.3 s
    swingPeriod, swingDesign: 4.9,
    vTermCutSL: terminalAt(0, true),
    crateEV: CRATE_EV,
  };
}

/* ------------------------------------------------------------------- wind -- */
/**
 * A per-level piecewise-linear altitude table, `[[altM, vxMS], ...]` low to
 * high. A crate under canopy relaxes onto the LOCAL wind, so two layers with
 * different winds make a falling crate curve — which is what turns §4.6.1's
 * "The Shear" into a decision instead of flavour.
 */
export function windAt(profile, altM) {
  const p = profile;
  if (!p || p.length === 0) return 0;
  if (altM <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (altM <= p[i][0]) {
      const a = p[i - 1], b = p[i];
      const t = (altM - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return p[p.length - 1][1];
}

/* ------------------------------------------------------------- the field --- */

const POOL_CRATES = 24;
const DROP_EV = { id: '', kind: '', x: 0, y: 0, altM: 0, owner: '' };
const TAKE_EV = { id: '', kind: '', by: '', how: '', value: 0, mult: 0, altM: 0, x: 0, y: 0 };
const SILK_EV = { id: '', by: '', hits: 0, cut: false, altM: 0 };

function makeCrate(i) {
  return {
    slot: i, alive: false, id: '',
    kind: 'supply', owner: 'neutral', scrip: 0,
    sx: 0, sy: 0, svx: 0, svy: 0,        // the DRAG BODY: canopy while intact, crate once cut
    ph: 0, phd: 0,                        // pendulum angle (rad) and rate
    cut: false, cutAltM: 0, burst: false, landed: false, denied: false,
    silkHits: 0, boxHits: 0, lastHitBy: '',
    t: 0, dropAltM: 0, carriedBy: '', pilot: false,
    contestedBy: '', runnerCount: 0,
  };
}

/**
 * `world.crates = createCrateField(world, opts)`. `entities.js` calls
 * `field.update(dt)` from inside `world.update` and `field.targetsFor(e)` when
 * it builds a shooter's candidate list; everything else here is called by a
 * mode, the AI or the harness.
 */
export function createCrateField(world, opts = {}) {
  const ctx = world.ctx || {};
  const rng = (ctx.rng && ctx.rng.fork) ? ctx.rng.fork('crates') : world.rng;
  const bus = ctx.bus || null;

  const crates = [];
  for (let i = 0; i < POOL_CRATES; i++) crates.push(makeCrate(i));

  /** Duck-typed gun targets. `weapons.js` wants `.flight`, `.hp`, `.side`, `.id`. */
  const silk = [];
  for (let i = 0; i < POOL_CRATES; i++) {
    silk.push({
      crate: null, silk: true, id: '', alive: false, dead: false, side: 0,
      objective: false, shootingAt: '',
      hp: { structure: 1 }, hpMax: { structure: 1 },
      flight: { sx: 0, sy: 0, svx: 0, svy: 0, theta: 0 },
    });
  }
  const candidates = [];        // pooled: live aircraft + eligible silk, rebuilt in place

  const nests = [];             // §3.5 MG nests: { x, side, cool, ammo }
  const pending = [];           // ladder spawns waiting on their delay
  for (let i = 0; i < 12; i++) pending.push({ t: 0, type: '', alive: false });

  const field = {
    crates, silk, nests,
    wind: opts.wind || [[0, 0], [1500, 0]],
    gustPhase: opts.gustPhase ?? (rng ? rng.next() * Math.PI * 2 : 0),
    gustSeed: opts.gustSeed ?? 1337,
    lineX: opts.lineX ?? 0,             // friendly side is x < lineX
    actMult: opts.actMult ?? 1,
    engage: opts.engage || { 1: 'cut', '-1': 'none' },   // per side: 'cut' | 'deny' | 'none'
    groundFire: opts.groundFire !== false,
    stats: { dropped: 0, playerBanked: 0, enemyBanked: 0, denied: 0, burst: 0,
             flyThrough: 0, cutTaken: 0, landedFriendly: 0, landedEnemy: 0,
             value: 0, enemyValue: 0, ladderSteps: 0, silkRounds: 0, gfHits: 0, gfDamage: 0 },
    ladder: 0, moraleFloor: 0, dmgMult: 1,
    t: 0,
  };

  let idSeq = 0;

  /* --------------------------------------------------------------- drops -- */

  field.drop = (o = {}) => {
    let c = null;
    for (let i = 0; i < crates.length; i++) if (!crates[i].alive) { c = crates[i]; break; }
    if (!c) return null;
    c.alive = true;
    c.id = o.id || ('crate#' + (++idSeq));
    c.kind = o.kind || rollKind();
    c.scrip = rollScrip(c.kind);
    c.owner = o.owner || 'neutral';
    c.sx = o.xM ?? 0;
    c.sy = o.yM ?? -1500;
    c.dropAltM = -c.sy;
    // D28: the canopy is ALREADY OPEN when the crate enters reachable sky, so it
    // enters at the local terminal, not from rest. A drop that started at rest
    // would give the player a free five seconds the design does not intend.
    c.svy = o.vy ?? terminalAt(c.dropAltM);
    c.svx = o.vx ?? windAt(field.wind, c.dropAltM);
    c.ph = o.swing ?? (CRATE.swing0 / CRATE.L);       // small-angle: amplitude/L rad
    c.phd = 0;
    c.cut = false; c.cutAltM = 0; c.burst = false; c.landed = false; c.denied = false;
    c.silkHits = 0; c.boxHits = 0; c.lastHitBy = '';
    c.t = 0; c.carriedBy = ''; c.contestedBy = ''; c.runnerCount = 0;
    c.pilot = !!o.pilot;
    if (!c.pilot) field.stats.dropped++;
    if (bus) {
      DROP_EV.id = c.id; DROP_EV.kind = c.kind; DROP_EV.x = c.sx; DROP_EV.y = c.sy;
      DROP_EV.altM = c.dropAltM; DROP_EV.owner = c.owner;
      bus.emit('crate:drop', DROP_EV);
    }
    return c;
  };

  function rollKind() {
    let r = rng ? rng.next() : 0.5, acc = 0;
    for (let i = 0; i < CONTENTS.length; i++) { acc += CONTENTS[i].w; if (r < acc) return CONTENTS[i].kind; }
    return CONTENTS[0].kind;
  }
  function rollScrip(kind) {
    const c = CONTENT_BY_KIND[kind];
    if (c.lo !== undefined && rng) return c.lo + rng.next() * (c.hi - c.lo);
    return c.scrip;
  }

  /* ---------------------------------------------------------- geometry --- */

  /** Where the CRATE is (the thing you catch and the thing you deny). */
  field.crateX = (c) => c.cut ? c.sx : c.sx + CRATE.L * Math.sin(c.ph);
  field.crateY = (c) => c.cut ? c.sy : c.sy + CRATE.L * Math.cos(c.ph);
  /** Where the SILK is (the thing you cut). Null once cut. */
  field.silkX = (c) => c.sx;
  field.silkY = (c) => c.sy;

  /* ---------------------------------------------------------- the tick --- */

  field.update = (dt) => {
    field.t += dt;
    const bug = bugOf(ctx);
    const pinned = bug === 'pin-swing';
    const noShear = bug === 'flat-wind';

    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (!c.alive || c.landed || c.carriedBy) continue;
      c.contestedBy = '';                 // re-asserted by whoever runs for it this tick
      c.t += dt;
      const altM = -c.sy;
      const rho = density(Math.max(0, altM));
      const CdA = c.cut ? CRATE.CdACut : CRATE.CdA;
      const wx = noShear ? windAt(field.wind, 750) : gustyWind(altM);

      // ONE drag law. Terminal, the relaxation onto the wind, and the curve a
      // shear puts in the fall are all this and nothing else.
      const ux = c.svx - wx, uy = c.svy;
      const u = Math.hypot(ux, uy);
      const k = 0.5 * rho * CdA * u / CRATE.m;
      const ax = -k * ux;
      const ay = G_SI - k * uy;
      c.svx += ax * dt;
      c.svy += ay * dt;
      c.sx += c.svx * dt;
      c.sy += c.svy * dt;

      if (!c.cut) {
        if (pinned) { c.ph = 0; c.phd = 0; }
        else {
          // A driven pendulum: the canopy's own horizontal acceleration is the
          // forcing term, so a gust shakes the crate for free and nothing has to
          // "re-excite" it by hand.
          const phdd = -(G_SI / CRATE.L) * Math.sin(c.ph)
                     - (ax / CRATE.L) * Math.cos(c.ph)
                     - 2 * CRATE.swingDamp * c.phd;
          c.phd += phdd * dt;
          c.ph += c.phd * dt;
        }
      }

      if (field.crateY(c) >= 0) land(c);
    }

    // §3.3: "in this WWI-that-never-was parachutes exist (they must — see §4).
    // 40% of downed enemies bail; the canopy drifts with the wind EXACTLY like a
    // crate canopy, same code." So it is the same code: a bailed pilot becomes a
    // body in this field with `pilot` set, and falls, drifts and swings on the
    // one drag law above. P5 shipped `world.blooded` with nothing able to set it
    // "because shooting a canopy needs a canopy"; this is the canopy.
    const live = world.live;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (!e.bailed || e.chuteOut) continue;
      e.chuteOut = true;
      const c = field.drop({ xM: e.flight.sx, yM: Math.min(-30, e.flight.sy), kind: 'supply',
                             owner: e.side === 1 ? 'friendly' : 'enemy', pilot: true, id: 'chute:' + e.id });
      if (c) world.stats.bailed++;
    }

    if (field.groundFire) updateGroundFire(dt);
    updatePending(dt);
    updateCaptures(dt);
    return field;
  };

  /** §4.2's gust, verbatim: a slow breathing term plus a little noise. */
  function gustyWind(altM) {
    const base = windAt(field.wind, Math.max(0, altM));
    const g = 1 + CRATE.gustAmp * Math.sin(2 * Math.PI * CRATE.gustHz * field.t + field.gustPhase)
                + CRATE.gustNoise * (noise1(field.t * 0.55, field.gustSeed) * 2 - 1);
    return base * g;
  }

  /* --------------------------------------------------------- the takes --- */

  /**
   * Fly-through. The radius is on the CRATE, which swings, so an interception
   * has to be timed against the pendulum — that is the whole of K6.
   */
  function updateCaptures(dt) {
    const live = world.live;   // a pilot under silk is not a pickup
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (!c.alive || c.landed || c.carriedBy || c.pilot) continue;
      const cx = field.crateX(c), cy = field.crateY(c);
      for (let j = 0; j < live.length; j++) {
        const e = live[j];
        if (!e.alive || e.dead) continue;
        const d = Math.hypot(e.flight.sx - cx, e.flight.sy - cy);
        // The forbidden camera coupling, shipped so K10 can be WATCHED going red.
        // P4's F14 said its zoom gate "cannot fail by construction" and P5 built
        // the tripwire for gun range; this is the same tripwire for the collect
        // radius, which is the other world constant a crate mission depends on.
        const R = bugOf(ctx) === 'crate-zoom' ? CRATE.collect * (ctx.zoom || 1) : CRATE.collect;
        if (d > R) continue;
        take(c, e, 'flyThrough');
        break;
      }
    }
  }

  /**
   * A crate taken out of the air is 1.0x whether or not its canopy was cut on
   * the way in. That is deliberate and it is what keeps the two takes separate:
   * an incidental cut during a fly-through approach costs six rounds and nothing
   * else, and cutting can never be used to pay a 1.6x on a crate you then catch.
   */
  function take(c, e, how) {
    const side = e.side;
    const mult = CRATE.multFly;
    const value = c.scrip * mult * field.actMult;
    c.alive = false;
    c.carriedBy = e.id;
    if (side === 1) {
      field.stats.playerBanked++; field.stats.flyThrough++; field.stats.value += value;
      applyContents(c, e);
    } else {
      field.stats.enemyBanked++; field.stats.enemyValue += value;
      advanceLadder();
    }
    emitTake(c, e.id, how, value, mult, side === 1 ? 'player' : 'enemy');
  }

  /** What is actually in the box (§4.4). Scrip is banked by the mode, not here. */
  function applyContents(c, e) {
    const def = CONTENT_BY_KIND[c.kind];
    if (!def || !e) return;
    if (def.rounds && e.gun) e.gun.ammo += def.rounds;
    if (def.fuel && e.flight) e.flight.fuel = Math.min(100, e.flight.fuel + def.fuel * 100);
    if (def.repair && e.hp) {
      e.hp.structure = Math.min(e.hpMax.structure, e.hp.structure + def.repair);
      for (const k in e.hp) {
        if (k === 'structure') continue;
        if (e.hp[k] <= 0) { e.hp[k] = e.hpMax[k] * def.component; break; }
      }
    }
    if (def.special) field.loadSpecial(e, c.specialId || pickSpecial());
    if (def.marks) field.marked = true;
    if (def.reveal) field.intel = true;
  }

  function land(c) {
    c.landed = true;
    c.alive = false;
    if (c.pilot) return;                 // a man reaching the ground banks nothing
    const x = field.crateX(c);
    const friendly = x < field.lineX;
    if (c.cut) {
      // T20: the burst is a property of HOW HIGH it was cut, because a long
      // ballistic fall is what breaks a crate.
      const p = burstChance(c.cutAltM);
      c.burst = rng ? rng.next() < p : false;
      if (c.burst) field.stats.burst++;
    }
    const mult = c.cut ? (c.burst ? CRATE.multBurst : CRATE.multCut) : CRATE.multFly;
    const value = c.scrip * mult * field.actMult;
    if (friendly) {
      field.stats.landedFriendly++;
      field.stats.playerBanked++;
      if (c.cut) field.stats.cutTaken++;
      field.stats.value += value;
      emitTake(c, '', c.cut ? 'cut' : 'drift', value, mult, 'player');
    } else {
      field.stats.landedEnemy++;
      field.stats.enemyBanked++;
      field.stats.enemyValue += value;
      advanceLadder();
      emitTake(c, '', c.cut ? 'cut' : 'drift', value, mult, 'enemy');
    }
  }

  /** T20's curve. Flat outside the two anchors, linear between them. */
  function burstChance(altM) {
    if (bugOf(ctx) === 'burst-free') return 0;      // T20 deleted: every cut survives
    if (altM >= CRATE.cutHiM) return CRATE.burstHi;
    if (altM <= CRATE.cutLoM) return CRATE.burstLo;
    const t = (altM - CRATE.cutLoM) / (CRATE.cutHiM - CRATE.cutLoM);
    return CRATE.burstLo + (CRATE.burstHi - CRATE.burstLo) * t;
  }
  field.burstChance = burstChance;

  function emitTake(c, byId, how, value, mult, side) {
    if (!bus) return;
    TAKE_EV.id = c.id; TAKE_EV.kind = c.kind; TAKE_EV.by = byId; TAKE_EV.how = how;
    TAKE_EV.value = value; TAKE_EV.mult = mult;
    TAKE_EV.altM = -c.sy; TAKE_EV.x = field.crateX(c); TAKE_EV.y = field.crateY(c);
    bus.emit(side === 'player' ? 'crate:caught' : 'crate:lost', TAKE_EV);
  }

  /* -------------------------------------------------------- taking fire --- */

  /**
   * The gun candidate list for one shooter. Silk is appended only when this side
   * is set to engage it, and `weapons.js` scores it strictly below any aeroplane
   * (`PRIORITY.silk`), so the assist never shoots a canopy while somebody is
   * shooting at you. Rebuilt in place; nothing allocates.
   */
  field.targetsFor = (e) => {
    // A per-entity override so ONE ace can hunt silk without the whole side
    // doing it: §5.3 S1 is the only enemy in the game who shoots canopies.
    const mode = e.engageSilk || field.engage[e.side] || 'none';
    if (mode === 'none' || !e.gun) return world.live;
    candidates.length = 0;
    const live = world.live;
    for (let i = 0; i < live.length; i++) candidates.push(live[i]);
    let n = 0;
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (!c.alive || c.landed || c.carriedBy) continue;
      // The assist NEVER offers a man under a canopy. §3.3 prices shooting one
      // and the price is a decision; an auto-fire that took it for you would be
      // the game making it, which is the one thing an assist may not do.
      if (c.pilot) continue;
      if (mode === 'cut' && c.cut) continue;       // nothing left to cut
      // A cut is chosen by ALTITUDE — §4.3's whole design is that low is worth
      // 1.6x and high is worth less than a fly-through, so "cut low" and "cut
      // high" are the same act inside two different windows on the fall.
      if (e.silkBand) {
        const altM = -c.sy;
        if (altM < e.silkBand[0] || altM > e.silkBand[1]) continue;
      }
      const s = silk[n++];
      s.crate = c;
      s.id = c.id + (mode === 'deny' ? ':box' : ':silk');
      s.alive = true; s.dead = false;
      s.side = -e.side;                            // always a valid target for this shooter
      s.deny = mode === 'deny';
      s.flight.sx = mode === 'deny' ? field.crateX(c) : field.silkX(c);
      s.flight.sy = mode === 'deny' ? field.crateY(c) : field.silkY(c);
      s.flight.svx = c.svx; s.flight.svy = c.svy;
      candidates.push(s);
    }
    for (let i = n; i < silk.length; i++) silk[i].alive = false;
    return candidates;
  };

  /**
   * Rounds against silk and box. Run AFTER `updateBullets`, so a round that
   * would have hit an aeroplane is already spent — which is the right priority
   * and costs nothing to state.
   */
  field.bulletPass = (dt) => {
    const bullets = world.bullets;
    const h = dt || world.dt;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.alive) continue;
      // A round covers 7 m in a tick against a 3.9 m crate, so the step is a
      // SEGMENT, not a point. P5 learned this the expensive way on the aircraft
      // colliders; a point test here loses about four rounds in five and would
      // have made "twelve rounds deny a crate" a fiction.
      const point = bugOf(ctx) === 'point-bullets';
      const x0 = point ? b.x : b.x - b.vx * h, y0 = point ? b.y : b.y - b.vy * h;
      for (let j = 0; j < crates.length; j++) {
        const c = crates[j];
        if (!c.alive || c.landed || c.carriedBy) continue;
        const cx = field.crateX(c), cy = field.crateY(c);
        if (segBox(x0, y0, b.x, b.y, cx, cy, CRATE.boxW, CRATE.boxH)) { boxHit(c, b); b.alive = false; break; }
        if (!c.cut && segBox(x0, y0, b.x, b.y, c.sx, c.sy, CRATE.silkW, CRATE.silkH)) { silkHit(c, b); b.alive = false; break; }
      }
    }
  };

  /** Slab test: does the segment (x0,y0)->(x1,y1) touch the AABB centred at (cx,cy)? */
  function segBox(x0, y0, x1, y1, cx, cy, w, hh) {
    const lx = cx - w * 0.5, hx = cx + w * 0.5, ly = cy - hh * 0.5, hy = cy + hh * 0.5;
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (let a = 0; a < 2; a++) {
      const d = a === 0 ? dx : dy;
      const p = a === 0 ? x0 : y0;
      const lo = a === 0 ? lx : ly, hi = a === 0 ? hx : hy;
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) { const s2 = ta; ta = tb; tb = s2; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  }

  function silkHit(c, b) {
    c.silkHits++;
    c.lastHitBy = b.owner;
    field.stats.silkRounds++;
    /**
     * §3.3: "Shooting a parachuting pilot: 0 Scrip, and applies Blooded — every
     * surviving enemy gains +15% aggression and -0.25 morale-flee threshold, and
     * the ace roster remembers it. Not forbidden, not free."
     */
    if (c.pilot) {
      world.blooded = true;
      world.stats.silkShot++;
      if (bus) { SILK_EV.id = c.id; SILK_EV.by = b.owner; SILK_EV.hits = c.silkHits;
                 SILK_EV.cut = true; SILK_EV.altM = -c.sy; bus.emit('crate:canopyHit', SILK_EV); }
      c.alive = false; c.landed = true;
      return;
    }
    // ART §5: the canopy folds from the segment nearest the hit and the crate
    // swings. One impulse, sized so six rounds visibly wreck the swing.
    c.phd += (b.x < c.sx ? 1 : -1) * 0.10;
    const cut = c.silkHits >= CRATE.silkRounds;
    if (bus) {
      SILK_EV.id = c.id; SILK_EV.by = b.owner; SILK_EV.hits = c.silkHits;
      SILK_EV.cut = cut; SILK_EV.altM = -c.sy;
      bus.emit('crate:canopyHit', SILK_EV);
    }
    if (cut) cutCanopy(c);
  }

  /** Six rounds, or one shotgun shell. Both land here. */
  function cutCanopy(c) {
    if (c.cut) return;
    /**
     * The crate becomes the body. Its drag area drops, so it falls faster and
     * has LESS TIME to drift — which is the whole altitude structure of §4.3:
     * cut it low and it lands where you cut it, cut it high and the wind still
     * gets a long say in whose side it comes down on.
     *
     * It does NOT freeze its horizontal velocity. A 90 kg box is still
     * drag-dominated (tau 1.93 s against 1.47 s intact), so it relaxes onto the
     * lower wind almost as readily as the canopy did. That was a claim worth
     * testing rather than believing: the `cutDrift` fixture shipped asserting
     * the freeze and went red, which is the only reason this comment is right.
     */
    const cx = field.crateX(c), cy = field.crateY(c);
    const tang = CRATE.L * c.phd;
    c.svx += tang * Math.cos(c.ph);
    c.svy += -tang * Math.sin(c.ph);
    c.sx = cx; c.sy = cy;
    c.ph = 0; c.phd = 0;
    c.cut = true;
    c.cutAltM = Math.max(0, -c.sy);
  }
  field.cutCanopy = cutCanopy;

  function boxHit(c, b) {
    c.boxHits++;
    c.lastHitBy = b.owner;
    if (c.boxHits < CRATE.boxRounds) return;
    // §4.3 deny: 0 value, and the enemy gets nothing. Correct whenever you
    // cannot reach a crate that they can.
    c.alive = false; c.denied = true; c.landed = true;
    field.stats.denied++;
    emitTake(c, b.owner, 'denied', 0, 0, 'enemy');
  }

  /* ------------------------------------------------------- the ladder ----- */

  function advanceLadder() {
    field.ladder++;
    // §4.5 reduced to a number on a ledger, which is what it must never be.
    if (bugOf(ctx) === 'no-ladder') { field.stats.ladderSteps++; return; }
    field.stats.ladderSteps++;
    const idx = ((field.ladder - 1) % LADDER.length);
    const cycle = Math.floor((field.ladder - 1) / LADDER.length);
    const step = LADDER[idx];
    if (step.dmgMult) {
      field.dmgMult *= step.dmgMult;
      for (let i = 0; i < world.live.length; i++) {
        const e = world.live[i];
        if (e.side !== 1) e.dmgMult = field.dmgMult;
      }
    }
    if (step.moraleFloor) {
      field.moraleFloor += step.moraleFloor;
      world.crateMoraleFloor = field.moraleFloor;
    }
    if (step.spawn) {
      for (let i = 0; i < pending.length; i++) {
        if (pending[i].alive) continue;
        pending[i].alive = true;
        pending[i].t = step.delay;
        pending[i].type = step.spawn;
        pending[i].cycle = cycle;
        break;
      }
    }
  }
  field.advanceLadder = advanceLadder;

  /** Fire every scheduled reinforcement now. For a level that STARTS behind. */
  field.flushPending = () => {
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      if (!p.alive) continue;
      p.alive = false;
      if (field.onReinforce) field.onReinforce(p.type, p.cycle);
    }
  };

  function updatePending(dt) {
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      if (!p.alive) continue;
      p.t -= dt;
      if (p.t > 0) continue;
      p.alive = false;
      if (field.onReinforce) field.onReinforce(p.type, p.cycle);
    }
  }

  /* ---------------------------------------------------- small arms (T17) -- */

  field.addNest = (xM, side = -1) => { nests.push({ x: xM, side, cool: 0 }); return nests[nests.length - 1]; };

  function updateGroundFire(dt) {
    if (nests.length === 0) return;
    const live = world.live;
    for (let i = 0; i < nests.length; i++) {
      const n = nests[i];
      n.cool -= dt;
      if (n.cool > 0) continue;
      n.cool = SMALL_ARMS.period;
      for (let j = 0; j < live.length; j++) {
        const e = live[j];
        if (!e.alive || e.dead || e.side === n.side) continue;
        const altM = -e.flight.sy;
        if (altM > SMALL_ARMS.ceilM) continue;
        const d = Math.hypot(e.flight.sx - n.x, e.flight.sy);
        if (d > SMALL_ARMS.reachM) continue;
        const speed = Math.hypot(e.flight.svx, e.flight.svy);
        const p = smallArmsP(altM, speed);
        if (!rng || rng.next() >= p) continue;
        const comp = GF_COMPONENTS[Math.min(GF_COMPONENTS.length - 1, (rng.next() * GF_COMPONENTS.length) | 0)];
        applyDamage(e, comp, SMALL_ARMS.dmg, ctx, 'ground');
        field.stats.gfHits++;
        field.stats.gfDamage += SMALL_ARMS.dmg;
      }
    }
  }

  /* --------------------------------------------------------- prediction -- */

  /**
   * Where a crate will be in `secs`, integrated with the SAME drag law the tick
   * uses, at a coarser step. `windErr` is added to the wind the predictor
   * believes — §4.5's `sigma_wind = (1-k)*4 m/s`. It perturbs what the pilot
   * BELIEVES, never the crate; D86's rule, and here it is the design's too.
   *
   * Writes into `out` so the AI can call it every decision without allocating.
   */
  const PRED_STEP = 1 / 6;
  field.predict = (c, secs, windErr, out) => {
    let x = c.sx, y = c.sy, vx = c.svx, vy = c.svy;
    const CdA = c.cut ? CRATE.CdACut : CRATE.CdA;
    let t = 0;
    while (t < secs) {
      const h = Math.min(PRED_STEP, secs - t);
      const altM = Math.max(0, -y);
      const rho = density(altM);
      const wx = windAt(field.wind, altM) + windErr;
      const ux = vx - wx, uy = vy;
      const k = 0.5 * rho * CdA * Math.hypot(ux, uy) / CRATE.m;
      vx += -k * ux * h;
      vy += (G_SI - k * uy) * h;
      x += vx * h; y += vy * h;
      t += h;
      if (y >= 0) break;
    }
    out.x = x; out.y = Math.min(0, y); out.t = t; out.grounded = y >= 0;
    // the swing is a bounded ±L*sin(ph) wobble; the predictor works on the mean
    return out;
  };

  /**
   * Seconds until this crate reaches the ground, from now. One forward pass with
   * an early exit, memoised per crate per tick — the first version bisected 24
   * times over a 400 s integration, which is 57,000 steps per crate per pilot
   * per decision and turned a 190 s mission into a minute of wall clock.
   */
  const TOF = { x: 0, y: 0, t: 0, grounded: false };
  field.timeToGround = (c) => {
    if (c._ttgAt === field.t) return c._ttg;
    field.predict(c, 400, 0, TOF);
    c._ttgAt = field.t; c._ttg = TOF.t;
    return TOF.t;
  };

  /**
   * THE interception. One forward integration of the fall, sampled as it goes,
   * returning the earliest point that satisfies both conditions at once:
   *
   *   - the crate is inside the altitude window this pilot wants to meet it in
   *     (the whole column for a fly-through; below 120 m for the 1.6x cut);
   *   - the aeroplane can cover the distance in the time remaining.
   *
   * It is one pass rather than a scan of predictions because the scan version —
   * a fresh 500-step integration per candidate lead, per crate, per pilot, per
   * decision — is about 20 million steps a second and turned a 200 s mission
   * into a minute of wall clock. Same answer, 1/45th of the work.
   *
   * `windErr` is this pilot's standing misjudgement of the wind (§4.5). The
   * crate is unaffected; only the belief is.
   */
  field.rendezvous = (c, fx, fy, speed, windErr, altLo, altHi, out) => {
    let x = c.sx, y = c.sy, vx = c.svx, vy = c.svy, t = 0;
    const CdA = c.cut ? CRATE.CdACut : CRATE.CdA;
    const h = 0.25;
    const v = Math.max(25, speed);
    out.ok = false; out.t = -1; out.x = 0; out.y = 0; out.tGround = 0;
    for (let i = 0; i < 1600; i++) {
      const altM = Math.max(0, -y);
      const rho = density(altM);
      const wx = windAt(field.wind, altM) + windErr;
      const ux = vx - wx, uy = vy;
      const k = 0.5 * rho * CdA * Math.hypot(ux, uy) / CRATE.m;
      vx += -k * ux * h;
      vy += (G_SI - k * uy) * h;
      x += vx * h; y += vy * h; t += h;
      if (y >= 0) { out.tGround = t; break; }
      out.tGround = t;
      if (out.ok) continue;
      if (altM < altLo || altM > altHi) continue;
      // the crate hangs L below the canopy; meet the CRATE
      const cy = y + (c.cut ? 0 : CRATE.L);
      const d = Math.hypot(x - fx, cy - fy);
      if (d / v <= t) { out.ok = true; out.t = t; out.x = x; out.y = cy; out.dist = d; }
    }
    return out;
  };

  /* --------------------------------------------------------- specials ---- */

  field.specials = opts.specials || null;
  field.loadSpecial = (e, id) => {
    if (!id) return null;
    e.special = id;
    e.specialAmmo = (field.specials && field.specials[id] ? field.specials[id].ammo : 1);
    return id;
  };
  function pickSpecial() {
    const ids = field.specialPool || ['shotgun', 'lePrieur', 'flare', 'cooper', 'boost', 'smoke'];
    return ids[Math.min(ids.length - 1, ((rng ? rng.next() : 0) * ids.length) | 0)];
  }
  field.pickSpecial = pickSpecial;

  /**
   * §4.8: the shotgun shell cuts a canopy in a single shot. It is the only
   * special whose EFFECT is a crate rule, so it is the only one implemented
   * here; the other five are data until P13 owns the slot.
   */
  field.fireSpecial = (e) => {
    if (!e.special || (e.specialAmmo | 0) <= 0) return false;
    if (e.special !== 'shotgun') { e.specialAmmo--; return true; }
    let best = null, bd = 30;                      // §4.8: 30 m
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (!c.alive || c.cut || c.landed || c.carriedBy) continue;
      const d = Math.hypot(e.flight.sx - c.sx, e.flight.sy - c.sy);
      if (d < bd) { bd = d; best = c; }
    }
    e.specialAmmo--;
    if (!best) return true;
    best.silkHits = CRATE.silkRounds;
    best.lastHitBy = e.id;
    if (bus) {
      SILK_EV.id = best.id; SILK_EV.by = e.id; SILK_EV.hits = best.silkHits;
      SILK_EV.cut = true; SILK_EV.altM = -best.sy;
      bus.emit('crate:canopyHit', SILK_EV);
    }
    cutCanopy(best);
    return true;
  };

  /* ------------------------------------------------------------ framing -- */

  /**
   * P5_NOTES §12.4: a crate contributes to the framing box when CONTESTED, at
   * `weight 0` so it does not arm the zoom lock. World units, because that is
   * what `cam.track` takes.
   */
  field.framing = (player, out) => {
    if (!player || !player.alive) return out;
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (!c.alive || c.landed || c.carriedBy) continue;
      if (!c.contestedBy) continue;
      const d = Math.hypot(player.flight.sx - field.crateX(c), player.flight.sy - field.crateY(c));
      if (d > 200) continue;                       // §2.8: "within 200 m"
      out.push({ id: c.id, x: field.crateX(c) / 0.15, y: field.crateY(c) / 0.15,
                 w: CRATE.silkW / 0.15, h: (CRATE.silkH + CRATE.L) / 0.15, weight: 0 });
    }
    return out;
  };

  field.reset = () => {
    for (let i = 0; i < crates.length; i++) crates[i].alive = false;
    for (let i = 0; i < pending.length; i++) pending[i].alive = false;
    nests.length = 0;
    field.ladder = 0; field.moraleFloor = 0; field.dmgMult = 1; field.t = 0;
    world.crateMoraleFloor = 0;
    for (const k in field.stats) field.stats[k] = 0;
    idSeq = 0;
  };

  world.crates = field;
  return field;
}

/* ------------------------------------------------ the reachability solver -- */
/**
 * DESIGN §10.4, and it exists because of a specific scar: **a gate that passed
 * because of a workaround inside it hid a third of a map being unreachable.**
 * Therefore, and this is not negotiable:
 *
 *   - NO fallback, NO clamp, NO "if unreachable, move the drop point".
 *   - the assert is on per-crate detail lines, never on a pass count.
 *
 * The cone is an UPPER BOUND on what the airframe can do: best climb rate for
 * height, level top speed for ground covered, and a reversal charged at its real
 * cost. It can only say "no aeroplane could have got there", never "the bot was
 * not good enough" — which is the distinction that makes a failure actionable.
 */
export function reachCone(af, env, dxM, dAltM, t) {
  // dAltM > 0 means the target is HIGHER than the start.
  const vClimb = env.climbSpeed, roc = env.roc, vMax = env.vmax, vDive = env.vdive;
  let tSpent = 0;
  if (dAltM > 0) {
    tSpent = dAltM / roc;
    if (tSpent > t) return { ok: false, reachAt: Infinity, limit: 'climb' };
  } else if (dAltM < 0) {
    tSpent = -dAltM / vDive;
    if (tSpent > t) return { ok: false, reachAt: Infinity, limit: 'dive' };
  }
  const need = Math.abs(dxM);
  // Ground covered: at the best-climb speed while climbing, at top speed after.
  const covered = (dAltM > 0 ? vClimb * tSpent : vMax * tSpent) + vMax * Math.max(0, t - tSpent);
  return { ok: covered >= need, reachAt: tSpent, limit: covered >= need ? '' : 'range',
           covered, need };
}

/**
 * Earliest time the player can be AT a crate, by fly-through. Scans forward in
 * `step` increments, integrating the crate's real fall and testing the cone at
 * each. Returns `{ t, ok, margin }` where `margin` is seconds of slack against
 * the crate reaching the ground.
 */
const RP = { x: 0, y: 0, t: 0, grounded: false };
export function soonestCatch(field, c, start, af, env, opts = {}) {
  const step = opts.step ?? 0.5;
  const tGround = field.timeToGround(c);
  const turn = opts.turnPenalty ?? 2.0;
  for (let t = 0; t <= tGround; t += step) {
    field.predict(c, t, 0, RP);
    const dx = RP.x - start.x;
    const dAlt = (-RP.y) - (-start.y);
    // a reversal is not free: charge it if the crate is behind the nose
    const behind = (dx * start.dir) < 0;
    const tAvail = t - (behind ? turn : 0);
    if (tAvail <= 0) continue;
    const r = reachCone(af, env, dx, dAlt, tAvail);
    if (r.ok) return { ok: true, t, margin: tGround - t, tGround, x: RP.x, y: RP.y, limit: '' };
  }
  field.predict(c, tGround, 0, RP);
  const dx = RP.x - start.x, dAlt = (-RP.y) - (-start.y);
  const r = reachCone(af, env, dx, dAlt, Math.max(0.01, tGround - turn));
  return { ok: false, t: Infinity, margin: -1, tGround, x: RP.x, y: RP.y, limit: r.limit,
           short: r.need - r.covered };
}

/**
 * The canopy-cut option: can the player reach a FIRING SOLUTION on the canopy in
 * time, and does the resulting ballistic fall land friendly-side? `belowM` is
 * the altitude the cut must happen at or below (120 m for the 1.6x play).
 */
export function soonestCut(field, c, start, af, env, opts = {}) {
  const step = opts.step ?? 0.5;
  const belowM = opts.belowM ?? CRATE.cutLoM;
  const tGround = field.timeToGround(c);
  const turn = opts.turnPenalty ?? 2.0;
  const standoff = opts.standoff ?? GUNS.rangeEff * 0.8;
  for (let t = 0; t <= tGround; t += step) {
    field.predict(c, t, 0, RP);
    const altM = -RP.y;
    if (altM > belowM) continue;
    // the shot is taken from up to `standoff` short of the crate, at its altitude
    const dxRaw = RP.x - start.x;
    const dx = dxRaw - Math.sign(dxRaw || 1) * standoff;
    const dAlt = altM - (-start.y);
    const behind = (dxRaw * start.dir) < 0;
    const tAvail = t - (behind ? turn : 0);
    if (tAvail <= 0) continue;
    const r = reachCone(af, env, dx, dAlt, tAvail);
    if (!r.ok) continue;
    // where does it land once cut here?
    const saveX = c.sx, saveY = c.sy, saveVX = c.svx, saveVY = c.svy, saveCut = c.cut;
    c.sx = RP.x; c.sy = RP.y; c.cut = true;
    field.predict(c, 400, 0, RP);
    const landX = RP.x;
    c.sx = saveX; c.sy = saveY; c.svx = saveVX; c.svy = saveVY; c.cut = saveCut;
    return { ok: true, t, margin: tGround - t, tGround, cutAltM: altM, landX,
             friendly: landX < field.lineX };
  }
  return { ok: false, t: Infinity, margin: -1, tGround, cutAltM: 0, landX: 0, friendly: false };
}
