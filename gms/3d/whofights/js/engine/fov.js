// Vertical field of view from the viewport aspect. Pure, so node can assert it.
//
// three's `fov` is the vertical one, so leaving it fixed makes the horizontal field a function of
// the window: 96.8° at the 844 × 390 gate and 27.1° at 390 × 844, which is not the same game. The
// rule here holds the field on whichever axis is *shorter*. A phone's short axis is 390 px either
// way up, so rotating it reveals more of the long axis instead of rescaling the world, and every
// landscape aspect — phone, desktop, ultrawide — keeps exactly the 55° it has today.
// Derived in docs/NOTES_PORTRAIT.md §2.

export const FOV_MINOR = 55;
// Past this the edges of the frame stretch badly and the horizontal stops paying for it. It binds
// at aspect tan(27.5°)/tan(50°) = 0.4368, i.e. taller than 1 : 2.29, which 21:9 phones reach.
export const FOV_MAX = 100;

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export function fovFor(aspect, minor = FOV_MINOR, max = FOV_MAX) {
  if (!(aspect > 0) || !(minor > 0)) return minor;
  if (aspect >= 1) return minor;
  return Math.min(max, 2 * Math.atan(Math.tan(minor * D2R / 2) / aspect) * R2D);
}

export const hFovFor = (aspect, vFov) => 2 * Math.atan(aspect * Math.tan(vFov * D2R / 2)) * R2D;

export const portrait = (w, h) => h > w;
