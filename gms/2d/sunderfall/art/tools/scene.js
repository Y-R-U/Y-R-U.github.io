// Full-scene composition: bands + ground + ledges + props + lighting + post, at 1920x1080.
// This is what goes into refs/ours/ next to the Dead Cells / Ori screenshots.
//   node scene.js <location> <out.png> [--scale 1] [--cam 700] [--broken]
//
// This file is a STAND-IN FOR THE ENGINE, not a cheat. Everything it does here — soft light
// pools, spill onto neighbours, bloom, per-layer haze — the runtime does with its 256-light
// additive buffer and HDR chain. The one thing it does that the renderer currently cannot is
// project a cast shadow from a sprite silhouette; that is written up as a REQUEST in
// HANDOFF.md, because contact and cast shadows are most of what stops art floating.
//
// Composition rules being enforced here, from the round-1 critique:
//   * one key light, upper-left, and EVERY object obeys it (light.KEY)
//   * two ground heights, never one ruled line, and spacing in clumps with real gaps
//   * one platform per screen physically joined into a trunk or a cliff
//   * something cropped off the bottom edge so the lower third is not bare soil
//   * one high-contrast pair (brightest next to darkest) where the player should look
const fs = require('fs');
const path = require('path');
const { Img, readPNG, readImage, writePNG, resize, crop, composite, grade, mapPixels, blur } = require('./img.js');
const { rng } = require('./raster.js');
const { KEY, castShadow, shadowOnto, pool, halo, pointRelight, sculpt, norm } = require('./light.js');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, '..', 'game', 'assets');
const man = JSON.parse(fs.readFileSync(path.join(ASSETS, 'atlas.json')));

const loc = process.argv[2];
const out = process.argv[3] || path.join(ROOT, 'work', `scene_${loc}.png`);
const argOf = (flag, dflt) => { const i = process.argv.indexOf(flag); return i > 0 ? +process.argv[i + 1] : dflt; };
const camX = argOf('--cam', 700);
const SCALE = argOf('--scale', 0.5);
const broken = process.argv.includes('--broken');

const VIEW_W = 1920, VIEW_H = 1080;
const camY = -380;                       // ground sits at 85% down: soil is a strip, not a third
const W = Math.round(VIEW_W * SCALE), H = Math.round(VIEW_H * SCALE);
const sx = wx => Math.round((wx - camX + VIEW_W / 2) * SCALE);
const sy = wy => Math.round((wy - camY + VIEW_H / 2) * SCALE);

const view = Img.blank(W, H, 5, 7, 11, 255);
const L = norm(KEY.dir);
const SHEAR = L[0] / L[1];               // world x per world y for anything the key throws

// ---------------------------------------------------------------- atlas access
const sheets = {};
function frame(atlas, id) {
  if (!sheets[atlas]) sheets[atlas] = readImage(path.join(ASSETS, man.atlases[atlas].image));
  const f = man.atlases[atlas].frames[id];
  if (!f) return null;
  return { img: crop(sheets[atlas], f.x, f.y, f.w, f.h), f };
}
const scaledCache = new Map();
function sprite(atlas, id, s) {
  const k = `${atlas}|${id}|${s.toFixed(4)}`;
  if (!scaledCache.has(k)) {
    const got = frame(atlas, id);
    if (!got) { scaledCache.set(k, null); }
    else {
      const { img, f } = got;
      const im = resize(img, Math.max(1, Math.round(f.w * s)), Math.max(1, Math.round(f.h * s)));
      scaledCache.set(k, { im, ax: f.ax * s, ay: f.ay * s });
    }
  }
  return scaledCache.get(k);
}

// ---------------------------------------------------------------- lighting helpers

/**
 * Ambient occlusion where an object meets a surface: a tight near-black core plus a wide
 * soft skirt. One soft blob alone reads as an airbrush smudge; the tight core is what makes
 * the object look like it is actually touching.
 */
