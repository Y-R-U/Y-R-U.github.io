// Props: intact -> cracked x2 -> debris chunks -> settled rubble, packed into two atlases.
const fs = require('fs');
const path = require('path');
const { readPNG, writePNG, resize, trim, crop, composite, grade, mapPixels, Img, alphaBBox } = require('./img.js');
const { makeChunks, makeCracked } = require('./destruct.js');
const { pack, write } = require('./atlas.js');
const { rng } = require('./raster.js');
const { flipX } = require('./compose.js');
const { sculpt, pointRelight, KEY } = require('./light.js');

const ROOT = path.resolve(__dirname, '..');
const KEYED = path.join(ROOT, 'work', 'keyed');
const OUT = path.join(ROOT, '..', 'game', 'assets');
fs.mkdirSync(OUT, { recursive: true });

// world width in reference pixels (1920 wide view). hp is a starting point for the sim.
//
// `tone`  a grade applied BEFORE lighting. Used to pull the two orphan saturated accents
//         (the orange boulder face, the orange brick) back into the scene's value range —
//         they were the most saturated things on screen, lit by nothing, and stole the eye.
// `emit`  a self-illuminating prop: {u,v} is the emitter's position as a fraction of the
//         frame, and the prop is relit from it so its own body obeys its own light.
// `light` per-prop sculpt overrides.
const PROPS = [
  { id: 'wall_brick',   src: 'p_brickwall',  material: 'MASONRY', w: 264, hp: 120, chunks: 12,
    tone: { saturation: 0.44, tint: [0.86, 0.90, 0.98], brightness: -6 } },
  { id: 'arch_stone',   src: 'p_arch',       material: 'MASONRY', w: 300, hp: 160, chunks: 12 },
  { id: 'pillar_stone', src: 'p_pillar',     material: 'MASONRY', w:  92, hp: 100, chunks: 9  },
  { id: 'rubble_heap',  src: 'el_rubble_a',  material: 'MASONRY', w: 220, hp:  60, chunks: 8  },
  { id: 'boulder_big',  src: 'p_boulder_a',  material: 'ROCK',    w: 190, hp: 180, chunks: 11,
    tone: { saturation: 0.42, tint: [0.90, 0.94, 1.02] } },
  { id: 'boulder_small',src: 'p_boulder_b',  material: 'ROCK',    w: 118, hp: 110, chunks: 9,
    tone: { saturation: 0.50, tint: [0.92, 0.95, 1.02] } },
  { id: 'rocks_small',  src: 'el_rock_a',    material: 'ROCK',    w: 150, hp:  70, chunks: 8,
    tone: { saturation: 0.55 } },
  { id: 'standing_stone', src: 'el_standing_stone', material: 'ROCK', w: 84, hp: 200, chunks: 9 },
  { id: 'crate',        src: 'p_crate',      material: 'TIMBER',  w:  96, hp:  40, chunks: 10,
    tone: { saturation: 0.52, tint: [0.90, 0.94, 1.02], brightness: -8 } },
  { id: 'barrel',       src: 'p_barrel',     material: 'TIMBER',  w:  74, hp:  45, chunks: 10,
    tone: { saturation: 0.55, tint: [0.92, 0.95, 1.02], brightness: -6 } },
  { id: 'fence',        src: 'p_fencepanel', material: 'TIMBER',  w: 196, hp:  30, chunks: 10, grain: 'v',
    tone: { saturation: 0.58, tint: [0.92, 0.95, 1.02] } },
  { id: 'log',          src: 'el_log_a',     material: 'TIMBER',  w: 230, hp:  55, chunks: 10, grain: 'h',
    tone: { saturation: 0.58, tint: [0.92, 0.95, 1.02] } },
  { id: 'stump', grain: 'v',        src: 'el_stump_a',   material: 'TIMBER',  w: 116, hp:  70, chunks: 9,
    tone: { saturation: 0.58, tint: [0.92, 0.95, 1.02] } },
  { id: 'tree_trunk', grain: 'v',   src: 'p_sapling',    material: 'TIMBER',  w:  84, hp:  90, chunks: 9  },
  { id: 'oak_trunk', grain: 'v',    src: 'el_oak_a',     material: 'TIMBER',  w: 210, hp: 260, chunks: 11,
    tone: { saturation: 0.50, tint: [0.90, 0.94, 1.04], brightness: -6 } },
  { id: 'deadtree', grain: 'v',     src: 'el_deadtree_a',material: 'TIMBER',  w: 240, hp: 140, chunks: 10,
    tone: { saturation: 0.50, tint: [0.90, 0.94, 1.04], brightness: -6 } },
  { id: 'burnt_trunk', grain: 'v',  src: 'el_burnt_a',   material: 'TIMBER',  w: 170, hp: 110, chunks: 10,
    tone: { saturation: 0.55, tint: [0.92, 0.95, 1.02] } },
  { id: 'tree_foliage', src: 'el_foliage_a', material: 'FOLIAGE', w: 250, hp:  35, chunks: 10, cropBottom: 0.08,
    tone: { saturation: 0.55, tint: [0.80, 0.88, 0.96], brightness: -26 } },
  { id: 'tree_foliage_b', src: 'el_foliage_b', material: 'FOLIAGE', w: 230, hp: 35, chunks: 10, cropRight: 0.22, cropBottom: 0.08,
    tone: { saturation: 0.55, tint: [0.80, 0.88, 0.96], brightness: -26 } },
  { id: 'tree_small',   src: 'el_foliage_a', material: 'FOLIAGE', w: 300, hp:  60, chunks: 11,
    tone: { saturation: 0.55, tint: [0.80, 0.88, 0.96], brightness: -26 } },
  { id: 'bush',         src: 'el_bush_a',    material: 'FOLIAGE', w: 160, hp:  22, chunks: 9,
    tone: { saturation: 0.62, tint: [0.86, 0.92, 0.98], brightness: -14 } },
  { id: 'ferns',        src: 'el_fern_a',    material: 'FOLIAGE', w: 150, hp:  16, chunks: 8,
    tone: { saturation: 0.62, tint: [0.86, 0.92, 0.98], brightness: -14 } },
  { id: 'mushrooms',    src: 'el_mushroom_a',material: 'FOLIAGE', w: 120, hp:  14, chunks: 8,
    emit: { u: 0.5, v: 0.42, r: 1.5, color: [0.34, 0.86, 1.0], strength: 0.85 },
    light: { keyAmt: 0.22, shadowSide: 0.34, rim: 0.30 } },
  { id: 'lantern',      src: 'p_lantern',    material: 'GLASS',   w:  62, hp:  12, chunks: 12,
    emit: { u: 0.5, v: 0.42, r: 2.2, color: [1.0, 0.74, 0.40], strength: 1.0 },
    light: { keyAmt: 0.20, shadowSide: 0.30, rim: 0.30 } },
  { id: 'lamppost',     src: 'el_lantern_post', material: 'GLASS',w:  70, hp:  30, chunks: 10,
    emit: { u: 0.5, v: 0.13, r: 2.4, color: [1.0, 0.76, 0.42], strength: 1.0 },
    light: { keyAmt: 0.24, shadowSide: 0.40 } },
  { id: 'gate_iron',    src: 'p_gate',       material: 'METAL',   w: 190, hp: 240, chunks: 7  },
  { id: 'brazier',      src: 'p_brazier',    material: 'METAL',   w:  92, hp: 150, chunks: 7,
    emit: { u: 0.5, v: 0.22, r: 2.6, color: [1.0, 0.62, 0.28], strength: 1.15 },
    light: { keyAmt: 0.20, shadowSide: 0.34, rim: 0.28 } },
  { id: 'skull_pile',   src: 'p_skullpile',  material: 'BONE',    w: 132, hp:  26, chunks: 9  },
  { id: 'ribcage',      src: 'p_ribcage',    material: 'BONE',    w: 158, hp:  34, chunks: 9  },
];

