/**
 * The flight tables. SI is authored; world units are derived here and nowhere
 * else (D26, ARCHITECTURE §3.0, rule 16). A wu number with no SI number beside
 * it is unreviewable — that is how a 268 m/s stall speed survived a full pass.
 *
 * Pure. node imports this directly; nothing here touches the DOM or the clock.
 */

import { M_PER_WU, wu } from '../core/math.js';
import { BANDS, CEILING_WU, GROUND_WU, CONCORD_LINE_WU, BAND_IDS, bandAt, bandT, bandIdAt,
         altitudeFeet, altitudeMetres } from '../core/bands.js';

export { BANDS, CEILING_WU, GROUND_WU, CONCORD_LINE_WU, BAND_IDS, bandAt, bandT, bandIdAt,
         altitudeFeet, altitudeMetres };

/* ---------------------------------------------------------------- world ---- */

export const G_SI = 9.81;                    // m/s^2
export const G_WU = G_SI / M_PER_WU;         // 65.4 wu/s^2
export const RHO0 = 1.225;                   // kg/m^3 at sea level
export const H_SCALE = 2500;                 // atmosphere scale height, m. DESIGN T1.
export const THRUST_LAPSE = 0.7;             // T = T0 * (rho/rho0)^0.7 (normally-aspirated rotary)

/**
 * ARCHITECTURE §3.0/§3.5's declared arcade factor: our turn rate at corner is
 * 2.8x what a 1917 airframe managed. It is a REPORTED ratio, not a coefficient —
 * see AGILITY_MARGIN below and docs/P4_NOTES.md §3 for why the literal reading
 * ("commanded load factor = 2.8 x what the wing gives") had to be replaced.
 */
export const AGILITY = 2.8;

/**
 * The coefficient that actually produces it. The multiplier is applied to the
 * MANOEUVRING MARGIN, not to the lift that carries the weight:
 *
 *     n_available(v) = 1 + AGILITY_MARGIN * (n_aero(v) - 1)
 *
 * so at the stall speed the aircraft has exactly 1 g and the stall stays a real,
 * measurable, behavioural thing. Multiplying the whole lift instead moves the
 * minimum flying speed to Vs/sqrt(A) = 9.9 m/s and there is then no stall in the
 * game at all — the gate's 16.5 m/s becomes unmeasurable. P4_NOTES §3.
 */
export const AGILITY_MARGIN = 1.5747;

/** §3.0's other declared factor: the hull is DRAWN 1.6x oversize. Never enters the physics. */
export const HULL_SCALE = 1.6;

/* ------------------------------------------------------- pitch envelope ---- */
/**
 * ARCHITECTURE §3.4: max commanded pitch rate 126 deg/s at <= 45 m/s, falling to
 * 67 deg/s at Vne. DESIGN §1.7's 150 -> 95 is pre-D26 and struck by R-01.
 * DESIGN §1.7's low-speed authority term survives and is what makes the mush real.
 */
export const PITCH = {
  omegaLo: 95 * Math.PI / 180,    // rad/s, at or below vLo. P4_NOTES §3: 126 is unflyable.
  omegaHi: 67 * Math.PI / 180,    // rad/s, at Vne
  vLo: 45,                        // m/s
  authV: 32,                      // m/s — elevator effectiveness saturates here
  authFloor: 0.25,
  Kq: 7.0,                        // DESIGN T5. 0.14 s alpha time constant.
  alphaMargin: 0.94,              // DESIGN T6, the limiter's slice of CLmax
  releaseHold: 0.35,              // DESIGN T7 — full deflection held this long...
  releaseSpeed: 24,               // ...below this speed releases the limiter (the hammerhead)
};

/**
 * rad/s ceiling on commanded pitch rate at speed v. `a` may be an airframe (its
 * own omLo/omHi/vne win) or a bare Vne for the ARCHITECTURE §3.4 default.
 */
export function pitchCeiling(v, a) {
  const vne = typeof a === 'number' ? a : a.vne;
  const omLo = typeof a === 'number' ? PITCH.omegaLo : a.omLo;
  const omHi = typeof a === 'number' ? PITCH.omegaHi : a.omHi;
  const { vLo, authV, authFloor } = PITCH;
  const span = Math.max(1, vne - vLo);
  const base = v <= vLo ? omLo : Math.max(omHi * 0.5, omLo + (omHi - omLo) * (v - vLo) / span);
  const auth = Math.min(1, Math.max(authFloor, (v / authV) * (v / authV)));
  return base * auth;
}

