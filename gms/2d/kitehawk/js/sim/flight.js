/**
 * The aircraft. DESIGN §1.6–§1.10's model form on P4's re-derived coefficients.
 *
 * The one thing to understand before changing anything here: the stick does not
 * command alpha, it commands a LOAD FACTOR, and a limiter converts that to an
 * alpha inside the envelope. That is why the player cannot stall by pulling, and
 * it is the whole of "easy to play". The expert's way back in is the release
 * hatch — full deflection held below 24 m/s — and a stall turn is what that hatch
 * plus the stall's own asymmetry produce. Nobody writes a stallTurn().
 *
 * Pure: no DOM, no clock, no Math.random. Randomness arrives as ctx.rng.
 */

import { clamp } from '../core/math.js';
import { G_SI, PITCH, N_REF, STRESS, VNE_DAMAGE, FUEL, LIFT,
         REFERENCE, pitchCeiling } from '../data/tables.js';
import { nAvailable, alphaForCL, wingLiftFor, stallAlpha, stallAlphaNeg, DEG, density,
         createForces } from './aero.js';
import { integrate, syncWorld, wrapPi } from './physics.js';

const UPRIGHT = { gamma: 25 * DEG, dwell: 0.6, rollTime: 0.4 };
const STALL_BIAS = 1.6;          // rad/s^2, DESIGN §1.6. The nose falls whether you like it or not.

