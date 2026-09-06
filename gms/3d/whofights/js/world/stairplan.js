// The grand stair's geometry, as arithmetic. js/world/grandstair.js draws it and js/world/
// society.js stands the room round it; both ask their questions here, so the rail you can see,
// the tread you stand on and the walk that carries you up are one set of numbers.
//
// The helix has no seam. js/world/stairs.js — the cottage stair — has one because a single turn
// wraps its angle back onto itself across a three-metre step; here the angle is only half the
// answer and the loop number is the other half, so the top of turn k and the foot of turn k+1
// are the same height at the same point. What that costs instead is ambiguity: one angle is on
// every floor at once. Every query below resolves it the same way, against the height you were
// at last frame, which is the only answer that is not a teleport.

export const TAU = Math.PI * 2;
export const A0 = -Math.PI / 2;   // where the helix crosses every floor, and so where every landing is

const REACH = 1.05;               // how far above or below a floor still counts as one stride
const LEAD = 1.15;                // how far past the outer rim a landing stands

const wrap = a => { const t = a % TAU; return t < 0 ? t + TAU : t; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// `ys` is every floor height in the room's own frame, ground first, evenly spaced.
export function stair({ x = 0, z = 0, r0, r1, ys }) {
  return { x, z, r0, r1, ys, y0: ys[0], rise: ys[1] - ys[0], turns: ys.length - 1, rw: (r0 + r1) / 2 };
}

// The hole every slab above the ground floor is cut with. The treads run to `r1`, so the slab
// meets their outer edge: a wider hole is a slot along the rim you can fall down and cannot stand
// on, which is what a square well big enough to clear a round stair always leaves.
export const wellR = S => S.r1;

// Half the arc of the railing gap on a floor, and so of the opening you may step onto the flight
// through. Not a look: over this arc the tread really is within a stride of the floor and past it
// it is not, so the rail you can see and the rule you can feel are the same number.
export const gateArc = S => clamp(TAU * REACH / S.rise, 0.30, 1.05);

// Where the flight meets a floor. It meets it twice: sweeping the angle forward from a floor
// climbs to the next one, and the flight that arrives from the floor below has been sweeping
// forward too, so it lands on the other side of the same seam. That is not a convenience — it is
// what the helix does — and it is what lets the auto-walk know, from where you are standing
// alone, whether you meant to go up or down.
//
// `up` picks the side: the foot of the flight out of this floor, or the head of the one into it.
export const GATE_K = 0.62;

export function landingAt(S, i, up) {
  const a = A0 + (up ? 1 : -1) * gateArc(S) * GATE_K;
  return { i, up, x: S.x + Math.cos(a) * (S.r1 + LEAD), z: S.z + Math.sin(a) * (S.r1 + LEAD), y: S.ys[i] };
}

// Every landing in the room. The ground floor has no flight arriving from below and the top floor
// has none leaving upward, so those two are simply not there to walk onto.
export function landings(S) {
  const out = [];
  for (let i = 0; i < S.ys.length; i++) {
    if (i > 0) out.push(landingAt(S, i, false));
    if (i < S.ys.length - 1) out.push(landingAt(S, i, true));
  }
  return out;
}

export function flightY(S, lx, lz, ref) {
  const dx = lx - S.x, dz = lz - S.z;
  const d = Math.hypot(dx, dz);
  if (d > S.r1 || d < S.r0) return null;
  const u = wrap(Math.atan2(dz, dx) - A0) / TAU;
  const k = clamp(Math.round((ref - S.y0) / S.rise - u), 0, S.turns - 1);
  return S.y0 + (k + u) * S.rise;
}

export const floorIndex = (S, y) => clamp(Math.round((y - S.y0) / S.rise), 0, S.ys.length - 1);

// True when a height is close enough to a floor to be standing on it rather than on the flight.
export const atFloor = (S, y) => {
  const f = (y - S.y0) / S.rise;
  return Math.abs(f - Math.round(f)) < 0.06;
};

// Same bargain as stairs.js `stairBlock`: pushed back to whichever rim you are the wrong side of,
// and told whether you ended up on the flight. Getting on needs a tread at your feet; staying on
// only needs the height to be continuous, because the eased position lags a run up by more than a
// tread and an at-your-feet test would drop you off the stair half way up.
//
// The newel is solid, so the inner rim blocks on every floor and on the flight alike.
export function blockAt(S, p, y, ref) {
  const dx = p.x - S.x, dz = p.z - S.z;
  const d = Math.hypot(dx, dz);
  if (d < S.r0) {
    const k = S.r0 / Math.max(d, 1e-3);
    p.x = S.x + dx * k;
    p.z = S.z + dz * k;
    return false;
  }
  if (d > S.r1) {
    // Mid-flight the outer rim is the handrail: the landings are the only ways off, or a run up
    // leaves through the balustrade at the first floor it passes.
    if (ref === null || atFloor(S, ref)) return false;
    const k = (S.r1 - 0.02) / d;
    p.x = S.x + dx * k;
    p.z = S.z + dz * k;
    return true;
  }
  const h = flightY(S, p.x, p.z, ref === null ? y : ref);
  if (ref === null ? Math.abs(h - y) < REACH : Math.abs(h - ref) < 0.9) return true;
  const k = (S.r1 + 0.02) / Math.max(d, 1e-3);
  p.x = S.x + dx * k;
  p.z = S.z + dz * k;
  return false;
}

// Put a point back outside the flight. The gate refuses the scripted climb, but a player who
// walks onto a tread by hand and keeps walking is climbing all the same — a rank you have not
// earned has to be a wall you cannot get past, not a lift you are not offered.
export function pushOffFlight(S, p) {
  const dx = p.x - S.x, dz = p.z - S.z;
  const d = Math.hypot(dx, dz) || 1e-3;
  const k = (S.r1 + 0.05) / d;
  p.x = S.x + dx * k;
  p.z = S.z + dz * k;
}

// The scripted walk between two floors, as local waypoints. `i` and `j` need not be adjacent: the
// helix is one curve and the parameter simply runs further. It starts at the landing the flight
// leaves this floor by and ends at the one it arrives at the far floor by, which are opposite
// sides of the same seam — walk out of the door you came in and you would be walking back down.
export function pathBetween(S, i, j) {
  const up = j > i;
  const g = gateArc(S) * GATE_K / TAU;
  const t0 = i + (up ? g : -g);
  const t1 = j + (up ? -g : g);
  const n = Math.max(12, Math.round(Math.abs(t1 - t0) * 34));
  const pts = [landingAt(S, i, up)];
  for (let s = 0; s <= n; s++) {
    const t = t0 + (t1 - t0) * s / n;
    const a = A0 + t * TAU;
    pts.push({ x: S.x + Math.cos(a) * S.rw, z: S.z + Math.sin(a) * S.rw, y: S.y0 + t * S.rise });
  }
  pts.push(landingAt(S, j, !up));
  return pts;
}

// The four boxes that stand in for one floor slab in the collider set. A ring rather than a lid,
// so the camera is stopped by the floor above it but the well stays open for the climb.
export function slabBoxes(S, rx, rz, y, th = 0.34) {
  const w = wellR(S) + 0.2;
  const zN = S.z - w, zP = S.z + w, xN = S.x - w, xP = S.x + w;
  const out = [];
  const push = (cx, cz, hw, hd) => {
    if (hw > 0.05 && hd > 0.05) out.push({ cx, cz, hw, hd, y0: y - th, y1: y });
  };
  push(0, (zN - rz) / 2, rx, (zN + rz) / 2);
  push(0, (zP + rz) / 2, rx, (rz - zP) / 2);
  push((xN - rx) / 2, (zN + zP) / 2, (xN + rx) / 2, w);
  push((xP + rx) / 2, (zN + zP) / 2, (rx - xP) / 2, w);
  return out;
}
