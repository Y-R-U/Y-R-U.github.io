// SKYPUTT engine constants. 1 unit = 1 metre, Y up. Pure data: safe to import in node.

export const BALL_R = 0.05;        // ball radius (bigger than real so it reads on phones)
export const CUP_R = 0.11;         // cup radius
export const CUP_DEPTH = 0.16;     // cup depth below the rim
export const G = 9.81;
export const HZ = 240;             // fixed physics rate (D5)
export const DT = 1 / HZ;

export const WALL_H = 0.12;        // wall height above the floor
export const WALL_T = 0.12;        // wall thickness
export const FLOOR_T = 0.10;       // visual slab thickness under open edges

export const SHOT_MIN = 0.25;      // m/s at the lowest non-zero power
export const SHOT_MAX = 6.4;       // m/s at full power (enough for a 0.45 m loop with margin)
export const SPEED_CAP = 10;       // hard cap; 10 m/s * DT = 0.042 m < BALL_R, so no tunnelling

export const STOP_SPEED = 0.035;   // below this (while supported) for STOP_TIME the ball is at rest
export const STOP_TIME = 0.2;
export const SHOT_TIMEOUT = 30;    // seconds; a shot that never settles is stopped
export const BOUNCE_MIN = 0.3;     // normal speed below which contacts don't bounce (resting contact)
export const ROLL_K = 5 / 7;
export const BOOST_ACC = 14;        // m/s^2 along a boost pad's arrow
export const BALL_E = 0.88;         // ball-vs-ball restitution (two golf balls clacking)
export const BOOST_MAX = 5.2;       // ...until the ball moves this fast along it       // a rolling solid sphere feels 5/7 of the slope's pull

// Material ids on collider triangles / shapes.
export const MAT = { GRASS: 0, FRINGE: 1, WALL: 2, RIM: 3, CUP: 4, BUMPER: 5, BLADE: 6, SAND: 7, ICE: 8, STICKY: 9, BOOST: 10, BRIDGE: 11, GLASS: 12 };

// Per-material response. roll = rolling friction coefficient (decel = roll * normal force),
// drag = speed-proportional decel (1/s), e = restitution, scrub = tangential loss per unit normal impulse.
// floor = true means the ball rolls on it (rolling friction + 5/7 slope factor); false = it bounces off.
export const SURFACES = [];
SURFACES[MAT.GRASS]  = { floor: true,  roll: 0.072, drag: 0.10, e: 0.28, scrub: 0.25 };
SURFACES[MAT.FRINGE] = { floor: true,  roll: 0.072, drag: 0.10, e: 0.28, scrub: 0.25 };
SURFACES[MAT.BRIDGE] = { floor: true,  roll: 0.060, drag: 0.08, e: 0.35, scrub: 0.20 };
SURFACES[MAT.SAND]   = { floor: true,  roll: 0.300, drag: 0.80, e: 0.05, scrub: 0.60 };
SURFACES[MAT.ICE]    = { floor: true,  roll: 0.015, drag: 0.02, e: 0.30, scrub: 0.05 };
SURFACES[MAT.STICKY] = { floor: true,  roll: 0.200, drag: 0.60, e: 0.10, scrub: 0.50 };
SURFACES[MAT.BOOST]  = { floor: true,  roll: 0.072, drag: 0.10, e: 0.28, scrub: 0.25 };   // + push along the pad (BOOST_*)
SURFACES[MAT.GLASS]  = { floor: true,  roll: 0.040, drag: 0.05, e: 0.30, scrub: 0.10 };
SURFACES[MAT.WALL]   = { floor: false, roll: 0,     drag: 0,    e: 0.72, scrub: 0.12 };
SURFACES[MAT.RIM]    = { floor: true,  roll: 0.072, drag: 0.10, e: 0.0,  scrub: 0.30 };
SURFACES[MAT.CUP]    = { floor: false, roll: 0,     drag: 0,    e: 0.25, scrub: 0.50 };
SURFACES[MAT.BUMPER] = { floor: false, roll: 0,     drag: 0,    e: 0.92, scrub: 0.05 };
SURFACES[MAT.BLADE]  = { floor: false, roll: 0,     drag: 0,    e: 0.55, scrub: 0.20 };

// Power (0..1 from the slingshot drag) → launch speed. A mild curve gives finer short putts.
export const SHOT_CURVE = 1.25;
export function shotSpeed(power) {
  const p = Math.max(0, Math.min(1, power));
  return SHOT_MIN + (SHOT_MAX - SHOT_MIN) * Math.pow(p, SHOT_CURVE);
}