/**
 * Ramp alpha out over the last few percent of a cropped edge. A crop leaves a ruled alpha
 * line, and on a canopy sprite two metres across that line reads as a rectangle in the sky.
 */
function feather(im, side, frac = 0.10) {
  const { w, h } = im;
  const n = Math.max(3, Math.round((side === 'right' ? w : h) * frac));
  return mapPixels(im, (r, g, b, a, x, y) => {
    const d = side === 'right' ? w - 1 - x : h - 1 - y;
    if (!a || d >= n) return null;
    return [r, g, b, a * (d / n) ** 1.2];
  });
}

/** A settled heap: a few chunks stacked low, sunk into shadow. Persistent rubble. */
function settle(chunks, seed, targetW) {
  const r = rng(seed);
  const use = chunks.slice(0, Math.min(6, chunks.length));
  const scaled = use.map(c => resize(c, Math.max(3, Math.round(c.w * 0.85)), Math.max(3, Math.round(c.h * 0.85))));
  const H = Math.round(Math.max(...scaled.map(c => c.h)) * 1.5);
  const canvas = new Img(targetW + 40, H + 12);
  const order = scaled.slice().sort((a, b) => a.h - b.h);
  order.forEach((c, i) => {
    const x = Math.round(20 + (i / Math.max(1, order.length - 1)) * (targetW - c.w) + (r() - 0.5) * 14);
    const lift = i % 2 === 0 ? 0 : Math.round(c.h * 0.35);
    composite(canvas, c, x, canvas.h - c.h - lift - 2);
  });
  return grade(trim(canvas, 1).img, { brightness: -14, saturation: 0.85 });
}

