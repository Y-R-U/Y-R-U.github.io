/**
 * P9 — the world.
 *
 * §1 THE LADDER'S READING (this file, so far).
 *
 * D126 is the ruling this section exists to obey, and it is worth restating in
 * full because every constant below is derived against it: landscape is 560 wu
 * tall against portrait's 1,000, so the altitude ladder is now the SHORT axis —
 * and P9 re-proportions **how the ladder reads**, never its metres. The band
 * edges are physics-facing (stall, density, D28's ceiling) and D26 fixed
 * 1 wu = 0.15 m. `js/core/bands.js` owns the metres and nothing here moves them.
 *
 * What "how it reads" turns out to mean, once measured, is three quantities:
 *
 *   1. how much of a band is on screen, in css px (P4)
 *   2. how long two bands are on screen together across a boundary (P4b)
 *   3. the establishing crane's rate and length (P4, §3.3 constraint 2)
 *
 * All three are pure geometry over `view` and the band table, so they live here
 * rather than in the renderer: the instrument (`tools/ladder.mjs`) and the game
 * read the SAME functions, which is W5's rule applied one system early.
 *
 * Pure. No DOM, no wall-clock, no js/gfx (ARCHITECTURE §8.1, tools/corecheck).
 */

import { BANDS, CEILING_WU, GROUND_WU, BEST_CLIMB_WU_S, altitudeMetres } from '../core/bands.js';

/**
 * §4.4.2 P4's legibility bar: a band showing less than this stops reading as a
 * place and reads as a stripe. Restated from the criterion, not chosen here.
 */
export const BAND_LEGIBLE_PX = 90;

/** Visible world height at a given zoom, wu. */
export const frameWu = (view, zoom) => view.profile.worldH / zoom;

/** css px per wu at a given zoom. `view.scale` is px/wu at zoom 1. */
export const pxPerWu = (view, zoom) => view.scale * zoom;

/** The legibility bar expressed in wu at a given zoom. */
export const legibleWu = (view, zoom) => BAND_LEGIBLE_PX / pxPerWu(view, zoom);

/**
 * THE IDENTITY THAT DECIDES P4, and it is the reason no zoom rescues the
 * criterion in either orientation:
 *
 *   legibleWu / frameWu = BAND_LEGIBLE_PX / view.h
 *
 * because `scale = view.h / worldH`, so both terms carry `worldH / zoom` and it
 * cancels. **The 90 px bar is a fixed fraction of the VIEWPORT, whatever the
 * zoom and whatever the profile's worldH.** Portrait spends 90/844 = 10.66% of
 * its frame per legible band; a landscape phone spends 90/390 = 23.08%. Zooming
 * out buys more wu on screen and shrinks the wu-per-px in exactly the same
 * proportion, so it cannot move the ratio at all.
 */
export const legibleFrac = (view) => BAND_LEGIBLE_PX / view.h;

const _ext = [];

/**
 * On-screen extent of every band, css px, for a frame centred at world `camY`.
 * The frame is clipped to the playable column: nothing exists below the ground
 * or above the ceiling, so sky drawn there is not a band being read.
 *
 * Returns a shared array (§10 rule 9 — copy it if you keep it).
 */
export function bandExtentsPx(camY, view, zoom) {
  const f = frameWu(view, zoom);
  const ppw = pxPerWu(view, zoom);
  // +y is DOWN, so `hi` is the more negative (higher) edge.
  const lo = Math.min(GROUND_WU, camY + f / 2);
  const hi = Math.max(CEILING_WU, camY - f / 2);
  _ext.length = 0;
  for (let i = 0; i < BANDS.length; i++) {
    const b = BANDS[i];
    const overlap = Math.max(0, Math.min(lo, b.y0) - Math.max(hi, b.y1));
    _ext.push({ id: b.id, wu: overlap, px: overlap * ppw });
  }
  return _ext;
}

/** How many bands clear the legibility bar in this frame. */
export function legibleCount(camY, view, zoom) {
  const e = bandExtentsPx(camY, view, zoom);
  let n = 0;
  for (let i = 0; i < e.length; i++) if (e[i].px >= BAND_LEGIBLE_PX) n++;
  return n;
}

