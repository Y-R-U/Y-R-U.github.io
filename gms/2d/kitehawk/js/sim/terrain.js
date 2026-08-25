/**
 * P9 deliverable 4 — the ground silhouette, and the query `js/gfx/particles.js`
 * already exposes a socket for (`P.setTerrainQuery(fn)`).
 *
 * ONE implementation, for W5's reason one system over: the renderer draws this
 * silhouette, the particles collide with it, and the level editor previews it.
 * Two of those computing their own heightfield is a divergence that will look
 * like a rendering bug.
 *
 * It deliberately does NOT touch flight. `groundContact` in `js/sim/damage.js`
 * is a combat constant this phase may not move, and it treats `sy >= 0` as the
 * ground plane. So terrain is the SILHOUETTE and the particle surface; making
 * the aeroplane collide with a ridge is a damage-model change and belongs to
 * whoever owns that file.
 *
 * Pure `js/sim/`: no DOM, no renderer, nothing from `js/gfx/`.
 */

import { M_PER_WU } from '../core/math.js';
import { BANDS, GROUND_WU, BEST_CLIMB_WU_S, CRUISE_WU_S } from '../core/bands.js';
import { createRNG } from '../core/rng.js';

const MUD = BANDS[0];
const BELT = BANDS[1];

/**
 * THE SLOPE BOUND, derived from the flight envelope rather than chosen.
 *
 *   best climb   BEST_CLIMB_WU_S  90 wu/s   (js/core/bands.js — 13.5 m/s)
 *   cruise       280 wu/s                   (D126, and F4's 61.5 m/s top speed
 *                                            is 410 wu/s, so 280 is the honest
 *                                            middle a mission is flown at)
 *   max slope    90 / 280 = 0.321           = 17.8 degrees
 *
 * A ridge steeper than that rises faster than the aeroplane can climb while
 * flying along it, so a valley floor becomes a trap with no exit — which is the
 * shape of a level that cannot be completed rather than a level that is hard.
 * Act 3's theatre is *"valleys with no room to loop"*, which is a horizontal
 * constraint by design; this is the vertical one, and it is a hard bound.
 */
export const MAX_SLOPE = BEST_CLIMB_WU_S / CRUISE_WU_S;

/**
 * Named profiles, because DESIGN §8.10's level shape carries `terrain:
 * "pass_narrow"` — a NAME, not a parameter block. §7.1's `{ profile, amp,
 * wavelength, detail }` is the same thing with the parameters exposed, so a
 * name selects the defaults and a level may override any of them.
 *
 * `amp` is peak-to-trough in wu and every one of them is capped below Mud's
 * 700 wu thickness for the ridge profiles' sake: the ground silhouette rising
 * into Belt would put terrain where the second band is supposed to read, and
 * the whole point of six bands is that they read as different places (D27).
 */
/**
 * The maximum slope THIS generator can produce, in closed form, for a given
 * amplitude/wavelength/detail. Derived from the generator rather than assumed
 * from a sine — the first version of this check used `pi * amp / wl`, which is a
 * sine's bound, and it condemned a profile whose measured slope was 19% inside
 * the limit while letting another through.
 *
 *   base octave   amplitude fraction (1 - d/2)  at wavelength wl
 *   fine octave   amplitude fraction (d/2)      at wavelength wl/4
 *   smoothstep    max |f'| = 1.5 at the cell centre
 *   lattice       adjacent values differ by at most 1
 *
 *   slope <= 1.5 * amp * [ (1 - d/2) + 4 * (d/2) ] / wl
 *          = 1.5 * amp * (1 + 1.5 d) / wl
 */
export const slopeBound = (amp, wl, detail) => 1.5 * amp * (1 + 1.5 * detail) / wl;

/** The shortest wavelength an amplitude may legally have. Invert the above. */
export const minWavelength = (amp, detail) => 1.5 * amp * (1 + 1.5 * detail) / MAX_SLOPE;

