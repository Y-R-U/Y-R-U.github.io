/**
 * The aerodynamics. DESIGN §1.2 and §1.3 verbatim in form; the coefficients are
 * P4's re-derivation under ruling R-01 and live in js/data/tables.js.
 *
 * Everything here is SI. Metres, m/s, newtons, radians. The world's world units
 * are derived from these by the caller, never the other way round (D26).
 *
 * Pure: no DOM, no clock, no Math.random.
 */

import { RHO0, H_SCALE, THRUST_LAPSE, AGILITY_MARGIN, LIFT, FLUTTER, G_SI } from '../data/tables.js';

export const DEG = Math.PI / 180;

/** DESIGN §1.2. alt in METRES above ground, not world y. */
export const density = (altM, a = null) => RHO0 * sigma(altM, a);
export const sigma = (altM, a = null) =>
  (a && a.bug === 'flat-atmosphere') ? 1 : Math.exp(-Math.max(0, altM) / H_SCALE);
/** Thrust falls with density: a normally-aspirated rotary loses 24% at 1000 m. */
export const thrustFactor = (altM, a = null) => Math.pow(sigma(altM, a), THRUST_LAPSE);

const { CL0, CLa, aStall, negFactor, post } = LIFT;
const CLMAX_CURVE = CL0 + CLa * aStall;              // 1.459 — the curve's own maximum
const aStallNeg = -(CLMAX_CURVE * negFactor + CL0) / CLa;   // -15.09 deg, from the same curve

/**
 * Lift coefficient. Linear to the stall, then DESIGN §1.3's post-stall table.
 * The negative branch is the same table scaled by `negFactor`, which is what
 * makes an inverted turn measurably worse — the camber penalty is real.
 *
 * Returned as a FRACTION OF THE CURVE, then scaled by the airframe's CLmax, so
 * an airframe with a different CLmax keeps the same shape and the same alphas.
 */
export function clOf(alpha, a = null) {
  const scale = a ? a.CLmax / CLMAX_CURVE : 1;
  if (alpha >= 0) {
    if (alpha <= aStall) return (CL0 + CLa * alpha) * scale;
    return postStall(alpha) * scale;
  }
  if (alpha >= aStallNeg) return (CL0 + CLa * alpha) * scale;
  return -postStall(-alpha) * negFactor * scale;
}

function postStall(alpha) {
  const d = alpha / DEG;
  for (let i = 1; i < post.length; i++) {
    if (d <= post[i][0]) {
      const [d0, c0] = post[i - 1], [d1, c1] = post[i];
      return c0 + (c1 - c0) * (d - d0) / (d1 - d0);
    }
  }
  return 0;
}

/** Inverse of the linear branch. Used by the limiter, which never commands past it. */
export function alphaForCL(cl, a = null) {
  const scale = a ? a.CLmax / CLMAX_CURVE : 1;
  return (cl / scale - CL0) / CLa;
}

export const stallAlpha = aStall;
export const stallAlphaNeg = aStallNeg;
export const clMaxCurve = CLMAX_CURVE;

/**
 * Parasite drag coefficient with DESIGN §1.3's high-speed rise. It is what gives
 * the dive a terminal speed instead of an unbounded one, and R-08 is why the
 * coefficient is now authored against `terminal = Vne * 1.02-1.05` rather than
 * guessed: below Vne a dive could never overspeed the airframe and the whole
 * over-the-red regime was unreachable.
 */
export function cd0Eff(v, a) {
  if (v <= FLUTTER.v0 || a.bug === 'no-flutter') return a.CD0;
  const u = (v - FLUTTER.v0) / FLUTTER.span;
  return a.CD0 * (1 + a.cFlutter * u * u);
}

/**
 * Drag coefficient. `clEff` is the COMMANDED lift coefficient — the one that
 * includes the agility multiplier — because R-01 requires the induced-drag
 * penalty to be paid on what you commanded, not on what a 1917 wing would have
 * managed. That is the whole reason a hard turn costs energy.
 */
export function cdOf(alpha, v, clEff, a) {
  let cd = cd0Eff(v, a) + a.kInd * clEff * clEff;
  const over = Math.abs(alpha) - (alpha >= 0 ? aStall : -aStallNeg);
  if (over > 0) {
    const s = Math.sin(over);
    cd += 0.90 * s * s;
  }
  return cd;
}

/**
 * The force resolve. Returns SI accelerations plus the readouts the flight model
 * and the HUD need. `throttle` is 0..1; the auto-throttle owns it (DESIGN §1.10).
 *
 * out is reused — copy anything you keep (§10 rule 9).
 */