/* -------------------------------------------------------------- stress ----- */
/**
 * D32 / ruling R-07. "4.5 g structural" is deleted: even the corrected pitch
 * envelope is 10.1 physical g at the top of the max-rate plateau, so a 4.5 in a
 * table was decorative. STRESS = n_commanded / N_REF, and N_REF is the load
 * factor of the HARDEST PULL THE AIRFRAME CAN BE ASKED FOR — a full-deflection
 * recovery at Vne, 11.13 g. R-07 suggests anchoring on the corner-speed turn
 * instead; that cannot be right, because it makes the ordinary SUSTAINED combat
 * turn read 0.91 stress and black the pilot out (P4_NOTES §4). The HUD prints
 * STRESS, never G.
 *
 * What enforces it (this is the part D32 says must not be missing): a commanded
 * stress above the airframe's `stressLimit` does structural damage, at
 * OVERSTRESS_HP per second per unit of excess. Nothing is silently clamped, and
 * the number in the table decides when the wings start to go.
 */
export const N_REF = 11.13;             // see P4_NOTES §4 for why it is not the corner turn
export const STRESS = {
  greyOn: 0.72, greyHold: 1.2,          // ARCHITECTURE §3.4, unchanged
  blackOn: 0.88, blackHold: 0.8,
  greyLag: 0.25,                        // s of added control lag once blacked out
  overstressHP: 200,                    // HP/s per 1.00 stress of excess over the limit
};

/* ------------------------------------------------------------- over Vne ---- */
/** DESIGN §1.9: 6 HP/s at Vne, +1 HP/s per m/s over. R-08 made this reachable. */
export const VNE_DAMAGE = { base: 6, perMS: 1 };

/* ------------------------------------------------------------ airframes ---- */
/**
 * Re-derived at P4 under ruling R-01: DESIGN §1's model form, ARCHITECTURE §3.4's
 * envelope. The arithmetic is in docs/P4_NOTES.md §2.
 *
 * Only four numbers are observable in flight — Vs, T0/W, CD0/CLmax and
 * kInd*CLmax — because every force in a point-mass model divides by W. m, S,
 * CLmax, CD0, T0 and kInd are a redundant parameterisation of those four, so the
 * SI values below were chosen to READ like an aeroplane; two different sets can
 * be the same aircraft. `nGuard` in tools/sim.mjs checks the derived four.
 */
const AIRFRAME_SI = [
  // name          act  m     S      CLmax  CD0      kInd     T0    Vne cFlutter stress am    omLo
  ['kite_b1',      1,   520,  23.498, 1.459, 0.05896, 0.06831, 3207, 93, 0.1610, 1.00, 1.5747,  95.0, 'Kite B.1'],
  ['kite_b2',      2,   540,  25.112, 1.459, 0.05326, 0.06758, 3400, 94, 0.2948, 1.04, 1.6010,  99.3, 'Kite B.2 "Scrapper"'],
  ['harrier_tri',  3,   575,  28.120, 1.459, 0.06598, 0.05875, 4100, 86, 0.4283, 1.09, 1.6522, 111.4, 'Harrier Tri'],
  ['lance_mk1',    3,   505,  21.180, 1.459, 0.04400, 0.07711, 2790, 99, 0.4771, 0.91, 1.7045,  86.0, 'Lance Mk.I'],
  ['kitehawk',     5,   530,  23.642, 1.459, 0.04631, 0.06383, 3724, 100, 0.3735, 1.11, 1.8352, 106.0, 'Kitehawk'],
];

/** DESIGN §1.3's lift curve, unchanged. CLmax = CL0 + CLa * a_stall. */
export const LIFT = {
  CL0: 0.15,
  CLa: 5.00,                 // per rad
  aStall: 15 * Math.PI / 180,
  negFactor: 0.80,           // CLmin is 20% weaker than CLmax (camber costs you inverted)
  // DESIGN §1.3's post-stall table, as (alpha deg, CL). Interpolated, then mirrored.
  post: [[15, 1.459], [18, 1.17], [22, 0.84], [30, 0.66], [45, 0.55], [90, 0.0]],
};

/** DESIGN §1.3's high-speed drag rise. Onset speed and span are model form. */
export const FLUTTER = { v0: 70, span: 40 };

/** DESIGN §1.10, unchanged. There is no throttle control and there must not be one. */
export const FUEL = { burnFull: 0.85, burnCruise: 0.45, burnIdle: 0.18, capacity: 100 };

function derive(row) {
  const [id, act, m, S, CLmax, CD0, kInd, T0, vne, cFlutter, stressLimit, am, omLoDeg, name] = row;
  return makeAirframe({ id, act, m, S, CLmax, CD0, kInd, T0, vne, cFlutter, stressLimit, am, name,
                        omLo: omLoDeg * Math.PI / 180 });
}

/**
 * Hull sizes, wu. D26's 0.15 m/wu makes 64 wu = 9.60 m, which is the Camel's
 * 5.7 m under ART's K = 1.6 stylisation factor.
 *
 * The ENEMY minimum is NOT the same number and is not a taste call (D128). It is
 * the smallest hull that clears §4.4.2 P3's 34 px silhouette line at landscape's
 * clamp floor, which is the tightest the auto camera may legally go:
 *
 *     hull >= barPx * worldH / (refH * zoomWide)
 *           = 34 * 560 / (390 * 0.74) = 65.97 wu  ->  66 wu (integer wu) = 9.90 m
 *
 * 64 wu gives 32.98 px and FAILS. There is 0.03 wu of slack in this, which is
 * why `tools/p3guard.mjs` exists and why lowering it is a DECISIONS-level change.
 */