/**
 * Named profiles, because DESIGN §8.10's level shape carries `terrain:
 * "pass_narrow"` — a NAME, not a parameter block. §7.1's `{ profile, amp,
 * wavelength, detail }` is the same thing with the parameters exposed, so a
 * name selects the defaults and a level may override any of them.
 *
 * **Only `amp` and `detail` are authored; the wavelength is DERIVED** as the
 * shortest one the slope bound allows, rounded up to 50 wu. Typing a wavelength
 * is how two of the first four profiles were born illegal — `ridge` at 3,400 and
 * `pass_narrow` at 1,900 both exceeded a bound stated ten lines above them.
 *
 * `amp` is relief in wu and every one is capped below Mud's 700 wu thickness:
 * the ground silhouette rising into Belt would put terrain where the second band
 * is supposed to read, and the whole point of six bands is that they read as
 * different places (D27).
 */
const PROFILE_SEED = Object.freeze({
  plain:       { amp: 30,  detail: 0.3, want: 4200 },   // Act 1-2, the flat hinterland
  trenchline:  { amp: 90,  detail: 0.6, want: 2600 },   // §7.1's own example, verbatim
  ridge:       { amp: 420, detail: 0.5, want: 3400 },   // Act 3, "ridges to climb"
  pass_narrow: { amp: 620, detail: 0.7, want: 1900 },   // Act 3, DESIGN §8.10's own name
});
/**
 * `want` is the authored wavelength and the floor only ever RAISES it. A floor
 * used as a target would have turned §7.1's 2,600 wu trench line into an 800 wu
 * one — legal, and nothing like the thing the document describes.
 *
 *   plain        4,200  floor   200  -> 4,200
 *   trenchline   2,600  floor   800  -> 2,600   (§7.1's number, untouched)
 *   ridge        3,400  floor 3,450  -> 3,450   raised 1.5%
 *   pass_narrow  1,900  floor 5,950  -> 5,950   raised 3.1x — see P9_NOTES REQUEST-12
 */
export const TERRAIN_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(PROFILE_SEED).map(([k, v]) => [k, Object.freeze({
    amp: v.amp, detail: v.detail,
    wavelength: Math.max(v.want, Math.ceil(minWavelength(v.amp, v.detail) / 50) * 50),
  })])));

/** Mud's thickness. Nothing may reach Belt. */
export const MAX_TERRAIN_WU = Math.abs(MUD.y1 - MUD.y0);

/**
 * §4.4.2 **P7 — ground-attack legibility**: *"distinct ground targets visible
 * ahead while strafing at y in [-260, -800] (Mud/lower Belt) at cruise, target
 * spacing 140 wu (21 m)"*, PASS at >= 3, FAIL at < 2.
 *
 * It has read NOT MEASURABLE in `tools/gates_portrait.mjs` since P8 for one
 * reason: *"terrain and ground targets are P9 and do not exist yet"*. This is
 * the half P9 owes it — how many of a 140 wu lattice of ground targets are
 * **not occluded by the relief in front of them**, from an eye at a strafing
 * altitude. It lives here rather than in the gate because the silhouette the
 * gate reasons about and the silhouette the renderer draws must be the same one
 * (W5's rule, one system over).
 *
 * The horizon test is a sampled ray, not a closed form: this generator is two
 * octaves of value noise and its skyline has no analytic upper envelope. +y is
 * DOWN, so "terrain above the line of sight" means a MORE NEGATIVE y.
 */
export const GROUND_TARGET_SPACING_WU = 140;

export function visibleGroundTargets(terrain, opts = {}) {
  const { x0 = 0, altWu = 500, aheadWu = 888,
          spacing = GROUND_TARGET_SPACING_WU, step = 20 } = opts;
  const eyeY = -Math.abs(altWu);
  const total = Math.floor(aheadWu / spacing);
  let n = 0;
  const hidden = [];
  for (let i = 1; i <= total; i++) {
    const d = i * spacing;
    const tx = x0 + d;
    const ty = terrain.yAt(tx);
    let vis = true;
    for (let sx = step; sx < d; sx += step) {
      const lineY = eyeY + (ty - eyeY) * (sx / d);
      if (terrain.yAt(x0 + sx) < lineY) { vis = false; break; }
    }
    if (vis) n++; else hidden.push(d);
  }
  return { n, total, hidden };
}

