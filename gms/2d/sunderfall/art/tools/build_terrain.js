// Ground runs, ledges, caps, cliff faces and scatter decals.
//
// Every run piece of a given kind shares one surface curve and one texture phase, so any
// variant abuts any other with no step. Variation comes from the tint field and the
// scattered detail, which are periodic over the piece width and therefore also seamless.
const fs = require('fs');
const path = require('path');
const { readPNG, writePNG, resize, trim, grade, mapPixels, Img, composite } = require('./img.js');
const { makeSeamless, tileFill, buildSlab, surfaceCurve, addUnderFringe, addTopLip, PALETTE } = require('./terrain.js');
const { pack, write } = require('./atlas.js');
const { flipX } = require('./compose.js');
const { rng, fbm, strokeCoverage, paintCoverage } = require('./raster.js');
const { sculpt } = require('./light.js');

const ROOT = path.resolve(__dirname, '..');
const KEYED = path.join(ROOT, 'work', 'keyed');
const OUT = path.join(ROOT, '..', 'game', 'assets');

const KINDS = [
  { kind: 'forest', tex: 'tx_forestfloor', grade: { saturation: 0.8, tint: [0.72, 0.78, 0.72], brightness: -18 } },
  { kind: 'rock',   tex: 'tx_rock',        grade: { saturation: 0.55, tint: [0.54, 0.60, 0.68], brightness: -20 } },
  { kind: 'stone',  tex: 'tx_masonry',     grade: { saturation: 0.6, tint: [0.70, 0.74, 0.74], brightness: -16 } },
];

const RUN_W = 1024, RUN_H = 384, TOP = 24, AMP = 11;
const frames = [];
const terrain = {};

function texture(name, g) {
  const p = path.join(KEYED, name + '.png');
  if (!fs.existsSync(p)) return null;
  let t = readPNG(p);
  t = resize(t, 512, 512);
  t = makeSeamless(t);
  return grade(t, g);
}

/** Vertical cliff face: tiles in both axes, with a hint of stratification. */
function wallTile(tex, kind, seed) {
  const im = tileFill(tex, 256, 256, seed, 0.22);
  const n = fbm(seed + 5, 4, 3);
  return mapPixels(im, (r, g, b, a, x, y) => {
    const k = 0.55 + 0.45 * n(x / 256, y / 256);
    const dark = 0.30 + 0.24 * k;
    return [r * dark, g * dark, b * dark, 255];
  });
}

