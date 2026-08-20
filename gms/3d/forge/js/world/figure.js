// The robed figure's own profile: the two ring tables every hood in the game is built from. Here
// rather than in people.js so js/world/foeshape.js can derive the enemy silhouettes from it without
// dragging three into a node test.

export const SEG = 10;
export const HSEG = 8;
export const SHOULDER = 1.22;

// hem / shin / knee / waist / chest. `sh` is baked ambient occlusion, not lighting: dark at the
// ground, dark in the waist pinch, dark again where the cowl overhangs. `f` is the fold depth, so
// the waist creases tight and the hem swings loose. The shoulder flare is the hood's mantle ring,
// not a robe ring — the chest ring is narrow and lives entirely inside the mantle.
export const ROBE = [
  { y: 0.00, r: 0.402, sh: 0.36, f: 0.155 },
  { y: 0.31, r: 0.302, sh: 0.72, f: 0.138 },
  { y: 0.67, r: 0.270, sh: 0.86, f: 0.122 },
  { y: 0.98, r: 0.216, sh: 0.62, f: 0.088 },
  { y: 1.10, r: 0.196, sh: 0.70, f: 0.070 },
];

// mantle / chin / eye / brow, then a point that leans forward over the opening. The mantle is a
// draped collar and not just the top of the body: it carries the whole shoulder line at 0.302, its
// front pair dives 21 cm to a V on the chest, and `hang` scallops its edge off the fold term so it
// is a drape rather than a brim. The cowl above it is deliberately narrow, because the opening has
// to be most of the cowl's width before the front reads as a hood instead of a hole in a bucket.
export const HOOD = [
  { y: 1.115, r: 0.302, sh: 0.50, ny: -0.30, dz: 0.010, dx: 0.000, aw: 12, dy: -0.215, lr: 1.00, trim: 1.10, hang: 0.9 },
  { y: 1.235, r: 0.222, sh: 0.64, ny: -0.02, dz: 0.022, dx: 0.006, aw: 40, dy: 0.020, lr: 1.00, trim: 1.34, hang: 0 },
  { y: 1.400, r: 0.216, sh: 0.72, ny: 0.12, dz: 0.014, dx: 0.012, aw: 43, dy: 0, lr: 0.99, trim: 1.34, hang: 0 },
  { y: 1.565, r: 0.192, sh: 0.84, ny: 0.44, dz: 0.030, dx: 0.020, aw: 28, dy: -0.030, lr: 0.84, trim: 1.26, hang: 0 },
];
export const APEX = [0.020, 1.688, 0.118];

// The one figure people.js draws, and the defaults every part of the builder falls back to.
// js/world/robed.js derives the enemy silhouettes by handing in a stretched copy of this.
export const FIGURE = { robe: ROBE, hood: HOOD, apex: APEX, shoulder: SHOULDER, under: 0.880, cavity: 0.270 };
