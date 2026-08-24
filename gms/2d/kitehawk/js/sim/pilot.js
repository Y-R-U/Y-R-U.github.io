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

  /** Target flight-path angle for the current intent, in radians (+ is descending). */
  function targetGamma(ac) {
    const v = ac.speedSI, alt = ac.altM;
    switch (intent) {
      case 'level':  return 0;
      case 'hold': {
        const err = arg - alt;                       // + means we are low
        return clamp(-err / 90, -0.55, 0.55);
      }
      case 'climb':  return -0.55;
      case 'dive':   return Math.PI / 2 * clamp(arg || 1, -1, 1);
      case 'glide':  return 0.10;
      case 'turnUp': return -Math.PI;                // saturates: pull as hard as allowed
      case 'turnDown': return Math.PI;
      case 'point': {
        const dx = arg.xM - ac.sx, dy = arg.yM - ac.sy;
        return Math.atan2(dy, dx);
      }
      case 'speed': {
        // trade angle for a target speed; a shallow dive to gain, a climb to shed
        const err = (arg - v) / 12;
        return clamp(err, -0.5, 0.6);
      }
      default: return 0;
    }
  }

  function decide(ac) {
    const v = Math.max(1, ac.speedSI);
    const gTarget = targetGamma(ac);
    let dg = wrapAngle(gTarget - ac.gamma);
    if (intent === 'point') {
      // aim the velocity vector, not the nose: the nose is where the guns are but
      // the flight path is what actually arrives.
      dg = wrapAngle(gTarget - ac.gamma);
    }
    // desired turn rate, then the load factor that produces it
    const gd = clamp(dg * (2.4 * P.gain), -4, 4);
    const nWant = Math.cos(ac.gamma) * (ac.roll >= 0 ? 1 : -1) - v * gd / G_SI;
    const nMax = ac.nMaxCmd(v, ac.altM) * P.envelope;
    let stick = nMax > 1.02 ? (Math.abs(nWant) - 1) / (nMax - 1) : 0;
    stick = clamp(stick, 0, 1) * (nWant >= 0 ? 1 : -1);
    if (nWant < 0) stick = clamp(nWant / 3, -1, 0);

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