for (const K of KINDS) {
  const tex = texture(K.tex, K.grade);
  if (!tex) { console.warn('MISSING texture ' + K.tex); continue; }
  const curveSeed = 100 + K.kind.length;   // shared: every run piece of this kind lines up

  const runIds = [];
  for (const v of ['a', 'b']) {
    const id = `ground_${K.kind}_${v}`;
    const img = buildSlab(tex, { w: RUN_W, h: RUN_H, kind: K.kind, seed: curveSeed, amp: AMP, top: TOP,
                                 detailSeed: v === 'a' ? 1 : 2 });
    frames.push({ id, img, ax: 0, ay: TOP });
    runIds.push(id);
  }
  const capL = buildSlab(tex, { w: 256, h: RUN_H, kind: K.kind, seed: curveSeed, amp: AMP, top: TOP, capL: true });
  const capR = buildSlab(tex, { w: 256, h: RUN_H, kind: K.kind, seed: curveSeed, amp: AMP, top: TOP, capR: true });
  frames.push({ id: `cap_${K.kind}_l`, img: capL, ax: 0, ay: TOP });
  frames.push({ id: `cap_${K.kind}_r`, img: capR, ax: 0, ay: TOP });

  // Platforms. Seven readings per kind, not three: three sizes was the whole reason the
  // play space read as a level editor — uniform thickness, one silhouette, 90-degree ends.
  // `jl`/`jr` are capped at ONE end only, so they can be driven into a cliff, trunk or wall
  // and physically belong to it instead of floating.
  const ledges = {};
  const LEDGES = [
    ['xs', 132, 104, 16,  7, 1, 1, 0],
    ['s',  200, 128, 18,  8, 1, 1, 1],
    ['m',  344, 152, 18, 11, 1, 1, -1],
    ['l',  568, 176, 20, 13, 1, 1, 1],
    ['xl', 820, 226, 22, 16, 1, 1, -1],
    ['jl', 430, 198, 18, 12, 0, 1, 1],
    ['jr', 430, 198, 18, 12, 1, 0, -1],
  ];
  for (const [name, w, h, top, amp, cL, cR, lip] of LEDGES) {
    const id = `ledge_${K.kind}_${name}`;
    let img = buildSlab(tex, { w, h, kind: K.kind, seed: curveSeed + w * 7, amp, top,
                               capL: !!cL, capR: !!cR, detailSeed: name.length + w % 5 });
    if (lip) img = addTopLip(img, { tex, seed: curveSeed + w, kind: K.kind, side: lip, top, reach: 0.22 + (w % 7) / 40 });
    img = addUnderFringe(img, { seed: curveSeed + w * 3, kind: K.kind,
                                len: K.kind === 'forest' ? 52 : 34,
                                density: K.kind === 'forest' ? 0.030 : 0.016,
                                vines: K.kind !== 'rock' });
    img = sculpt(img, { contact: 0.20, contactH: 0.10, cavity: 0.45, rim: 0.40, planar: 0.55 });
    frames.push({ id, img, ax: 0, ay: top });
    ledges[name] = id;
  }

  const wallId = `wall_${K.kind}`;
  frames.push({ id: wallId, img: wallTile(tex, K.kind, curveSeed), ax: 0, ay: 0 });

  terrain[K.kind] = {
    run: runIds, runW: RUN_W, runH: RUN_H, surfaceY: TOP,
    capL: `cap_${K.kind}_l`, capR: `cap_${K.kind}_r`, capW: 256,
    ledge: ledges, wall: wallId, wallSize: 256,
  };
  console.log(`${K.kind}: ${runIds.length} runs, 2 caps, ${Object.keys(ledges).length} ledges, 1 wall`);
}

// scatter decals — small keyed elements dropped on top of a run to break repetition
const DECALS = [
  ['decal_rocks',   'el_rock_a',      120],
  ['decal_roots',   'el_root_a',      200],
  ['decal_grass',   'el_fern_a',       96],
  ['decal_bramble', 'el_fern_b',      130],
  ['decal_mush',    'el_mushroom_a',   80],
  ['decal_rubble',  'el_rubble_a',    150],
  ['decal_bones',   'p_skullpile',     90],
];
const decalIds = [];
for (const [id, src, w] of DECALS) {
  const p = path.join(KEYED, src + '.png');
  if (!fs.existsSync(p)) { console.warn('MISSING decal source ' + src); continue; }
  let im = readPNG(p);
  im = trim(resize(im, w, Math.max(1, Math.round(im.h * w / im.w))), 0).img;
  im = grade(im, { brightness: -22, saturation: 0.7 });
  const lit = sculpt(im, { keyAmt: 0.32, shadowSide: 0.50, rim: 0.34, contact: 0.55, contactH: 0.20 });
  frames.push({ id, img: lit, ax: Math.round(lit.w / 2), ay: lit.h });
  decalIds.push(id);
  // three readings per decal: scattered in bulk, one reading is the definition of a stamp
  [[-1, 0.78, 1.06], [1, 1.18, 0.86]].forEach(([f, sx, sy], k) => {
    let v = f < 0 ? flipX(im) : im;
    v = resize(v, Math.max(4, Math.round(im.w * sx)), Math.max(4, Math.round(im.h * sy)));
    v = grade(v, { brightness: k ? 6 : -8 });
    v = sculpt(v, { keyAmt: 0.32, shadowSide: 0.50, rim: 0.34, contact: 0.55, contactH: 0.20 });
    const vid = `${id}_v${k + 1}`;
    frames.push({ id: vid, img: v, ax: Math.round(v.w / 2), ay: v.h });
    decalIds.push(vid);
  });
}

const packed = write(OUT, 'terrain', pack(frames, { width: 2048, padding: 2 }));
fs.writeFileSync(path.join(ROOT, 'work', 'terrain_manifest.json'),
  JSON.stringify({ terrain: packed, kinds: terrain, decals: decalIds }, null, 1));
console.log(`terrain.png ${packed.w}x${packed.h}  ${(packed.bytes/1024).toFixed(0)}KB`);