const propFrames = [], debrisFrames = [], materials = {};
const preLit = {};        // id -> toned but unlit source, so variants can be re-lit not mirrored
let missing = [];

for (const p of PROPS) {
  const file = path.join(KEYED, p.src + '.png');
  if (!fs.existsSync(file)) { missing.push(p.id); continue; }
  let im = readPNG(file);
  if (p.cropRight) im = feather(trim(crop(im, 0, 0, Math.round(im.w * (1 - p.cropRight)), im.h), 0).img, 'right');
  if (p.cropBottom) im = feather(trim(crop(im, 0, 0, im.w, Math.round(im.h * (1 - p.cropBottom))), 0).img, 'bottom');
  const scale = p.w / im.w;
  im = resize(im, p.w, Math.max(1, Math.round(im.h * scale)));
  im = trim(im, 0).img;

  // ---- bake the form, once, before anything is cut out of it, so cracks, chunks and
  // settled rubble all inherit the same light. Everything in the kit is lit to ONE key
  // (light.KEY, upper-left) — that consistency is the whole point.
  if (p.tone) im = grade(im, p.tone);
  preLit[p.id] = { img: im, spec: p };
  im = sculpt(im, p.light || {});
  if (p.emit) {
    im = pointRelight(im, {
      lx: p.emit.u * im.w, ly: p.emit.v * im.h,
      radius: p.emit.r * Math.max(im.w, im.h),
      color: p.emit.color, strength: p.emit.strength,
    });
  }

  const bb = alphaBBox(im);
  const anchor = { ax: Math.round(im.w / 2), ay: im.h };

  propFrames.push({ id: p.id, img: im, ...anchor });
  const c1 = makeCracked(im, p.material, 991 + p.id.length * 7, 1);
  const c2 = makeCracked(im, p.material, 991 + p.id.length * 7, 2);
  propFrames.push({ id: p.id + '_crack1', img: c1, ...anchor });
  propFrames.push({ id: p.id + '_crack2', img: c2, ...anchor });

  const chunks = makeChunks(im, p.material, 331 + p.id.length * 13, { count: p.chunks, grain: p.grain });
  const chunkIds = [];
  chunks.forEach((c, i) => {
    const id = `${p.id}_d${i}`;
    chunkIds.push(id);
    debrisFrames.push({ id, img: c, ax: Math.round(c.w / 2), ay: Math.round(c.h / 2) });
  });

  let settledId = null;
  if (chunks.length >= 3) {
    const s = settle(chunks, 17 + p.id.length, p.w);
    settledId = p.id + '_settled';
    propFrames.push({ id: settledId, img: s, ax: Math.round(s.w / 2), ay: s.h });
  }

  materials[p.id] = {
    material: p.material, hp: p.hp,
    w: im.w, h: im.h,
    states: [p.id, p.id + '_crack1', p.id + '_crack2'],
    settled: settledId,
    debris: chunkIds,
  };
  console.log(`${p.id.padEnd(16)} ${p.material.padEnd(8)} ${im.w}x${im.h}  ${chunks.length} chunks`);
}