function contactAO(wx, wy, w, strength = 1) {
  const passes = [[0.34, 0.085, 0.62], [0.80, 0.20, 0.30]];
  for (const [rxk, ryk, k0] of passes) {
    const rx = Math.max(2, w * rxk * SCALE), ry = Math.max(1.5, w * ryk * SCALE);
    const cx = sx(wx), cy = sy(wy);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      if (y < 0 || y >= H) continue;
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x < 0 || x >= W) continue;
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d >= 1) continue;
        const k = (1 - d) ** 1.7 * k0 * strength;
        const i = (y * W + x) * 4;
        view.data[i] *= 1 - k; view.data[i+1] *= 1 - k; view.data[i+2] *= 1 - k;
      }
    }
  }
}

/**
 * Project a sprite's silhouette onto a ground plane `groundWY` below its foot, along the
 * key. Distance from the caster softens and weakens the shadow, the way a real one does.
 */
function castOnGround(im, footWX, footWY, groundWY, o = {}) {
  const drop = Math.max(0, groundWY - footWY);
  const soft = 0.05 + Math.min(0.10, drop / 4000);
  const sh = castShadow(im, {
    squash: o.squash ?? 0.26, len: o.len ?? 1.0, soft,
    alpha: (o.alpha ?? 0.55) * (1 - Math.min(0.45, drop / 1400)),
  });
  shadowOnto(view, sh.img,
    sx(footWX + drop * SHEAR) - Math.round(sh.ax),
    sy(groundWY) - Math.round(sh.ay),
    o.tint || [0.13, 0.16, 0.24], sy(groundWY) - Math.round(sh.img.h * 0.9));
}

/** A slab's shadow thrown along the ground: the cliff and the platforms darken what is under them. */
function slabShadow(wx0, wx1, wyTop, wyGround, strength = 0.5) {
  const drop = wyGround - wyTop;
  if (drop <= 0) return;
  const ox = drop * SHEAR;
  const x0 = sx(wx0 + ox), x1 = sx(wx1 + ox);
  const yTop = sy(wyGround) - Math.round(drop * 0.10 * SCALE);
  const yBot = sy(wyGround) + Math.round((36 + drop * 0.16) * SCALE);
  const feather = Math.max(6, (x1 - x0) * 0.16);
  for (let y = yTop; y <= yBot; y++) {
    if (y < 0 || y >= H) continue;
    const vt = (y - yTop) / Math.max(1, yBot - yTop);
    const kv = Math.sin(Math.PI * Math.min(1, vt)) ** 0.6;
    for (let x = x0 - feather; x <= x1 + feather; x++) {
      if (x < 0 || x >= W) continue;
      let kh = 1;
      if (x < x0) kh = 1 - (x0 - x) / feather;
      if (x > x1) kh = 1 - (x - x1) / feather;
      const k = Math.max(0, kh) * kv * strength;
      if (k <= 0.002) continue;
      const i = (y * W + x) * 4;
      view.data[i] *= 1 - k * 0.86; view.data[i+1] *= 1 - k * 0.84; view.data[i+2] *= 1 - k * 0.72;
    }
  }
}

