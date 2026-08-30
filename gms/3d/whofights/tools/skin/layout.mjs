// The dummy's shape AND its UV atlas, in one pure module with no three and no DOM, so the mesh
// (js/world/dummy.js) and the template (tools/skin/template.mjs) cannot drift apart.
//
// The unwrap is a straight orthographic front/back projection: the left half of the texture is the
// character seen from the front, the right half is the same character seen from behind, both at the
// same scale. That is the whole trick of this experiment — the UV layout IS a character turnaround
// sheet, which is a thing an image model draws well and a human reads at a glance.

export const ATLAS = { w: 1024, h: 1024 };

// Pixels per metre, and the image row the feet sit on. Chosen to match how Flux frames an
// unprompted turnaround: head near the top eighth, feet near the bottom twelfth.
const S = 470;
const FEET_ROW = 946;
const FRONT_CX = 256;
const BACK_CX = 768;

export const SCALE = S;

// A section is an axis-aligned rectangle in xz, centred at (x, z), swept to the next one.
// x+ is the figure's left as you look at it from the front, z+ is the front, y is up from the sole.
export const PARTS = [
  { id: 'head', label: 'HEAD', sections: [
    { y: 1.44, x: 0, z: 0, w: 0.115, d: 0.115 },
    { y: 1.545, x: 0, z: 0.005, w: 0.150, d: 0.160 },
    { y: 1.640, x: 0, z: 0.010, w: 0.205, d: 0.225 },
    { y: 1.735, x: 0, z: 0.005, w: 0.190, d: 0.205 },
    { y: 1.780, x: 0, z: 0, w: 0.130, d: 0.140 },
  ] },
  { id: 'torso', label: 'BODY', sections: [
    { y: 0.880, x: 0, z: 0, w: 0.300, d: 0.185 },
    { y: 1.030, x: 0, z: 0, w: 0.310, d: 0.190 },
    { y: 1.150, x: 0, z: 0.005, w: 0.290, d: 0.175 },
    { y: 1.330, x: 0, z: 0.005, w: 0.345, d: 0.200 },
    { y: 1.455, x: 0, z: 0, w: 0.380, d: 0.205 },
  ] },
  { id: 'armR', label: 'ARM', mirror: 'armL', sections: [
    { y: 1.440, x: -0.210, z: 0, w: 0.135, d: 0.150 },
    { y: 1.300, x: -0.240, z: 0, w: 0.115, d: 0.125 },
    { y: 1.090, x: -0.290, z: 0, w: 0.100, d: 0.110 },
    { y: 0.840, x: -0.335, z: 0, w: 0.085, d: 0.092 },
    { y: 0.690, x: -0.350, z: 0.005, w: 0.095, d: 0.070 },
  ] },
  { id: 'legR', label: 'LEG', mirror: 'legL', sections: [
    { y: 0.900, x: -0.098, z: 0, w: 0.175, d: 0.195 },
    { y: 0.640, x: -0.105, z: 0, w: 0.150, d: 0.165 },
    { y: 0.460, x: -0.110, z: 0, w: 0.125, d: 0.138 },
    { y: 0.190, x: -0.115, z: 0, w: 0.108, d: 0.112 },
    { y: 0.095, x: -0.115, z: 0.005, w: 0.115, d: 0.125 },
  ] },
  { id: 'footR', label: 'FOOT', mirror: 'footL', sections: [
    { y: 0.000, x: -0.115, z: 0.030, w: 0.125, d: 0.230 },
    { y: 0.095, x: -0.115, z: 0.010, w: 0.118, d: 0.180 },
  ] },
];

// The u of a world x, in each panel. The back panel is mirrored so the figure's own left stays on
// the same side of the sheet in both views — which is what a turnaround sheet does, and what Flux
// draws when it is not told otherwise.
const uFront = x => (FRONT_CX + x * S) / ATLAS.w;
const uBack = x => (BACK_CX - x * S) / ATLAS.w;
const vOf = y => 1 - (FEET_ROW - y * S) / ATLAS.h;

export const project = (x, y, back) => [back ? uBack(x) : uFront(x), vOf(y)];

// Pixel-space helpers for the template raster, which works in rows from the top.
export const px = (x, y, back) => [(back ? BACK_CX - x * S : FRONT_CX + x * S), FEET_ROW - y * S];
export const PANEL = { frontCx: FRONT_CX, backCx: BACK_CX, feetRow: FEET_ROW, split: ATLAS.w / 2 };

// A face whose normal is nearly parallel to the projection plane has no area in UV — the two
// z-extremes of a limb's side collapse onto one column of texels and smear it down the whole side.
// So those faces are folded INWARD, into the part's own silhouette: the side of an arm samples the
// outermost centimetres of the front of that arm, mirrored. It overlaps in UV, which costs nothing
// here (nothing is baked), and it never reaches outside the painted figure — folding outward would
// put the sides of every limb on the background.
const foldU = (s, sign) => Math.min(s.d * 0.5, s.w * 0.42) * -sign;
const foldV = (s, sign, span) => Math.min(s.d * 0.5, Math.max(0.02, span * 0.45)) * -sign;