// ---------------------------------------------------------------- stamp variants
//
// The critic counted the same fern, the same mushroom cluster and the same knot-hole
// spiral three times each at identical scale and shading. These are the elements that get
// scattered in bulk, so each needs 3-4 readings.
//
// A mirrored copy of a LIT stamp mirrors its light with it, which is worse than the
// repetition — so variants are built from the toned-but-unlit source, flipped/squashed
// there, and then lit again to the same key.
const VARIANTS = {
  ferns:      [[-1, 1.00, 0.90], [1, 0.74, 1.12], [-1, 1.22, 0.82]],
  mushrooms:  [[-1, 0.96, 1.10], [1, 0.68, 0.86], [-1, 1.26, 0.94]],
  bush:       [[-1, 1.05, 0.86], [1, 0.78, 1.08]],
  rocks_small:[[-1, 1.10, 0.88], [1, 0.72, 1.10]],
  skull_pile: [[-1, 0.94, 1.06], [1, 1.18, 0.86]],
  rubble_heap:[[-1, 1.08, 0.84], [1, 0.80, 1.06]],
  crate:      [[-1, 1.00, 1.00], [1, 0.86, 0.92]],
};
const variants = {};
for (const [id, list] of Object.entries(VARIANTS)) {
  const src = preLit[id];
  if (!src) continue;
  const ids = [id];
  list.forEach(([flip, sx, sy], i) => {
    let v = flip < 0 ? flipX(src.img) : src.img;
    const nw = Math.max(4, Math.round(src.img.w * sx)), nh = Math.max(4, Math.round(src.img.h * sy));
    v = resize(v, nw, nh);
    // a touch of value drift too, or four identical-value copies still read as a stamp
    v = grade(v, { brightness: (i % 2 ? 7 : -9), saturation: 0.92 + i * 0.06 });
    v = sculpt(v, src.spec.light || {});
    if (src.spec.emit) v = pointRelight(v, {
      lx: src.spec.emit.u * nw, ly: src.spec.emit.v * nh,
      radius: src.spec.emit.r * Math.max(nw, nh),
      color: src.spec.emit.color, strength: src.spec.emit.strength,
    });
    const vid = `${id}_v${i + 1}`;
    propFrames.push({ id: vid, img: v, ax: Math.round(v.w / 2), ay: v.h });
    ids.push(vid);
  });
  variants[id] = ids;
}
console.log('variants: ' + Object.entries(variants).map(([k, v]) => `${k}x${v.length}`).join(' '));

// A tree is two props stacked: burn or shatter the trunk and the canopy falls on its own.
// dy is the offset of the part's anchor from the composite's anchor (feet), +y is down.
const COMPOSITES = {
  tree_oak:   { parts: [{ id: 'oak_trunk', grain: 'v', dx: 0, dy: 0 }, { id: 'tree_foliage', dx: 0, dy: -235 }],
                topples: 'oak_trunk' },
  tree_young: { parts: [{ id: 'tree_trunk', grain: 'v', dx: 0, dy: 0 }, { id: 'tree_foliage_b', dx: 0, dy: -150 }],
                topples: 'tree_trunk' },
};
for (const [id, c] of Object.entries(COMPOSITES))
  c.parts = c.parts.filter(p => materials[p.id]);

if (missing.length) console.warn('MISSING sources:', missing.join(', '));

const props = write(OUT, 'props', pack(propFrames, { width: 2048, padding: 2 }));
const debris = write(OUT, 'debris', pack(debrisFrames, { width: 1024, padding: 2 }));
fs.writeFileSync(path.join(ROOT, 'work', 'props_manifest.json'),
  JSON.stringify({ props, debris, materials, composites: COMPOSITES, variants }, null, 1));
console.log(`props.png  ${props.w}x${props.h}  ${(props.bytes/1024).toFixed(0)}KB`);
console.log(`debris.png ${debris.w}x${debris.h}  ${(debris.bytes/1024).toFixed(0)}KB`);