// ---------------------------------------------------------------- scene definitions
//
// shelves  ground planes, back to front. Two heights minimum — one ruled play line across
//          the frame was defect #6.
// ledges   [frameKey, worldX of the LEFT edge, worldY of the surface]. `jl` and `jr` are
//          capped at one end only and are placed so the open end drives into a cliff or a
//          trunk (defect #5).
// props    [id, x, y, scale?, flip?]. Clumped, never evenly spaced.
// fg       foreground occluders, drawn last, cropped off the bottom edge.
// lights   real local sources: each gets a ground pool, a halo, spill onto its neighbours
//          and a short cast shadow (defect #2).
const SCENES = {
  sunderwood: {
    kind: 'forest',
    // two heights: a raised shelf on the left, a cliff, then the main floor
    shelves: [{ x0: -1100, x1: 170, y: -210 }, { x0: 170, x1: 2300, y: 0 }],
    // 'jr' is open on the right and buries into the dead tree; 'jl' is open on the left and
    // buries into the hero oak. Neither of them floats.
    ledges: [['jr', -380, -530], ['jl', 700, -430], ['s', 1290, -290], ['xs', 300, -690]],
    props: [
      // left shelf: a bare trunk to anchor the high platform into, and one tight clump
      ['deadtree', 60, -210, 1.5],
      ['stump', -230, -210, 1.0], ['ferns_v1', -150, -210, 1.05], ['rocks_small', -60, -210, 0.85, true],
      ['mushrooms_v2', -170, -530, 0.85], ['ferns_v3', -80, -530, 0.85, true],
      // the hero: one big tree, on the golden section, with the canopy attached to it
      ['tree_oak', 830, 0, 2.05],
      // the bright pair the eye is meant to land on, against the trunk's near-black base
      ['boulder_big', 430, 0, 1.15], ['mushrooms_v1', 590, 0, 1.4], ['ferns', 690, 0, 1.05],
      ['bush', 300, 0, 0.9, true],
      // gap, then the right group on the main floor
      ['log', 1450, 0, 1.05], ['skull_pile', 1330, 0, 0.85], ['bush_v1', 1620, 0, 1.0],
      ['ferns_v3', 1560, 0, 0.95, true], ['crate', 1330, -290, 0.9],
    ],
    fg: [['bush', -190, 130, 3.4, false], ['ferns_v1', 1660, 130, 3.4, true],
         ['ferns_v3', 500, 165, 2.8, false], ['bush_v1', 1120, 150, 3.0, true],
         ['ferns', 860, 180, 2.4, true], ['ferns_v2', 200, 175, 2.6, false],
         ['ferns_v1', 1380, 185, 2.3, false], ['bush', 690, 195, 2.0, true]],
    lights: [
      { x: 590, y: -14, r: 330, ry: 86, color: [50, 142, 176], strength: 1.05, halo: 0, tag: 'cyan' },
      { x: 590, y: -84, r: 175, ry: 175, color: [40, 120, 152], strength: 0.58, halo: 165, tag: 'cyan' },
      { x: -170, y: -544, r: 200, ry: 54, color: [40, 118, 150], strength: 0.8, halo: 0, tag: 'cyan' },
      // where the mid-band shaft lands. The key is drawn in the backdrop; it has to land
      // somewhere or the shafts light nothing, which was the whole of defect #1.
      { x: 40, y: -224, r: 440, ry: 100, color: [58, 78, 108], strength: 0.72, halo: 0 },
    ],
    grade: { warm: [150, 190, 225], lightAt: [0.30, 0.20] },
  },

  thornmere: {
    kind: 'forest',
    shelves: [{ x0: -1200, x1: 700, y: 0 }, { x0: 700, x1: 2300, y: -320 }],
    // the open right end of 'jr' is driven into the cliff face under the upper shelf
    ledges: [['jr', 300, -150], ['m', 1080, -640], ['xs', 210, -560]],
    props: [
      ['crate', -180, 0, 1.05], ['crate', -95, 0, 0.9, true], ['barrel', -15, 0, 1.05],
      ['crate_v2', -60, -78, 0.7],
      ['fence', 210, 0, 1.0], ['fence', 400, 0, 1.0, true],
      ['lamppost', 560, 0, 1.5],
      ['bush_v1', 650, 0, 0.9], ['rocks_small_v1', 120, 0, 0.8, true],
      ['lantern', 380, -150, 0.95],
      ['wall_brick', 900, -320, 1.15], ['barrel', 1090, -320, 0.95], ['crate_v1', 1160, -320, 0.9],
      ['bush', 1480, -320, 1.0, true], ['skull_pile_v1', 1300, -320, 0.85],
      ['ferns_v2', 1560, -320, 0.9],
    ],
    fg: [['bush', -140, 130, 3.2, false], ['ferns_v1', 1600, 120, 3.2, true],
         ['ferns_v3', 460, 175, 2.6, false], ['bush_v1', 980, 160, 2.6, true],
         ['ferns', 800, 190, 2.2, true]],
    lights: [
      { x: 560, y: -8, r: 380, ry: 96, color: [140, 88, 32], strength: 1.0, halo: 0 },
      { x: 560, y: -330, r: 260, ry: 260, color: [128, 78, 26], strength: 0.7, halo: 200, tag: 'fire' },
      { x: 380, y: -158, r: 230, ry: 58, color: [122, 76, 28], strength: 0.8, halo: 0 },
      { x: 380, y: -196, r: 150, ry: 150, color: [120, 76, 28], strength: 0.6, halo: 130, tag: 'fire' },
    ],
    grade: { warm: [255, 176, 96], lightAt: [0.42, 0.52] },
  },

  glyphglade: {
    kind: 'forest',
    shelves: [{ x0: -1000, x1: 900, y: 0 }, { x0: 900, x1: 2200, y: -170 }],
    ledges: [['jl', -20, -420], ['s', 700, -270], ['xl', 1120, -540]],
    props: [
      ['stump', -180, 0, 1.1], ['rubble_heap_v1', -60, 0, 0.95], ['rocks_small', 60, 0, 0.85, true],
      ['burnt_trunk', -110, 0, 1.7], ['deadtree', 620, 0, 1.4],
      ['brazier', 330, 0, 1.2],
      ['ribcage', 790, 0, 0.95], ['skull_pile', 880, 0, 0.85, true],
      ['boulder_small', 1000, -170, 1.0], ['rubble_heap', 1180, -170, 0.9],
      ['standing_stone', 1450, -170, 1.5], ['rocks_small_v2', 1600, -170, 0.9],
      ['skull_pile_v2', 220, -420, 0.8], ['rocks_small_v2', 340, -420, 0.75, true],
    ],
    fg: [['bush', 20, 145, 3.0, false], ['ferns', 1420, 130, 3.2, true],
         ['ferns_v3', 640, 180, 2.4, false], ['bush_v1', 1080, 165, 2.6, true],
         ['ferns_v1', 300, 195, 2.1, true]],
    lights: [
      { x: 330, y: -100, r: 520, ry: 520, color: [150, 74, 22], strength: 0.78, halo: 250, tag: 'fire' },
      { x: 330, y: -4, r: 430, ry: 106, color: [156, 82, 26], strength: 1.1, halo: 0 },
    ],
    grade: { warm: [255, 158, 72], lightAt: [0.42, 0.62] },
  },

  ruinreach: {
    kind: 'stone',
    shelves: [{ x0: -1000, x1: 480, y: -180 }, { x0: 480, x1: 2200, y: 0 }],
    ledges: [['jl', 760, -470], ['m', -170, -600], ['s', 1300, -280], ['xs', 200, -510]],
    props: [
      ['wall_brick', -180, -180, 1.2], ['rubble_heap', 20, -180, 1.0],
      ['rocks_small_v1', 150, -180, 0.85, true], ['bush_v1', 300, -180, 0.85],
      ['arch_stone', -420, -180, 1.4],
      ['pillar_stone', 700, 0, 2.0], ['brazier', 890, 0, 1.25],
      ['rubble_heap_v2', 1010, 0, 0.95], ['skull_pile', 1130, 0, 0.9],
      ['gate_iron', 1520, 0, 1.2], ['boulder_small', 1360, 0, 0.9, true],
      ['ferns', 620, 0, 0.9], ['bush', 1220, 0, 0.85, true],
      ['skull_pile_v2', 900, -470, 0.8],
    ],
    fg: [['bush', 520, 150, 3.0, false], ['ferns_v1', 1620, 130, 3.2, true],
         ['ferns_v3', 940, 185, 2.4, false], ['bush_v1', 1300, 165, 2.6, true],
         ['ferns', 700, 195, 2.0, true]],
    lights: [
      { x: 890, y: -115, r: 540, ry: 540, color: [152, 84, 30], strength: 0.78, halo: 250, tag: 'fire' },
      { x: 890, y: -4, r: 460, ry: 110, color: [158, 90, 34], strength: 1.1, halo: 0 },
    ],
    grade: { warm: [255, 176, 104], lightAt: [0.48, 0.60] },
  },
};