const OUT = {
  ax: 0, ay: 0, v: 0, q: 0, rho: 0, alpha: 0, alphaW: 0, gamma: 0,
  cl: 0, clEff: 0, cd: 0, lift: 0, drag: 0, thrust: 0, n: 0, stalled: false,
};

/**
 * `roll` is -1..+1: which side of the aircraft the canopy is on, and how far
 * through a half-roll it is. There is no roll axis in a vertical-plane model, so
 * this is the whole of DESIGN §1.8: a half-loop leaves you flying the other way
 * with the canopy pointing at the ground, and the only thing that changes `roll`
 * is the auto-upright assist. At roll = 0 you are knife-edge and the wing makes
 * no lift, which is why a roll costs height.
 */
export function forces(a, sx, sy, vx, vy, theta, throttle, altM, roll = 1, out = OUT) {
  const v = Math.hypot(vx, vy);
  const gamma = Math.atan2(vy, vx);
  let alpha = gamma - theta;
  alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));

  const s = roll >= 0 ? 1 : -1;
  const alphaW = s * alpha;                 // angle of attack in the wing's own frame

  const rho = density(altM, a);
  const qS = 0.5 * rho * v * v * a.S;

  const cl = clOf(alphaW, a);
  const Lwing = qS * cl;
  const Lmag = liftWithMargin(Lwing, a);    // the arcade margin, ARCHITECTURE §3.0
  const clEff = qS > 1e-6 ? Lmag / qS : 0;
  const cd = cdOf(alphaW, v, clEff, a);

  const L = Lmag * roll;                    // signed by which way up the wing is
  if (v < 1e-6) { out.ax = 0; out.ay = G_SI; out.v = 0; out.n = 0; return out; }
  const D = qS * cd;
  const T = a.T0 * thrustFactor(altM, a) * throttle;

  // WIND AXES. Lift is perpendicular to the free-stream, drag along it; thrust
  // is the only force on the body axis. DESIGN §1.3 writes lift along the body
  // normal +n, and that is a real bug rather than a simplification: at the 14 deg
  // alpha of a corner-speed turn it puts L*sin(alpha) = 0.24 L straight down the
  // flight path, which is TWICE the modelled induced drag again on top of itself.
  // The aircraft then bleeds 45 m/s in a max-rate turn instead of 8. P4_NOTES §5.
  const cf = Math.cos(theta), sf = Math.sin(theta);
  const vh = v > 1e-6 ? 1 / v : 0;
  const ux = vx * vh, uy = vy * vh;         // unit velocity
  const px = uy, py = -ux;                  // its perpendicular, canopy side for roll > 0

  const bx = a.bug === 'lift-body-axis' ? sf : px;     // the forbidden body-axis lift,
  const by = a.bug === 'lift-body-axis' ? -cf : py;    // shipped alongside so it can be measured
  out.ax = (T * cf + L * bx - D * ux) / a.m;
  out.ay = (T * sf + L * by - D * uy) / a.m + G_SI;
  out.v = v; out.q = qS / a.S; out.rho = rho;
  out.alpha = alpha; out.alphaW = alphaW; out.gamma = gamma;
  out.cl = cl; out.clEff = clEff; out.cd = cd;
  out.lift = L; out.drag = D; out.thrust = T;
  out.n = L / a.W;
  out.stalled = alphaW > aStall || alphaW < aStallNeg;
  return out;
}

/**
 * The arcade margin. Lift up to 1 g is what the wing makes; everything ABOVE 1 g
 * is multiplied. Continuous, monotone, and exactly 1 g at the stall speed, which
 * is what keeps the stall real. A push (negative lift) is never multiplied — you
 * cannot bunt at 2.5 x 1.58 g and nobody would want to.
 */
export function liftWithMargin(Lwing, a) {
  const W = a.W, am = a.bug === 'no-margin' ? 1 : (a.am || AGILITY_MARGIN);
  return Lwing > W ? W + am * (Lwing - W) : Lwing;
}

/** Inverse: the wing lift needed to produce a commanded load factor. */
export function wingLiftFor(n, a) {
  const am = a.bug === 'no-margin' ? 1 : (a.am || AGILITY_MARGIN);
  return n > 1 ? a.W * (1 + (n - 1) / am) : n * a.W;
}

/** Load factor the wing can actually deliver at this speed and altitude. */
export function nAvailable(a, v, altM, margin = 1) {
  const Lwing = 0.5 * density(altM, a) * v * v * a.S * a.CLmax * margin;
  return liftWithMargin(Lwing, a) / a.W;
}

/** Level 1 g stall speed at altitude. */
export function stallSpeed(a, altM = 0) {
  return Math.sqrt(2 * a.W / (density(altM, a) * a.S * a.CLmax));
}