/**
 * P4b's first half, closed form: how long both bands either side of a boundary
 * are simultaneously legible, crossing at best climb.
 *
 * The boundary must sit at least `legibleWu` from each frame edge, so the
 * travel over which both clear the bar is `frameWu - 2 * legibleWu`, and by the
 * identity above that is `frameWu * (1 - 2 * BAND_LEGIBLE_PX / view.h)`.
 */
export function boundaryDwellS(view, zoom, climbWuS = BEST_CLIMB_WU_S) {
  const travel = frameWu(view, zoom) - 2 * legibleWu(view, zoom);
  return travel > 0 ? travel / climbWuS : 0;
}

/**
 * P4's traversal half, closed form: the fraction of a full-column climb over
 * which at least two bands are legible.
 *
 * Each of the five interior boundaries contributes `boundaryDwell * climb` wu
 * of the 10,000 wu column.
 *
 * DOMAIN, and it is not a footnote: this form assumes the per-boundary windows
 * neither overlap each other nor get clipped by the ground and the ceiling. The
 * window is `frameWu x (1 - 2 x BAND_LEGIBLE_PX / view.h)`, so it holds while
 * that is under the smallest gap between two boundaries (700 wu, §3.3
 * constraint 1). Every zoom the controller may legally choose satisfies it in
 * both profiles; a cinematic or a deliberately absurd zoom does not, and there
 * the sampled figure is the true one and this form over-reads. tools/ladder.mjs
 * checks the two against each other at the legal zooms and prints both.
 */
export function traversalFraction(view, zoom, climbWuS = BEST_CLIMB_WU_S) {
  const per = boundaryDwellS(view, zoom, climbWuS) * climbWuS;
  return (BANDS.length - 1) * per / (GROUND_WU - CEILING_WU);
}

/* ---------------------------------------------------------------------------
 * §1.2 The establishing crane (D126 names it explicitly as P9's to re-proportion)
 * ------------------------------------------------------------------------ */

/** §4.4.2 P4: each band must be held at or above the legibility bar this long. */
export const CRANE_HOLD_BAR_S = 0.8;

/**
 * The margin the crane is derived WITH rather than derived to. §4.4.3's own
 * escalation rule condemns a criterion sitting within 10% of its threshold, and
 * D128 spent a manager call on a criterion that cleared by 0.03%. A crane rate
 * solved for exactly 0.8 s reads 0.8007 s and is worth nothing.
 */
export const CRANE_MARGIN = 1.25;

/**
 * Crane rate, wu/s. ONE rate for both orientations, derived from the tighter of
 * the two, which under D123 is landscape:
 *
 *   The binding band is the THINNEST, Mud at 700 wu (§3.3 constraint 1). The
 *   crane starts with the frame bottom on the ground, so Mud is fully visible
 *   and shrinks as the camera rises; it clears the bar over
 *
 *     travel = 700 - legibleWu(landscape, zoomEstablish)
 *            = 700 - 90 / (0.696428 x 0.42)
 *            = 700 - 307.69 = 392.31 wu
 *
 *   and that must last CRANE_HOLD_BAR_S x CRANE_MARGIN = 1.0 s:
 *
 *     rate <= 392.31 / 1.0 = 392.31 wu/s  ->  392 wu/s (58.8 m/s of camera)
 *
 * Portrait gets the same rate and 528.0 / 392 = 1.347 s on Mud — 68% clear —
 * for free. A per-profile rate was rejected: an establishing shot is a
 * directorial beat and the same shot should keep the same pace on both, and
 * deriving from the tighter case is what makes one number legal in both.
 */
export const CRANE_RATE_WU_S = 392;

/**
 * Crane length, seconds. The last of the three bands to arrive is Floor, whose
 * lower edge enters the frame at
 *
 *   s = 1700 + legibleWu - frameWu = 1700 + 307.69 - 1333.33 = 674.36 wu
 *
 * of camera travel (landscape), and it needs 1.0 s at the bar after that:
 *
 *   travel >= 674.36 + 1.0 x 392 = 1066.4 wu  ->  T >= 2.72 s
 *
 * Rounded up to 4.0 s, which is §3.3 constraint 2's own budget ("the crane
 * crosses three bands in <= 4 s") and buys Floor 2.28 s instead of 1.0.
 */
export const CRANE_SECONDS = 4.0;

/**
 * Per-band hold, seconds, for a crane that starts with the frame bottom on the
 * ground and rises at `rate` for `seconds`. Sampled rather than solved, because
 * the closed form has four cases per band and the sampled one has none.
 */