// Emits { pos:[[x,y,z]x4], uv:[[u,v]x4], panel:'front'|'back', kind, part } quads.
// Every quad is planar-shaded, matching the faceted look of everything else in js/world/.
export function faces() {
  const out = [];
  const push = (part, kind, panel, pos, uv) => out.push({ part: part.id, label: part.label, kind, panel, pos, uv });

  for (const part of PARTS) {
    for (const flip of part.mirror ? [1, -1] : [1]) {
      const p = flip === 1 ? part : { ...part, id: part.mirror };
      const S4 = part.sections.map(s => ({ ...s, x: s.x * flip }));

      for (let i = 0; i < S4.length - 1; i++) {
        const a = S4[i], b = S4[i + 1];
        const L = s => s.x - s.w / 2, R = s => s.x + s.w / 2;
        const F = s => s.z + s.d / 2, K = s => s.z - s.d / 2;

        // Front and back panels of the segment: a pure projection, no fold.
        push(p, 'front', 'front',
          [[L(a), a.y, F(a)], [R(a), a.y, F(a)], [R(b), b.y, F(b)], [L(b), b.y, F(b)]],
          [project(L(a), a.y, 0), project(R(a), a.y, 0), project(R(b), b.y, 0), project(L(b), b.y, 0)]);
        push(p, 'back', 'back',
          [[R(a), a.y, K(a)], [L(a), a.y, K(a)], [L(b), b.y, K(b)], [R(b), b.y, K(b)]],
          [project(R(a), a.y, 1), project(L(a), a.y, 1), project(L(b), b.y, 1), project(R(b), b.y, 1)]);

        // Sides, split at the segment's own centre z so each half folds into the panel it faces.
        for (const sign of [1, -1]) {
          const X = sign > 0 ? R : L;
          for (const half of [0, 1]) {
            const zEdge = half ? K : F;
            const bk = half ? 1 : 0;
            const fa = foldU(a, sign), fb = foldU(b, sign);
            const quad = [
              [X(a), a.y, zEdge(a)], [X(a), a.y, a.z], [X(b), b.y, b.z], [X(b), b.y, zEdge(b)],
            ];
            const uvq = [
              project(X(a), a.y, bk), project(X(a) + fa, a.y, bk),
              project(X(b) + fb, b.y, bk), project(X(b), b.y, bk),
            ];
            push(p, 'side', half ? 'back' : 'front',
              sign > 0 === !half ? quad : quad.slice().reverse(),
              sign > 0 === !half ? uvq : uvq.slice().reverse());
          }
        }
      }

      // Caps. Same fold, in v.
      for (const end of [0, 1]) {
        const s = S4[end ? S4.length - 1 : 0];
        const sign = end ? 1 : -1;
        const near = S4[end ? S4.length - 2 : 1];
        const span = Math.abs(near.y - s.y);
        const L = s.x - s.w / 2, R = s.x + s.w / 2, F = s.z + s.d / 2, K = s.z - s.d / 2;
        const f = foldV(s, sign, span);
        for (const half of [0, 1]) {
          const zEdge = half ? K : F;
          const bk = half ? 1 : 0;
          const quad = [[L, s.y, zEdge], [R, s.y, zEdge], [R, s.y, s.z], [L, s.y, s.z]];
          const uvq = [project(L, s.y, bk), project(R, s.y, bk),
            project(R, s.y + f, bk), project(L, s.y + f, bk)];
          const flipWind = (sign > 0) === !!half;
          push(p, 'cap', half ? 'back' : 'front',
            flipWind ? quad.slice().reverse() : quad,
            flipWind ? uvq.slice().reverse() : uvq);
        }
      }
    }
  }
  return out;
}

// What the template labels, and where. Anchored to the rig so a proportion change moves the label
// with the island it names.
export const REGIONS = [
  { label: 'FACE', at: [0, 1.655], panel: 'front', note: 'eyes here' },
  { label: 'HEAD BACK', at: [0, 1.655], panel: 'back' },
  { label: 'CHEST', at: [0, 1.30], panel: 'front' },
  { label: 'BACK', at: [0, 1.30], panel: 'back' },
  { label: 'HIPS', at: [0, 0.95], panel: 'front' },
  { label: 'HIPS', at: [0, 0.95], panel: 'back' },
  { label: 'ARM', at: [-0.29, 1.10], panel: 'front' },
  { label: 'ARM', at: [0.29, 1.10], panel: 'front' },
  { label: 'LEG', at: [-0.105, 0.62], panel: 'front' },
  { label: 'LEG', at: [0.105, 0.62], panel: 'front' },
  { label: 'LEG', at: [-0.105, 0.62], panel: 'back' },
  { label: 'LEG', at: [0.105, 0.62], panel: 'back' },
];

export const RIG_TOP = 1.78;
