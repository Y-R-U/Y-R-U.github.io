// Where the camera arm's ceiling collider sits under a loft's gable. Heights are metres above the
// loft deck, `u` is metres from the ridge line across the slope. No three, so node can test it.

const SLAB = 0.075;   // half the gable slab's thickness, stairs.js gableCeiling
// How far a band must stay above the eye. A box the eye is *inside* returns a zero-length arm for
// every direction at once, which puts the camera on the back of the head; one the eye is merely
// under only shortens the rays that actually climb into it.
const CLR = 0.08;
const MAX = 14;       // bands, so a shallow drop on a wide gable cannot run away

// The underside stairs.js gableCeiling actually builds: its slabs' mid-plane runs from the ridge
// to `roomH2 − rise` at the eaves, and the boarding hangs half a thickness below that.
export function gableUnder(roomH2, rise, half, u) {
  const k = rise / half;
  return roomH2 - SLAB * Math.hypot(1, k) - k * Math.min(Math.abs(u), half);
}

// Bands of the lid, ridge outward: `{ u0, u1, lid }`, the first one straddling the ridge. Each is
// lidded at the ceiling over its *inner* edge, so it stands `drop` above the ceiling at its outer
// one — and since the arm keeps `radius` clear of a box, a drop no larger than that radius still
// leaves the camera under the real slope. Bands stop where the ceiling comes down to the eye; past
// there one flat band at that clearance is all a collider can give, because below it the eye is
// inside the roof and a box there would swallow it.
export function lidBands(roomH2, rise, half, wallT, eye, radius, drop) {
  const k = rise / half;
  const ridge = gableUnder(roomH2, rise, half, 0);
  const clear = eye + radius + CLR;
  const wall = half + wallT;
  const slope = Math.min(wall, (ridge - clear) / k);
  if (!(slope > 0)) return [];

  const out = [];
  const w = Math.max(0.05, drop) / k;
  let u = 0;
  for (let i = 0; i < MAX && u < slope - 1e-6; i++) {
    const next = Math.min(slope, u + w);
    out.push({ u0: u, u1: next, lid: ridge - k * u });
    u = next;
  }
  if (u < wall) out.push({ u0: u, u1: wall, lid: clear });
  return out;
}