export function createFlight(ctx = {}, opts = {}) {
  const a = opts.airframe || REFERENCE;
  const rng = ctx.rng ? ctx.rng.fork(opts.id || 'flight') : null;

  const e = {
    id: opts.id || 'player',
    airframe: a,
    // --- SI state: the six variables of DESIGN §1.1, plus roll (§1.8)
    sx: opts.xM ?? 0, sy: opts.yM ?? -300,
    svx: 0, svy: 0,
    theta: opts.theta ?? 0,
    q: 0,
    roll: opts.roll ?? 1,
    // --- world-unit mirror, DERIVED every tick by syncWorld (D26). Never authored.
    x: 0, y: 0, vx: 0, vy: 0, angle: 0, speed: 0, speedSI: 0, altM: 0,
    hull: 64,
    // --- readouts. `aero` is this aircraft's OWN force-resolve object, allocated
    // once and written in place by physics.integrate. Never share it (P5).
    aero: createForces(),
    alpha: 0, alphaW: 0, gamma: 0, n: 1, stress: 0, stressPeak: 0,
    throttle: 1, fuel: opts.fuel ?? FUEL.capacity, fuelOut: false,
    stalled: false, stallCount: 0, limiterOn: true, limiterReleased: false,
    greyout: 0, blackout: 0, lag: 0, inverted: false, rolling: false,
    overVneHP: 0, overStressHP: 0, damageHP: 0,
    tailGone: false, engineOut: false, noAssist: !!opts.noAssist,
    axisY: 0, axisX: 0,
  };

  const v0 = opts.speed ?? 40;
  e.svx = Math.cos(e.theta) * v0;
  e.svy = Math.sin(e.theta) * v0;
  syncWorld(e);

  let holdT = 0, greyT = 0, blackT = 0, uprightT = 0;
  let rollT = 0, rollFrom = e.roll, rollTo = e.roll;
  let dropT = 0, dropRate = 0, qBias = 0, stallCut = 0;
  const lagBuf = [];

  /** What the pitch envelope allows at this speed, expressed as a load factor. */
  function nCeiling(v) {
    const om = pitchCeiling(v, a) * (e.tailGone ? 0.5 : 1);
    const k = om * v / G_SI;
    return Math.sqrt(1 + k * k);
  }

  /** The most the aircraft may be asked for: the wing first, then the arcade envelope. */
  const alphaMargin = a.bug === 'no-limiter' ? 1.6 : PITCH.alphaMargin;

  function nMaxCmd(v, altM) {
    return Math.min(nCeiling(v), nAvailable(a, v, altM, alphaMargin));
  }

  function autoThrottle(dt, target) {
    let th = 1.0;
    if (e.fuel <= 0 || e.engineOut) th = 0;
    else {
      // DESIGN §1.10's anti-overshoot cut: without it the auto-throttle flies the
      // player THROUGH every gun solution.
      if (target && target.astern && target.range < 30 && target.closure > 12) th = 0.55;
      if (stallCut > 0) { th = 0; stallCut -= dt; }
      // DESIGN §2.3: the horizontal axis is a brake, relative to the aircraft's
      // own screen facing (P2_NOTES §9.2 — input does not know which way it points).
      const facing = Math.cos(e.theta) >= 0 ? 1 : -1;
      if (Math.abs(e.axisX) > 0.25 && Math.sign(e.axisX) !== facing) th = Math.min(th, 0.25);
    }
    e.throttle = th;
    const burn = th >= 0.9 ? FUEL.burnFull : th >= 0.4 ? FUEL.burnCruise : FUEL.burnIdle;
    if (e.fuel > 0) e.fuel = Math.max(0, e.fuel - burn * dt);
    e.fuelOut = e.fuel <= 0;
    return th;
  }

  function update(dt, target = null) {
    const v = Math.hypot(e.svx, e.svy);
    const altM = -e.sy;
    const gamma = Math.atan2(e.svy, e.svx);
    const alpha = wrapPi(gamma - e.theta);
    const s = e.roll >= 0 ? 1 : -1;
    const alphaW = s * alpha;

    // ---- stick. Thumb up gives axisY < 0 (§6.4), which is a pull.
    let stick = -e.axisY;
    if (e.lag > 0) { lagBuf.push(stick); stick = lagBuf.length > 15 ? lagBuf.shift() : lagBuf[0]; }
    else if (lagBuf.length) lagBuf.length = 0;

    const nMax = nMaxCmd(v, altM);
    const nNeg = -Math.max(2.5, 0.35 * nMax);

    // ---- the expert's escape hatch (DESIGN §1.7, register T7)
    if (Math.abs(stick) > 0.98 && v < PITCH.releaseSpeed) holdT += dt; else holdT = 0;
    e.limiterReleased = holdT > PITCH.releaseHold;
    e.limiterOn = !e.limiterReleased;

    let alphaCmd;
    if (e.limiterReleased) {
      alphaCmd = stick * 34 * DEG;                     // raw. You may hang it on the prop.
    } else {
      const nCmd = stick >= 0 ? 1 + stick * (nMax - 1) : 1 + stick * (1 - nNeg);
      const qS = 0.5 * density(altM, a) * v * v * a.S;
      const clReq = qS > 1e-6 ? wingLiftFor(nCmd, a) / qS : 0;
      const capHi = a.CLmax * alphaMargin;
      const capLo = -a.CLmax * LIFT.negFactor * alphaMargin;
      alphaCmd = alphaForCL(clamp(clReq, capLo, capHi), a);
    }

    // ---- the pitch law (DESIGN §1.7 on ARCHITECTURE §3.4's envelope)
    let qMax = pitchCeiling(v, a);
    let Kq = PITCH.Kq;
    if (e.tailGone) { qMax *= 0.5; Kq *= 0.6; }

    // gamma_dot fed forward so the aircraft TRACKS its turn instead of lagging it.
    const f0 = e.aero.resolved ? e.aero : null;
    const aNorm = f0 ? (f0.lift * Math.cos(alpha) + f0.thrust * Math.sin(alpha)) / a.m - G_SI * Math.cos(gamma) : 0;
    const gammaDot = v > 1e-3 ? -aNorm / v : 0;

    let qCmd = clamp(gammaDot - s * Kq * (alphaCmd - alphaW), -qMax, qMax);

    // ---- stall: three components. A stall turn is what they add up to.
    const over = alphaW > stallAlpha ? alphaW - stallAlpha
               : alphaW < stallAlphaNeg ? alphaW - stallAlphaNeg : 0;
    if (over !== 0) {
      if (!e.stalled) {
        e.stalled = true; e.stallCount++; stallCut = 0.4;
        const mag = (18 + (rng ? rng.next() : 0.5) * 16) * DEG;    // 2. wing drop, seeded side
        const side = a.bug === 'fixed-drop' ? 1 : (rng ? (rng.bool() ? 1 : -1) : 1);
        dropRate = side * mag / 0.25;
        dropT = 0.25;
      }
      // 1. pitch-down bias, integrated as the angular acceleration it is
      const bias = a.bug === 'no-stall-bias' ? 0 : STALL_BIAS;
      qBias += s * Math.sign(over) * bias * Math.min(1, Math.abs(over) / stallAlpha) * dt;
    } else {
      if (e.stalled && Math.abs(alphaW) < stallAlpha * 0.85) e.stalled = false;
      qBias -= clamp(qBias, -3 * dt, 3 * dt);
    }
    qCmd = clamp(qCmd + qBias, -qMax * 2, qMax * 2);
    if (dropT > 0) { qCmd += dropRate; dropT -= dt; }

    // ---- roll state and the auto-upright assist (DESIGN §1.8)
    // The condition is on the CLIMB ANGLE, not on gamma. Level flight to the left
    // is gamma = pi, so "|gamma| < 25 deg" would never fire after an Immelmann —
    // which is the one manoeuvre the assist exists for.
    const climb = Math.asin(clamp(e.svy / Math.max(1e-6, v), -1, 1));
    e.inverted = e.roll * Math.cos(e.theta) < 0;
    if (rollT > 0) {
      rollT -= dt;
      const u = clamp(1 - rollT / UPRIGHT.rollTime, 0, 1);
      e.roll = rollFrom + (rollTo - rollFrom) * u;
      e.rolling = rollT > 0;
      if (rollT <= 0) { e.roll = rollTo; e.rolling = false; }
    } else if (e.inverted && Math.abs(climb) < UPRIGHT.gamma && Math.abs(stick) < 0.05 && !e.noAssist) {
      uprightT += dt;
      if (uprightT > UPRIGHT.dwell) {
        uprightT = 0; rollT = UPRIGHT.rollTime; rollFrom = e.roll; rollTo = -e.roll;
      }
    } else {
      uprightT = 0;                                    // any touch cancels it instantly
    }

    // ---- throttle, then integrate
    const th = autoThrottle(dt, target);
    integrate(a, e, qCmd, th, dt);
    syncWorld(e);

    // ---- readouts and the two damage regimes
    const f = e.aero;
    e.alpha = f.alpha; e.alphaW = f.alphaW; e.gamma = f.gamma; e.n = f.n;
    e.stress = Math.abs(f.n) / N_REF;
    if (e.stress > e.stressPeak) e.stressPeak = e.stress;

    // D32/R-07: the stress limit is not decorative. Over it, the airframe pays.
    const excess = e.stress - a.stressLimit;
    if (excess > 0) {
      const hp = excess * STRESS.overstressHP * dt;
      e.overStressHP += hp; e.damageHP += hp;
    }
    // R-08: reachable at last, because terminal is now above Vne.
    if (e.speedSI > a.vne) {
      const hp = (VNE_DAMAGE.base + VNE_DAMAGE.perMS * (e.speedSI - a.vne)) * dt;
      e.overVneHP += hp; e.damageHP += hp;
    }

    // ---- the pilot, not the airframe (ARCHITECTURE §3.4)
    greyT = e.stress >= STRESS.greyOn ? greyT + dt : Math.max(0, greyT - dt * 2);
    blackT = e.stress >= STRESS.blackOn ? blackT + dt : Math.max(0, blackT - dt * 2);
    e.greyout = greyT > STRESS.greyHold ? Math.min(1, (greyT - STRESS.greyHold) / 1.2) : 0;
    e.blackout = blackT > STRESS.blackHold ? 1 : 0;
    e.lag = e.blackout ? STRESS.greyLag : 0;

    return e;
  }

  e.update = update;
  e.setInput = (axisY, axisX = 0) => { e.axisY = axisY; e.axisX = axisX; };
  e.nMaxCmd = nMaxCmd;
  e.nCeiling = nCeiling;
  return e;
}

/** The stress scale, for the HUD and for anything that must not print a g number. */
export const stressOf = (n) => Math.abs(n) / N_REF;