const S = SCENES[loc];
if (!S) { console.error('unknown location ' + loc); process.exit(1); }

// ---------------------------------------------------------------- bands
const bands = man.backgrounds[loc].bands;
const drawBands = which => {
  for (const b of bands) {
    if (!which.includes(b.id.split('_').pop())) continue;
    const tex = readImage(path.join(ASSETS, b.image));
    const dw = Math.round(b.worldW * SCALE), dh = Math.round(b.worldH * SCALE);
    const scaled = resize(tex, dw, dh);
    let x0 = sx(camX * (1 - b.parallax));
    while (x0 > 0) x0 -= dw;
    for (let x = x0; x < W; x += dw) composite(view, scaled, x, sy(b.anchorY));
  }
};
drawBands(['sky', 'far', 'mid', 'near']);

// ---------------------------------------------------------------- terrain
const T = man.terrain[S.kind];

function drawTerrainFrame(id, wx, wy, s = 1) {
  const sp = sprite('terrain', id, s * SCALE);
  if (!sp) { console.warn('no terrain frame ' + id); return; }
  composite(view, sp.im, sx(wx) - Math.round(sp.ax), sy(wy) - Math.round(sp.ay));
}

function drawShelf(sh) {
  const capW = T.capW, runW = T.runW;
  // cliff face under the shelf, down past the frame
  const wallTop = sh.y + T.runH - T.surfaceY;
  for (let x = sh.x0; x < sh.x1; x += T.wallSize)
    for (let y = wallTop; y < wallTop + T.wallSize * 5; y += T.wallSize)
      drawTerrainFrame(T.wall, x, y);
  // interchangeable runs between the caps
  let i = 0;
  for (let x = sh.x0 + capW; x < sh.x1 - capW; x += runW, i++)
    drawTerrainFrame(T.run[i % T.run.length], x, sh.y);
  drawTerrainFrame(T.capL, sh.x0, sh.y);
  drawTerrainFrame(T.capR, sh.x1 - capW, sh.y);
}