export function craneHolds(view, { rate = CRANE_RATE_WU_S, seconds = CRANE_SECONDS,
                                  zoom = view.profile.zoomEstablish, dt = 1 / 240 } = {}) {
  const f = frameWu(view, zoom);
  const held = new Map(), run = new Map();
  for (const b of BANDS) { held.set(b.id, 0); run.set(b.id, 0); }
  for (let t = 0; t <= seconds + 1e-9; t += dt) {
    const camY = -(f / 2) - rate * t;          // frame bottom starts at the ground
    const e = bandExtentsPx(camY, view, zoom);
    for (const x of e) {
      if (x.px >= BAND_LEGIBLE_PX) {
        const r = run.get(x.id) + dt;
        run.set(x.id, r);
        if (r > held.get(x.id)) held.set(x.id, r);
      } else run.set(x.id, 0);
    }
  }
  return held;
}

/* ---------------------------------------------------------------------------
 * §1.3 Where a band's signature element goes (P4b's second half)
 * ------------------------------------------------------------------------ */

/**
 * P4b asks for "both bands' signature elements on screen together for >= 1.5 s"
 * at best climb. A band's signature in the SKY term (haze, saturation, cloud
 * population — `BAND_STYLE` in js/gfx/sky.js) is continuous in x and is always
 * on screen, so that half is satisfied by `boundaryDwellS`. A PLACED signature
 * — a balloon line, a zeppelin, a trench — is a level-data object at an
 * altitude, and this is the rule that says where it may sit.
 *
 * Two placed elements separated by D wu are both in frame over `frameWu - D` of
 * travel, so
 *
 *   D <= frameWu - 1.5 s x 90 wu/s = frameWu - 135
 *
 * Landscape at combat framing binds (D123): 560 - 135 = 425 wu. Portrait's own
 * bound is 1000 - 135 = 865 wu and is satisfied automatically, which is the
 * whole point of tuning to the shorter frame.
 *
 * Adopted at 400 wu — 200 wu either side of every boundary — which is inside
 * the 425 bound with 6% in hand and, at 200 wu per side, fits twice inside even
 * the thinnest band that has two neighbours (Belt, 1000 wu). Landscape gets
 * (560 - 400) / 90 = 1.78 s of co-visibility; portrait gets 6.67 s.
 *
 * CONSEQUENCE FOR THE LEVEL FORMAT, and it is the only structural one: a band
 * with two neighbours needs a signature instance near EACH of its boundaries,
 * not one in the middle. One central instance per band puts Belt's and Floor's
 * 1150 wu apart, which is 2.7x the landscape bound.
 */
export const SIGNATURE_SPAN_WU = 400;
export const SIGNATURE_OFFSET_WU = SIGNATURE_SPAN_WU / 2;

/**
 * The altitudes a level's placed band signatures must occupy: one per side of
 * every interior boundary. Ground and ceiling have no outside neighbour, so the
 * column's two ends carry one each.
 */
export function signatureAltitudes() {
  const out = [];
  for (let i = 0; i < BANDS.length - 1; i++) {
    const edge = BANDS[i].y1;
    out.push({ band: BANDS[i].id, y: edge + SIGNATURE_OFFSET_WU, edge });
    out.push({ band: BANDS[i + 1].id, y: edge - SIGNATURE_OFFSET_WU, edge });
  }
  return out;
}

/* ===========================================================================
 * §2 THE LEVEL'S CONDITIONS — wind, gusts, visibility, time of day
 * ======================================================================== */

/**
 * ONE wind evaluator, and this is where it lives.
 *
 * Moved here verbatim from `js/sim/crates.js`, which is where P6 had to put it
 * because there was no world module yet. `crates.js` now imports and re-exports
 * it, so every caller — the crate solver, `field.predict`, `field.rendezvous`
 * (which IS the AI's wind estimator) and `tools/sim.mjs` — is calling the same
 * function object, not the same arithmetic written twice. W5 asserts exactly
 * that, by identity, and `?bug=second-wind` proves the assertion can fail.
 *
 * A per-level piecewise-linear altitude table, `[[altM, vxMS], ...]` low to
 * high. A crate under canopy relaxes onto the LOCAL wind, so two layers with
 * different winds make a falling crate curve — which is what turns DESIGN
 * §4.6.1's "The Shear" into a decision instead of flavour.
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

/**
 * THE FORBIDDEN SECOND IMPLEMENTATION, shipped alongside the correct one the
 * way P1 shipped `?impl=screen` and input.js ships `?inputbug=`. Nearest-sample
 * instead of linear: it agrees with `windAt` exactly at every knot and diverges
 * between them, which is what a divergence between two hand-written estimators
 * actually looks like — not a wild disagreement, a quiet one that only shows up
 * off the sample points. `crates.js` routes the SOLVER through this under
 * `?bug=second-wind`, so W5 can be shown to catch it. No shipped build sets it.
 */