export const PLAYER_HULL_WU = 64;
export const MIN_ENEMY_HULL_WU = 66;

/**
 * Build an airframe from SI. Exported so tools can fit variants and so P13's
 * upgrades can refit one without a second copy of this arithmetic.
 */
export function makeAirframe(spec) {
  const { id, act = 1, m, S, CLmax, CD0, kInd, T0, vne, cFlutter,
          stressLimit = 1, am = AGILITY_MARGIN, name = id,
          hullWu = PLAYER_HULL_WU,
          omLo = PITCH.omegaLo, omHi = PITCH.omegaHi,
          // Falsification switch. No shipped airframe ever sets it; tools/sim.mjs
          // --break builds one that does, so every assert can be watched going red
          // (D43, D47, and DESIGN §10.8's anti-mock rule). See tools/BLESSED.md.
          bug = '' } = spec;
  const W = m * G_SI;
  const vs = Math.sqrt(2 * W / (RHO0 * S * CLmax));
  return Object.freeze({
    id, name, act, m, S, CLmax, CD0, kInd, T0, vne, cFlutter, stressLimit, am, omLo, omHi, bug,
    W, vs,
    // the four observables, so a reader can check two airframes are not the same one
    t: T0 / W, p0: CD0 / CLmax, kappa: kInd * CLmax,
    // wu mirrors, DERIVED (D26). Never author these.
    vsWu: wu(vs), vneWu: wu(vne), hullWu,
  });
}

export const AIRFRAMES = Object.freeze(AIRFRAME_SI.map(derive));
export const AIRFRAME_BY_ID = Object.freeze(Object.fromEntries(AIRFRAMES.map(a => [a.id, a])));
export const REFERENCE = AIRFRAME_BY_ID.kite_b1;

/** DESIGN §1.11: engine/guns/armour refit free; these scale the airframe, not replace it. */
export const REFITS = Object.freeze({
  none:  { T0: 1, CD0: 1, stress: 0 },
  mk2:   { T0: 3500 / 3058, CD0: 1 - 0.004 / 0.06574, stress: +0.09 },  // R-07: "n_lim +0.4" -> +0.09 stress
});

/* ------------------------------------------------- band-table assertions --- */
/**
 * ARCHITECTURE §3.3's four constraints, checked at load rather than believed.
 * §3.3's own provisional table fails constraint 1 (Mud at 333 wu); R-02's set is
 * what js/core/bands.js carries and what this asserts.
 */
export function checkBands(bands = BANDS) {
  const fail = [];
  const thick = bands.map(b => Math.abs(b.y1 - b.y0));
  const min = Math.min(...thick);
  if (min < 700) fail.push(`constraint 1: thinnest band ${min} wu < 700`);
  const low3 = thick[0] + thick[1] + thick[2];
  if (low3 > 3000) fail.push(`constraint 2: three lowest sum ${low3} wu > 3000`);
  const deck = thick[bands.findIndex(b => b.id === 'deck')];
  if (deck < 1300) fail.push(`constraint 3: Deck ${deck} wu < 1300`);
  const total = thick.reduce((a, b) => a + b, 0);
  if (total !== 10000) fail.push(`constraint 4: total ${total} wu != 10000`);
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].y0 !== bands[i - 1].y1) fail.push(`gap between ${bands[i - 1].id} and ${bands[i].id}`);
  }
  const m = bands[bands.length - 1].m1;
  if (Math.abs(m - 1500) > 0.5) fail.push(`ceiling ${m} m != 1500 (D28)`);
  return fail;
}

const bandFails = checkBands();
if (bandFails.length) throw new Error('band table violates ARCHITECTURE §3.3: ' + bandFails.join('; '));

/* ------------------------------------------------------- unit self-check --- */
/**
 * Rule 16: cross-check every derived constant against a physical identity before
 * trusting it. `v_term = sqrt(g/k)` is what caught the 9.5x gravity error, so it
 * runs here, in SI and in wu, every time the module loads.
 */
export function unitIdentity(a = REFERENCE) {
  const kSI = 0.5 * RHO0 * a.S * a.CD0 / a.m;         // 1/m
  const kWU = kSI * M_PER_WU;                          // 1/wu
  const vSI = Math.sqrt(G_SI / kSI);                   // m/s
  const vWU = Math.sqrt(G_WU / kWU);                   // wu/s
  return { kSI, kWU, vSI, vWU, agrees: Math.abs(vWU * M_PER_WU - vSI) < 1e-9 };
}

const id0 = unitIdentity();
if (!id0.agrees) throw new Error('SI/wu scale conversion is broken, not the physics (§3.4)');
if (Math.abs(G_WU - 65.4) > 0.05) throw new Error(`gravity derived as ${G_WU} wu/s^2, expected 65.4`);