// back to front so a nearer shelf occludes the one behind, and the step reads
const shelves = S.shelves.slice().sort((a, b) => a.y - b.y);
for (const sh of shelves) {
  drawShelf(sh);
  // the raised shelf throws its edge shadow across whatever is below and to the key side
  const below = shelves.find(o => o.y > sh.y);
  if (below) slabShadow(sh.x0, sh.x1, sh.y, below.y, 0.5);
}

const groundAt = wx => {
  let best = shelves[0];
  for (const sh of shelves) if (wx >= sh.x0 && wx < sh.x1) best = sh;
  return best.y;
};

// ledges, with a cast shadow onto the ground below each
for (const [key, x, y] of S.ledges) {
  const id = T.ledge[key];
  if (!id) { console.warn('no ledge ' + key); continue; }
  const sp = sprite('terrain', id, SCALE);
  if (sp) castOnGround(sp.im, x + sp.im.w / SCALE / 2, y, groundAt(x + 200), { squash: 0.22, alpha: 0.42 });
  drawTerrainFrame(id, x, y);
}

// scatter decals along the walkable surfaces, in clumps, using every variant
const decals = man.decals;
{
  const r = rng(loc.length * 31 + 7);
  for (const sh of shelves) {
    const span = Math.min(sh.x1, camX + 1200) - Math.max(sh.x0, camX - 1200);
    if (span <= 0) continue;
    const n = Math.round(span / 190);
    for (let i = 0; i < n; i++) {
      const wx = Math.max(sh.x0, camX - 1200) + (i + r() * 0.9) * (span / n);
      const id = decals[Math.floor(r() * decals.length) % decals.length];
      drawTerrainFrame(id, wx, sh.y - 2 + r() * 5, 0.55 + r() * 0.7);
    }
  }
}

