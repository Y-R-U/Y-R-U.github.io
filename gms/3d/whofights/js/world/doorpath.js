// The speed curve of the scripted walk through a doorway. No three, so node can test it.
//
// It used to be a smootherstep per leg of the path, which brought the player to a dead stop on
// the doorstep and again on the threshold — three stop-starts inside two seconds, and what reads
// in the hand as the script fighting the stick. This is one curve over the whole walk.
//
// `k` is the speed he arrived at, in path-lengths per transition, so the walk picks up from his
// own stride instead of stalling to nothing at the first waypoint. Past 3 the cubic stops being
// monotonic and he would walk backwards, so it is clamped there rather than trusted.
export const K_MAX = 3;

const clampK = k => (k > K_MAX ? K_MAX : k > 0 ? k : 0);

// Fraction of the path covered at `u`. h(0) = 0, h(1) = 1, h'(0) = k, h'(1) = 0.
export function pathEase(u, k) {
  const c = clampK(k);
  return ((c - 2) * u + (3 - 2 * c)) * u * u + c * u;
}

// Its derivative: path-lengths per transition at `u`, which is what the walk animation runs off.
export function pathSpeed(u, k) {
  const c = clampK(k);
  return (3 * (c - 2) * u + 2 * (3 - 2 * c)) * u + c;
}
