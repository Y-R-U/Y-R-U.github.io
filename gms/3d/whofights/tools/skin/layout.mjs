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
// The joints carry a deliberate bulge — this is a crash-test dummy, not an anatomy study, and the
// balls at shoulder, elbow and knee are what make it read as one.
//
// These sections are the CANONICAL rig. It is the average of the two body shapes below and it is
// the only thing the UV layout is derived from, so one painted skin fits both.
export const PARTS = [
  { id: 'head', label: 'HEAD', shape: 'head', sections: [
    { y: 1.395, x: 0, z: 0, w: 0.105, d: 0.105 },
    { y: 1.470, x: 0, z: 0, w: 0.098, d: 0.100 },
    { y: 1.520, x: 0, z: 0.005, w: 0.150, d: 0.165 },
    { y: 1.600, x: 0, z: 0.012, w: 0.205, d: 0.225 },
    { y: 1.690, x: 0, z: 0.008, w: 0.200, d: 0.215 },
    { y: 1.755, x: 0, z: 0, w: 0.150, d: 0.160 },
    { y: 1.790, x: 0, z: 0, w: 0.085, d: 0.090 },
  ] },
  { id: 'torso', label: 'BODY', shape: 'torso', sections: [
    { y: 0.870, x: 0, z: 0, w: 0.300, d: 0.190 },
    { y: 0.960, x: 0, z: 0, w: 0.320, d: 0.200 },
    { y: 1.080, x: 0, z: 0, w: 0.290, d: 0.180 },
    { y: 1.180, x: 0, z: 0.004, w: 0.275, d: 0.170 },
    { y: 1.300, x: 0, z: 0.006, w: 0.330, d: 0.200 },
    { y: 1.420, x: 0, z: 0.004, w: 0.375, d: 0.210 },
    { y: 1.470, x: 0, z: 0, w: 0.390, d: 0.200 },
  ] },
  { id: 'armR', label: 'ARM', mirror: 'armL', shape: 'arm', sections: [
    { y: 1.478, x: -0.198, z: 0, w: 0.110, d: 0.120 },
    { y: 1.440, x: -0.212, z: 0, w: 0.152, d: 0.162 },
    { y: 1.390, x: -0.230, z: 0, w: 0.120, d: 0.130 },
    { y: 1.150, x: -0.272, z: 0, w: 0.108, d: 0.115 },
    { y: 1.100, x: -0.282, z: 0, w: 0.125, d: 0.130 },
    { y: 1.050, x: -0.292, z: 0, w: 0.105, d: 0.112 },
    { y: 0.830, x: -0.338, z: 0, w: 0.078, d: 0.085 },
    { y: 0.790, x: -0.345, z: 0.004, w: 0.092, d: 0.075 },
    { y: 0.660, x: -0.352, z: 0.004, w: 0.088, d: 0.070 },
  ] },
  { id: 'legR', label: 'LEG', mirror: 'legL', shape: 'leg', sections: [
    { y: 0.895, x: -0.100, z: 0, w: 0.180, d: 0.200 },
    { y: 0.700, x: -0.106, z: 0, w: 0.155, d: 0.170 },
    { y: 0.520, x: -0.110, z: 0, w: 0.132, d: 0.145 },
    { y: 0.470, x: -0.112, z: 0, w: 0.145, d: 0.152 },
    { y: 0.420, x: -0.114, z: 0, w: 0.128, d: 0.138 },
    { y: 0.170, x: -0.118, z: 0, w: 0.098, d: 0.105 },
    { y: 0.095, x: -0.118, z: 0.004, w: 0.104, d: 0.112 },
  ] },
  { id: 'footR', label: 'FOOT', mirror: 'footL', shape: 'leg', sections: [
    { y: 0.000, x: -0.118, z: 0.032, w: 0.118, d: 0.235 },
    { y: 0.095, x: -0.118, z: 0.010, w: 0.110, d: 0.180 },
  ] },
];

// Male and female bodies, as multipliers on the canonical rig. Same topology, same vertex count,
// same UVs — only the positions move — so a skin painted once fits either. The cost of that is that
// neither shape can stray far from the average before the texture visibly stretches over it; these
// dials are deliberately modest for exactly that reason.
export const SHAPES = {
  n: { label: 'neutral', sy: 1, torsoW: [1, 1, 1, 1, 1, 1, 1], torsoD: [1, 1, 1, 1, 1, 1, 1],
    limb: 1, limbX: 1, armX: 1, head: 1 },
  m: { label: 'male', sy: 1.020,
    torsoW: [0.95, 0.96, 0.99, 1.00, 1.05, 1.08, 1.10],
    torsoD: [0.98, 0.98, 1.00, 1.00, 1.03, 1.05, 1.04],
    limb: 1.05, limbX: 0.97, armX: 1.05, head: 1.01 },
  f: { label: 'female', sy: 0.965,
    torsoW: [1.12, 1.13, 1.00, 0.89, 0.97, 0.97, 0.93],
    torsoD: [1.06, 1.06, 1.00, 0.96, 1.07, 1.11, 1.00],
    limb: 0.93, limbX: 1.10, armX: 0.93, head: 0.97 },
};

export const SHAPE_IDS = ['m', 'f'];

