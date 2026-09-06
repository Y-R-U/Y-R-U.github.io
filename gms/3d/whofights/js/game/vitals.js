// Health, and whether a swing landed. Pure — no three, no DOM — because these are the two rules
// the proving is decided by and both are worth a test rather than a feel.
//
// A record is never mutated: the runtime swaps it, the HUD reads it, and a test can hold the one
// before the hit next to the one after it.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const make = (max, hp = max) => ({ hp: clamp(hp, 0, max), max, dead: clamp(hp, 0, max) <= 0 });

// One arithmetic for damage and for mending, because they are the same operation and the earth
// elemental does both in the same second — it is being cut and standing in soil at once.
export function apply(v, delta) {
  const hp = clamp(v.hp + delta, 0, v.max);
  return { hp, max: v.max, dead: hp <= 0 };
}

export const hurt = (v, amount) => apply(v, -Math.max(0, amount));
export const mend = (v, amount) => (v.dead ? v : apply(v, Math.max(0, amount)));
export const fraction = v => (v.max > 0 ? v.hp / v.max : 0);

// The angle between where you are facing and where a thing is, folded to ±π. Yaw here is the
// game's own convention — atan2(x, z), +z at yaw 0 — not the maths one, and mixing the two is
// how a swing comes out ninety degrees off the thing you are looking at.
export function bearing(from, yaw, to) {
  const a = Math.atan2(to.x - from.x, to.z - from.z) - yaw;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Did a swing connect? A cone, not a sphere: a knife you can only land by facing the thing is what
// makes standing on the stone and letting it come to you a decision rather than a preference.
export function inSwing({ from, yaw, to, reach, arc, radius = 0 }) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d > reach + radius) return false;
  // Point blank there is no meaningful bearing, and a thing standing on your feet is hit.
  if (d < 0.35) return true;
  return Math.abs(bearing(from, yaw, to)) <= arc / 2;
}