export function windAtNearest(profile, altM) {
  const p = profile;
  if (!p || p.length === 0) return 0;
  let best = p[0];
  for (let i = 1; i < p.length; i++) if (Math.abs(p[i][0] - altM) < Math.abs(best[0] - altM)) best = p[i];
  return best[1];
}

/**
 * D28's playable ceiling in metres — the top of any legal wind table. Derived
 * through `altitudeMetres`, never `x 0.15`: D26 fixed the scale and D29 is the
 * record of what six hand-written copies of it cost.
 */
export const CEILING_M = altitudeMetres(CEILING_WU);

export const WIND_CALM = Object.freeze([[0, 0], [CEILING_M, 0]]);

/**
 * Errors in a level's wind table, as an array of strings. `js/data/validate.js`
 * is the caller; it is here because the rule belongs with the evaluator and a
 * validator that keeps its own copy of a rule is D131's pattern.
 *
 * Bounds are not taste: `windAt` reads a table low-to-high and interpolates, so
 * an unsorted or single-point table silently returns a constant and the shear
 * that a crate level is BUILT on quietly stops existing.
 */
export const WIND_MAX_MS = 25;          // 90 km/h; above this a Camel cannot hold station

export function windProfileErrors(profile) {
  const e = [];
  if (!Array.isArray(profile) || profile.length < 2) {
    e.push(`wind must be an array of at least 2 [altM, vxMS] pairs, got ${JSON.stringify(profile)}`);
    return e;
  }
  for (let i = 0; i < profile.length; i++) {
    const row = profile[i];
    if (!Array.isArray(row) || row.length !== 2 || !Number.isFinite(row[0]) || !Number.isFinite(row[1]))
      e.push(`wind[${i}] must be [altM, vxMS] of two finite numbers, got ${JSON.stringify(row)}`);
    else {
      if (i > 0 && row[0] <= profile[i - 1][0])
        e.push(`wind[${i}] altitude ${row[0]} m must be strictly above wind[${i - 1}]'s ${profile[i - 1][0]} m — the table is read low to high`);
      if (row[0] < 0) e.push(`wind[${i}] altitude ${row[0]} m is below the ground`);
      if (row[0] > CEILING_M + 1e-6) e.push(`wind[${i}] altitude ${row[0]} m is above the ${CEILING_M} m playable ceiling (D28)`);
      if (Math.abs(row[1]) > WIND_MAX_MS) e.push(`wind[${i}] speed ${row[1]} m/s exceeds the ${WIND_MAX_MS} m/s limit`);
    }
  }
  return e;
}

/**
 * The level's atmospheric conditions. NOT `createWorld` — `js/sim/entities.js`
 * already exports that name for the pooled ENTITY world, and two functions
 * called `createWorld` in `js/sim/` is a trap for every later phase.
 *
 * `visibility` and `timeOfDay` are carried and validated here rather than in the
 * renderer so the headless sim sees the same level a browser does.
 */
export const TIME_OF_DAY = Object.freeze(['dawn', 'day', 'dusk', 'night']);

export function createConditions(def = {}) {
  const wind = def.wind || WIND_CALM;
  const errors = windProfileErrors(wind);
  const vis = def.visibility ?? 1;
  if (!(vis > 0 && vis <= 1)) errors.push(`visibility must be in (0, 1], got ${vis}`);
  const tod = def.timeOfDay || 'day';
  if (!TIME_OF_DAY.includes(tod)) errors.push(`timeOfDay must be one of ${TIME_OF_DAY.join('/')}, got ${JSON.stringify(tod)}`);
  return {
    wind, visibility: vis, timeOfDay: tod,
    gustPhase: def.gustPhase ?? 0,
    gustSeed: def.gustSeed ?? 1337,
    errors,
    at: (altM) => windAt(wind, altM),
  };
}