// ---------------------------------------------------------------- lights, pass 1 (pools)
// Ground pools go down BEFORE the props so a prop standing in one still occludes it.
for (const li of S.lights) {
  if (!li.halo) pool(view, sx(li.x), sy(li.y), li.r * SCALE, li.ry * SCALE, li.color, li.strength, { power: 2.0 });
}

// ---------------------------------------------------------------- props
function propImage(id, s, flip, wx, wy) {
  const sp = sprite('props', id, s * SCALE);
  if (!sp) return null;
  let im = sp.im;
  if (flip) {
    const f = new Img(im.w, im.h);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const a = (y * im.w + (im.w - 1 - x)) * 4, b = (y * im.w + x) * 4;
      f.data[b] = im.data[a]; f.data[b+1] = im.data[a+1]; f.data[b+2] = im.data[a+2]; f.data[b+3] = im.data[a+3];
    }
    // a mirrored copy carries mirrored light, so put the key back where it belongs
    im = sculpt(f, { keyAmt: 0.30, shadowSide: 0.34, rim: 0.34, cavity: 0.22, contact: 0.18, planar: 0.5 });
  }
  // spill: every local source lights the objects near it, or it is a decal and not a light
  for (const li of S.lights) {
    if (li.halo === 0 && li.tag !== 'cyan') continue;
    const d = Math.hypot(wx - li.x, (wy - li.y) * 0.8);
    const reach = li.r * 1.5;
    if (d > reach) continue;
    im = pointRelight(im, {
      lx: (sx(li.x) - (sx(wx) - sp.ax)), ly: (sy(li.y) - (sy(wy) - sp.ay)),
      radius: reach * SCALE,
      color: li.color.map(c => c / 160),
      strength: li.strength * 0.85 * (1 - d / reach),
    });
  }
  return { im, ax: sp.ax, ay: sp.ay };
}

function drawProp(id, wx, wy, s = 1, flip = false) {
  const got = propImage(id, s, flip, wx, wy);
  if (!got) { console.warn('no prop ' + id); return; }
  const m = man.materials[id] || man.materials[id.replace(/_v\d$/, '')];
  const wWorld = m ? m.w * s : got.im.w / SCALE;

  // key shadow, then the AO that says it is touching, then the object
  castOnGround(got.im, wx, wy, wy, { alpha: 0.55 });
  // a second, short shadow away from each local source
  for (const li of S.lights) {
    if (!li.halo) continue;
    const d = Math.hypot(wx - li.x, wy - li.y);
    if (d > li.r * 1.2 || d < 40) continue;
    const dir = norm([wx - li.x, Math.max(30, wy - li.y)]);
    const sh = castShadow(got.im, { dir, squash: 0.20, len: 0.55, soft: 0.07,
                                    alpha: 0.34 * (1 - d / (li.r * 1.2)) });
    shadowOnto(view, sh.img, sx(wx) - Math.round(sh.ax), sy(wy) - Math.round(sh.ay),
               [0.18, 0.16, 0.20], sy(wy) - Math.round(sh.img.h * 0.9));
  }
  contactAO(wx, wy, wWorld);
  composite(view, got.im, sx(wx) - Math.round(got.ax), sy(wy) - Math.round(got.ay));
}