export function terrainProfileErrors(def = {}) {
  const out = [];
  const p = { ...(TERRAIN_PROFILES[def.profile] || TERRAIN_PROFILES.trenchline), ...def };
  if (def.profile !== undefined && !TERRAIN_PROFILES[def.profile])
    out.push(`unknown terrain profile ${JSON.stringify(def.profile)}; legal: ${Object.keys(TERRAIN_PROFILES).join(', ')}`);
  if (!(p.amp > 0)) out.push(`amp must be positive, got ${p.amp}`);
  else if (p.amp > MAX_TERRAIN_WU)
    out.push(`amp ${p.amp} wu reaches into ${BELT.name} — Mud is ${MAX_TERRAIN_WU} wu and the ground ` +
             `silhouette may not occupy the band above it (D27: the bands must read as different places)`);
  if (!(p.wavelength > 0)) out.push(`wavelength must be positive, got ${p.wavelength}`);
  else {
    /**
     * `slopeBound` is this generator's own closed form, not a sine's. The check
     * is on the TRIPLE — amplitude, wavelength and detail — because the fine
     * octave runs at a quarter of the wavelength and therefore contributes four
     * times its share of the slope.
     */
    const slope = slopeBound(p.amp, p.wavelength, p.detail);
    if (slope > MAX_SLOPE)
      out.push(`amp ${p.amp} over wavelength ${p.wavelength} gives a max slope of ${slope.toFixed(3)} ` +
               `(${(Math.atan(slope) * 180 / Math.PI).toFixed(1)} deg) against the ${MAX_SLOPE.toFixed(3)} bound — ` +
               `best climb 90 wu/s over cruise 280 wu/s. A valley floor steeper than that has no exit`);
  }
  if (!(p.detail >= 0 && p.detail <= 1)) out.push(`detail must be in [0, 1], got ${p.detail}`);
  return out;
}

/**
 * `createTerrain(level)` — the silhouette.
 *
 * Value noise, not `Math.random`: two octaves of a seeded, interpolated lattice.
 * Seeded from the LEVEL's seed, so the same (id, seed) gives the same ground
 * everywhere it is drawn or collided with (W3).
 */
export function createTerrain(level = {}) {
  const def = level.terrain || {};
  const p = { ...(TERRAIN_PROFILES[def.profile] || TERRAIN_PROFILES.trenchline), ...def };
  const errors = terrainProfileErrors(def);

  // A fixed lattice, generated once. No allocation after this point.
  const N = 1024;
  const rng = createRNG(hashSeed(level.seed || level.id || 'terrain'));
  const a = new Float64Array(N), b = new Float64Array(N);
  for (let i = 0; i < N; i++) { a[i] = rng.next(); b[i] = rng.next(); }

  const smooth = (t) => t * t * (3 - 2 * t);          // C1 at the lattice points
  function lattice(arr, x, wl) {
    const u = x / wl;
    const i = Math.floor(u);
    const t = smooth(u - i);
    const i0 = ((i % N) + N) % N, i1 = (i0 + 1) % N;
    return arr[i0] * (1 - t) + arr[i1] * t;
  }

  /**
   * Height ABOVE the ground plane, in world units, always >= 0. +y is down, so
   * the silhouette's y is `GROUND_WU - heightAt(x)`.
   */
  function heightAt(xWu) {
    const base = lattice(a, xWu, p.wavelength);
    const fine = lattice(b, xWu, p.wavelength / 4);
    const v = base * (1 - p.detail * 0.5) + fine * (p.detail * 0.5);
    return v * p.amp;
  }

  return {
    profile: p.profile || 'trenchline', amp: p.amp, wavelength: p.wavelength, detail: p.detail,
    errors,
    heightAt,
    /** Silhouette y in world units — what the renderer draws. */
    yAt: (xWu) => GROUND_WU - heightAt(xWu),
    /**
     * The socket `js/gfx/particles.js` already has. Particles are in SI metres
     * like the rest of `js/sim/`, so the adapter converts once, here, rather
     * than leaving every caller to remember which side of M_PER_WU it is on.
     */
    query: (xM) => -heightAt(xM / M_PER_WU) * M_PER_WU,
    maxSlope: () => {
      let s = 0;
      const step = p.wavelength / 64;
      for (let x = 0; x < p.wavelength * N; x += step)
        s = Math.max(s, Math.abs(heightAt(x + step) - heightAt(x)) / step);
      return s;
    },
  };
}

function hashSeed(s) {
  let h = 2166136261 >>> 0;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