// Positions come from the shaped rig; UVs always come from the canonical one.
export function shapedSections(part, shapeId) {
  const S = SHAPES[shapeId] || SHAPES.n;
  return part.sections.map((s, i) => {
    let w = s.w, d = s.d, x = s.x;
    if (part.shape === 'torso') { w *= S.torsoW[i] ?? 1; d *= S.torsoD[i] ?? 1; }
    else if (part.shape === 'head') { w *= S.head; d *= S.head; }
    else { w *= S.limb; d *= S.limb; x *= part.shape === 'arm' ? S.armX : S.limbX; }
    return { y: s.y * S.sy, x, z: s.z, w, d };
  });
}

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
// Winding is normalised against an intended outward direction rather than reasoned about per case:
// arms and legs list their sections top-down and the torso lists them bottom-up, so every hand-
// derived sign was wrong for half the rig.
export function faces(shapeId = 'n') {
  const out = [];

  const emit = (part, kind, panel, pos, uv, outward) => {
    const e1 = sub(pos[1], pos[0]), e2 = sub(pos[2], pos[0]);
    const n = cross(e1, e2);
    const bad = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0;
    out.push({ part: part.id, label: part.label, kind, panel,
      pos: bad ? pos.slice().reverse() : pos, uv: bad ? uv.slice().reverse() : uv });
  };

  for (const part of PARTS) {
    for (const flip of part.mirror ? [1, -1] : [1]) {
      const p = flip === 1 ? part : { ...part, id: part.mirror };
      const CAN = part.sections.map(s => ({ ...s, x: s.x * flip }));
      const S4 = shapedSections(part, shapeId).map(s => ({ ...s, x: s.x * flip }));
      const L = s => s.x - s.w / 2, R = s => s.x + s.w / 2;
      const F = s => s.z + s.d / 2, K = s => s.z - s.d / 2;

      for (let i = 0; i < S4.length - 1; i++) {
        const a = S4[i], b = S4[i + 1];
        const ca = CAN[i], cb = CAN[i + 1];

        emit(p, 'front', 'front',
          [[L(a), a.y, F(a)], [R(a), a.y, F(a)], [R(b), b.y, F(b)], [L(b), b.y, F(b)]],
          [project(L(ca), ca.y, 0), project(R(ca), ca.y, 0), project(R(cb), cb.y, 0), project(L(cb), cb.y, 0)],
          [0, 0, 1]);
        emit(p, 'back', 'back',
          [[R(a), a.y, K(a)], [L(a), a.y, K(a)], [L(b), b.y, K(b)], [R(b), b.y, K(b)]],
          [project(R(ca), ca.y, 1), project(L(ca), ca.y, 1), project(L(cb), cb.y, 1), project(R(cb), cb.y, 1)],
          [0, 0, -1]);

        // Sides, split at the segment's own centre z so each half folds into the panel it faces.
        for (const sign of [1, -1]) {
          const X = sign > 0 ? R : L;
          const fa = foldU(ca, sign), fb = foldU(cb, sign);
          for (const half of [0, 1]) {
            const zEdge = half ? K : F;
            const bk = half ? 1 : 0;
            emit(p, 'side', half ? 'back' : 'front',
              [[X(a), a.y, zEdge(a)], [X(a), a.y, a.z], [X(b), b.y, b.z], [X(b), b.y, zEdge(b)]],
              [project(X(ca), ca.y, bk), project(X(ca) + fa, ca.y, bk),
                project(X(cb) + fb, cb.y, bk), project(X(cb), cb.y, bk)],
              [sign, 0, 0]);
          }
        }
      }

      // Caps, folded in v. `sign` is which way the cap faces, read off the rig rather than assumed.
      for (const end of [0, 1]) {
        const k = end ? S4.length - 1 : 0, kn = end ? S4.length - 2 : 1;
        const s = S4[k], cs = CAN[k], near = S4[kn], cnear = CAN[kn];
        const sign = Math.sign(s.y - near.y) || (end ? 1 : -1);
        const f = foldV(cs, sign, Math.abs(cnear.y - cs.y));
        for (const half of [0, 1]) {
          const zEdge = half ? K(s) : F(s);
          const bk = half ? 1 : 0;
          emit(p, 'cap', half ? 'back' : 'front',
            [[L(s), s.y, zEdge], [R(s), s.y, zEdge], [R(s), s.y, s.z], [L(s), s.y, s.z]],
            [project(L(cs), cs.y, bk), project(R(cs), cs.y, bk),
              project(R(cs), cs.y + f, bk), project(L(cs), cs.y + f, bk)],
            [0, sign, 0]);
        }
      }
    }
  }
  return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// What the template labels, and where. Anchored to the rig so a proportion change moves the label
// with the island it names.
export const REGIONS = [
  { label: 'FACE', at: [0, 1.655], panel: 'front' },
  { label: 'HEAD BACK', at: [0, 1.655], panel: 'back' },
  { label: 'CHEST', at: [0, 1.330], panel: 'front' },
  { label: 'BACK', at: [0, 1.330], panel: 'back' },
  { label: 'HIPS', at: [0, 0.930], panel: 'front' },
  { label: 'HIPS', at: [0, 0.930], panel: 'back' },
  { label: 'ARM', at: [-0.285, 1.040], panel: 'front' },
  { label: 'ARM', at: [0.285, 1.040], panel: 'front' },
  { label: 'LEG', at: [-0.108, 0.620], panel: 'front' },
  { label: 'LEG', at: [0.108, 0.620], panel: 'front' },
  { label: 'LEG', at: [-0.108, 0.620], panel: 'back' },
  { label: 'LEG', at: [0.108, 0.620], panel: 'back' },
];

export const RIG_TOP = 1.79;