// a composite prop is trunk + canopy; expand it here so the canopy never floats
const propList = [];
for (const p of S.props) {
  const c = man.composites[p[0]];
  if (!c) { propList.push(p); continue; }
  const sc = p[3] ?? 1;
  // canopy first, trunk second: the canopy sprite has a cropped bottom edge, and the only
  // thing that hides a ruled crop line is the trunk's own branches drawn over it
  const parts = c.parts.slice().sort((a, b) => a.dy - b.dy);
  for (const part of parts) propList.push([part.id, p[1] + part.dx * sc, p[2] + part.dy * sc, sc, p[4]]);
}

for (const [id, x, y, s = 1, flip = false] of propList) {
  const m = man.materials[id];
  if (!broken || !m) { drawProp(id, x, y, s, flip); continue; }
  const roll = Math.abs((x * 7919) % 3);
  if (roll === 0) { drawProp(m.states[2], x, y, s, flip); continue; }
  if (roll === 1) { drawProp(m.states[1], x, y, s, flip); continue; }
  if (m.settled) drawProp(m.settled, x, y, s, flip);
  const rr = rng(x | 0);
  m.debris.forEach((d, i) => {
    if (i % 2) return;
    const sp = sprite('debris', d, (0.9 + rr() * 0.2) * s * SCALE);
    if (!sp) return;
    composite(view, sp.im, sx(x + (rr() - 0.5) * m.w * 2.6 * s) - Math.round(sp.ax),
                           sy(y - rr() * 26) - Math.round(sp.ay));
  });
}

// ---------------------------------------------------------------- lights, pass 2 (air)
// Air glow around an emitter, deliberately weak: a strong additive circle IS a decal, and
// the bright-pass bloom below already builds a proper halo out of the emitter's own pixels.
for (const li of S.lights)
  if (li.halo) halo(view, sx(li.x), sy(li.y), li.halo * SCALE, li.color, li.strength * 0.38);

drawBands(['fg']);

// ---------------------------------------------------------------- foreground crop
// Near-black, razor-edged, and running off the bottom of the frame. The critic liked the
// ground fringe; this is the same idea one step closer to camera, and it is what keeps the
// lower third from being a soil cross-section.
for (const [id, x, y, s, flip] of S.fg) {
  const got = propImage(id, s, flip, x, -9999);
  if (!got) continue;
  const dark = grade(got.im, { tint: [0.16, 0.19, 0.26], contrast: 1.2, saturation: 0.3 });
  composite(view, dark, sx(x) - Math.round(got.ax), sy(y) - Math.round(got.ay));
}

// ---------------------------------------------------------------- post
const g = S.grade;
let img = mapPixels(view, (r, gg, b, a, x, y) => {
  const d = Math.hypot(x / W - g.lightAt[0], (y / H - g.lightAt[1]) * 0.8) / 0.55;
  const k = Math.max(0, 1 - d) ** 2 * 0.20;
  return [r + g.warm[0] * k, gg + g.warm[1] * k, b + g.warm[2] * k, a];
});
const bright = mapPixels(img, (r, gg, b) => {
  const l = (r * 0.299 + gg * 0.587 + b * 0.114 - 132) / 123;
  const k = Math.max(0, l);
  return [r * k, gg * k, b * k, 255];
});
const bl = blur(bright, Math.round(14 * SCALE / 0.5), 3);
img = mapPixels(img, (r, gg, b, a, x, y) => {
  const i = (y * W + x) * 4;
  return [r + bl.data[i] * 0.5, gg + bl.data[i+1] * 0.5, b + bl.data[i+2] * 0.5, a];
});
img = mapPixels(img, (r, gg, b, a, x, y) => {
  const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
  const v = 1 - Math.min(1, (dx * dx + dy * dy) * 0.44) ** 1.35 * 0.66;
  return [r * v, gg * v, b * v, a];
});
img = grade(img, { contrast: 1.10, saturation: 1.06 });

writePNG(out, img);
console.log(out, W + 'x' + H);
