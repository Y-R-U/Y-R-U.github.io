/**
 * The virtual pilot, at three tiers. The same file drives the in-game AI at P5:
 * the thing that plays the game headlessly is the thing that flies the enemies,
 * which is the only reason 100 levels can be balanced (ARCHITECTURE §8.1).
 *
 * A tier is four numbers — how often it decides, how finely it can place the
 * stick, how much of the envelope it is willing to use, and how much it wanders.
 * Nothing here knows about guns; P5 adds the state machine on top and calls the
 * same `setIntent`.
 *
 * Pure: no DOM, no clock, no Math.random.
 */

import { clamp, wrapAngle } from '../core/math.js';
import { G_SI } from '../data/tables.js';
import { cornerSpeed } from './aero.js';

export const TIERS = {
  novice:    { period: 0.30, quantum: 0.25, envelope: 0.62, gain: 0.55, wander: 0.10, lead: 0.5 },
  competent: { period: 0.16, quantum: 0.12, envelope: 0.86, gain: 0.85, wander: 0.05, lead: 0.9 },
  ace:       { period: 0.08, quantum: 0.03, envelope: 1.00, gain: 1.00, wander: 0.015, lead: 1.2 },
};

export function createPilot(ctx = {}, opts = {}) {
  const tier = opts.tier && TIERS[opts.tier] ? opts.tier : 'competent';
  const P = TIERS[tier];
  const rng = ctx.rng ? ctx.rng.fork('pilot:' + (opts.id || tier)) : null;

  let intent = opts.intent || 'level';
  let arg = opts.arg ?? 0;
  let t = 0, axisY = 0, axisX = 0, wander = 0;

  /**
   * Target flight-path angle for the current intent, in radians.
   *
   * THE THING TO UNDERSTAND: gamma is an absolute world angle and half the
   * aeroplanes in this game fly WEST. `level` used to return 0, which for an
   * aeroplane at gamma = pi is not "fly level", it is "reverse"; and `turnUp`
   * used to return -pi, whose error against gamma = pi wraps to exactly zero, so
   * a hard break was a no-op for every hostile in the game. Both were invisible
   * to P4 because every one of its fixtures flies +x.
   *
   * So the intents that mean something about the FLIGHT PATH are expressed as a
   * climb angle `chi` (positive = climbing) about the aircraft's current
   * horizontal direction, and converted once, here:
   *
   *     eastbound   gamma = -chi
   *     westbound   gamma =  chi - pi
   *
   * The intents that mean something about the WORLD (`dive`) keep their absolute
   * angle, because "straight down" is straight down whichever way you were
   * going. The intents that mean maximum deflection (`turnUp`, `turnDown`) are
   * expressed relative to the current flight path and to which side the canopy
   * is on, because that is what "pull" means.
   */
  function headed(ac, chi) {
    const dir = Math.cos(ac.gamma) >= 0 ? 1 : -1;
    return dir > 0 ? -chi : chi - Math.PI;
  }

  function targetGamma(ac) {
    const v = ac.speedSI, alt = ac.altM;
    const s = ac.roll >= 0 ? 1 : -1;
    switch (intent) {
      case 'level':  return headed(ac, 0);
      case 'hold': {
        const err = arg - alt;                       // + means we are low
        return headed(ac, clamp(err / 90, -0.55, 0.55));
      }
      case 'climb':  return headed(ac, 0.55);
      case 'dive':   return Math.PI / 2 * clamp(arg || 1, -1, 1);   // absolute, deliberately
      case 'glide':  return headed(ac, -0.10);
      // Saturating: pull / push as hard as the limiter allows, continuing past
      // the vertical. Relative to the flight path so it never degenerates, and
      // signed by `roll` so that "up" is toward the canopy for a canopy-down
      // aeroplane too.
      case 'turnUp':   return wrapAngle(ac.gamma - s * 2.4);
      case 'turnDown': return wrapAngle(ac.gamma + s * 2.4);
      case 'point': {
        const dx = arg.xM - ac.sx, dy = arg.yM - ac.sy;
        return Math.atan2(dy, dx);
      }
      case 'speed': {
        // trade angle for a target speed; a shallow dive to gain, a climb to shed
        const err = (arg - v) / 12;
        return headed(ac, -clamp(err, -0.5, 0.6));
      }
      default: return headed(ac, 0);
    }
  }

  function decide(ac) {
    const v = Math.max(1, ac.speedSI);
    const s = ac.roll >= 0 ? 1 : -1;
    const gTarget = targetGamma(ac);
    const dg = wrapAngle(gTarget - ac.gamma);
    // desired turn rate, then the load factor that produces it
    const gd = clamp(dg * (2.4 * P.gain), -4, 4);
    /**
     * gamma_dot = g (cos gamma - n) / v, with n = roll * m and `m` the lift the
     * wing is asked for measured TOWARD THE CANOPY. Inverting:
     *
     *     m = roll * (cos gamma - v * gd / g)
     *
     * The `roll` belongs on both terms. It used to sit only on the first, which
     * for roll = -1 — an UPRIGHT aeroplane heading west, which is what the
     * auto-upright assist produces after any Immelmann and what every hostile in
     * the game starts as — inverted the turn-rate term, and the pilot flew the
     * exact opposite of what it was told. Isolated in tools/lab/roll.mjs: told
     * to climb 300 m, an eastbound aeroplane reached 738 m and a westbound one
     * reached 312 m, having dived.
     */
    const nWant = s * (Math.cos(ac.gamma) - v * gd / G_SI);

    /**
     * `envelope` is "the fraction of the envelope this pilot is willing to use",
     * so it CAPS the commanded load factor. It used to divide `nMax` before the
     * stick was solved, which makes a smaller envelope produce a LARGER stick
     * for the same wanted turn — the novice then commanded more g than the ace
     * and out-turned him, and `k` came out anti-monotone by 29 points.
     */
    const nMax = ac.nMaxCmd(v, ac.altM);
    /**
     * The energy governor, and it is what makes `envelope` a skill dial instead
     * of a liability.
     *
     * P4's F8/F9: the instantaneous turn is 95 deg/s, the sustained one 74, and
     * the difference costs 7.2 m/s of energy every second you take it. A pilot
     * allowed the FULL envelope therefore pulls maximum rate through a whole
     * turning fight and arrives at the bottom with nothing — so restoring the
     * correct `envelope` semantics made the `ace` tier measurably WORSE than
     * `novice` and `k` came out anti-monotone.
     *
     * Below corner speed the wing cannot pay for a max-rate turn at all, so
     * every pilot is governed identically there — nobody is allowed to spiral
     * into the deck. Above it, spending the envelope is affordable, and that is
     * the regime where a higher `envelope` is worth having. The tier ladder then
     * differentiates where it should and cannot hurt where it should not.
     */
    const vc = cornerSpeed(ac.airframe, ac.altM);
    const govern = v >= vc ? 1 : clamp(0.30 + 0.70 * (v / vc) * (v / vc), 0.30, 1);
    const cap = Math.min(1, P.envelope) * govern;
    let stick = nMax > 1.02 ? (Math.abs(nWant) - 1) / (nMax - 1) : 0;
    stick = clamp(stick, 0, cap) * (nWant >= 0 ? 1 : -1);
    if (nWant < 0) stick = clamp(nWant / 3, -cap, 0);

    if (rng) wander = wander * 0.85 + rng.gauss(0, P.wander) * 0.15;
    stick = clamp(stick + wander, -1, 1);
    if (P.quantum > 0) stick = Math.round(stick / P.quantum) * P.quantum;
    return clamp(stick, -1, 1);
  }

  function update(dt, ac) {
    t -= dt;
    if (t <= 0) {
      t = P.period;
      const stick = decide(ac);
      axisY = -stick;                       // §6.4: thumb up is negative and means nose up
    }
    ac.setInput(axisY, axisX);
    return { axisY, axisX };
  }

  return {
    tier, params: P,
    get intent() { return intent; },
    setIntent(name, value = 0) { intent = name; arg = value; return this; },
    setAxisX(v) { axisX = clamp(v, -1, 1); },
    update,
  };
}
