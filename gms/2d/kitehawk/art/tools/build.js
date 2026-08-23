// build.js — runs the whole bake chain and writes assets/.
//
//   node art/tools/build.js [clouds|fx|hero|strips|atmos|manifest|all]
//
// Order is fixed and it is the P3 brief's:
//   crop -> key -> poster (TERRAIN props only) -> trim -> tile (strips only) -> atlas -> verify
// with one addition, `levels`, between trim and atlas on every ramp-mapped shared plate.
// The reason it exists is measured and is in levels.js's header.
//
// Two D57 rules run through everything here:
//   * crop the cutouts, KEY the sheets. An FX sheet has marks inside the 4% zone.
//   * key at tolerance >= 12 against a PER-PLATE sampled backdrop, then keep only the
//     largest connected component.
const fs = require('fs');
const path = require('path');
const { Img, readPNG, writePNG, writeSmallest, resize, composite } = require('./img.js');
const { cropPlate } = require('./crop.js');
const { key, estimateBg } = require('./key.js');
const { trimTo, split } = require('./trim.js');
const { fitLuma, crushToSilhouette, deRim, p90Luma, stats } = require('./levels.js');
const { tile, checkJoins } = require('./tile.js');
const atlas = require('./atlas.js');
const { despeckle } = require('./poster.js');

const ROOT = path.resolve(__dirname, '..', '..');
const GEN = path.join(ROOT, 'art', 'gen', 'out');
const RAW = path.join(ROOT, 'art', 'raw');
const WORK = path.join(ROOT, 'art', 'work');
const OUT = path.join(ROOT, 'assets');
const mk = d => (fs.mkdirSync(d, { recursive: true }), d);

/** crop -> key -> largest component -> trim. The common front half of the chain. */
function cut(file, o = {}) {
  const raw = readPNG(file);
  const c = cropPlate(raw, { inset: o.inset ?? 0.04, mode: o.cropMode });
  const bg = estimateBg(c.img);
  // D57: tolerance >= 12, sampled per plate. An exact key removes nothing, because D34's
  // stem puts real paper grain in the backdrop.
  const k = key(c.img, { bg, lo: o.lo ?? 16, hi: o.hi ?? 60, shrink: o.shrink ?? 0.12, maxHole: o.maxHole });
  // A STRIP is never trimmed, and this is not an optimisation -- it is two bugs that a
  // plausible join number hid completely.
  //   * trimTo pads 2 transparent px on every side, so every tile boundary shipped a 2 px
  //     transparent gap: a visible seam line in game, and the reason the join metric read
  //     0.00 on a deliberately broken control (it was comparing two empty columns).
  //   * trimming to the content bbox gives the two sources of ONE strip different heights
  //     (946x326 and 946x214 on the first pair measured), so the shared resize stretched
  //     them by different factors and the skyline could not register across the join.
  // Both are invisible to the eye on a single plate and fatal across a pair.
  if (o.strip) {
    // The keyed sky above a skyline keeps a scatter of tiny opaque islands -- paper grain in
    // the backdrop that survived the tolerance. They read as white specks against the sky
    // ramp. Same rule as everywhere else here: drop components too small to be paint.
    const killed = despeckle(k, o.speck ?? 90);
    return { img: k, bg, dropped: killed, cropped: c.img };
  }
  const t = trimTo(k, { pad: 2, largest: o.largest !== false });
  return { img: t.img, bg, dropped: t.dropped, cropped: c.img };
}

const cap = (img, max) => (Math.max(img.w, img.h) <= max ? img
  : resize(img, Math.round(img.w * max / Math.max(img.w, img.h)), Math.round(img.h * max / Math.max(img.w, img.h))));

/* ------------------------------------------------------------------- CLOUD_MID */
// D55: pack large at 768, downscale small to 512, never upscale to 1024. The sources are
// all 768x768 because that is the only size on this model that does not summon a sticker
// border or a sun, so a 1024 slot would be storing empty resolution.
function buildClouds(log) {
  const large = [], small = [];
  for (let i = 1; i <= 24; i++) {
    const id = i <= 8 ? `cL0${i}` : `cS${String(i).padStart(2, '0')}`;
    const r = cut(path.join(GEN, `${id}.png`));
    const d = deRim(cap(r.img, i <= 8 ? 768 : 512));
    const f = fitLuma(d.img);
    (i <= 8 ? large : small).push({ id, img: f.img, before: f.before, after: f.after, rim: d });
  }
  const out = {};
  for (const [name, list] of [['clouds_l', large], ['clouds_s', small]]) {
    const p = atlas.pack(list.map(e => ({ id: e.id, img: e.img, ax: e.img.w / 2, ay: e.img.h / 2 })), { padding: 4, width: 2048 });
    out[name] = atlas.write(mk(path.join(OUT, 'sky')), name, p);
    // Roundness = opaque area / the area of its bounding ellipse. A cutout at ~1.0 is a
    // disc, and a disc scaled up in a 462 wu frame reads as a planet rather than a cloud --
    // exactly the failure the moon re-rolls were about, arriving a second time by scale
    // instead of by subject. Recorded per frame so clouds.js can cap it.
    for (const e of list) {
      let op = 0;
      for (let i = 0; i < e.img.w * e.img.h; i++) if (e.img.data[i * 4 + 3] > 200) op++;
      out[name].frames[e.id].round = +(op / (Math.PI * 0.25 * e.img.w * e.img.h)).toFixed(3);
    }
    log(`${name} ${p.image.w}x${p.image.h} ${(out[name].bytes / 1024).toFixed(0)} KB, ${list.length} frames`);
  }
  const cl = [...large, ...small];
  log(`  luminance after fit: p1 ${Math.min(...cl.map(e => e.after.p1)).toFixed(3)}-${Math.max(...cl.map(e => e.after.p1)).toFixed(3)}` +
    `  p99 ${Math.min(...cl.map(e => e.after.p99)).toFixed(3)}-${Math.max(...cl.map(e => e.after.p99)).toFixed(3)}` +
    `  worst clipHi ${(Math.max(...cl.map(e => e.after.clipHi)) * 100).toFixed(2)}% (was ${(Math.max(...cl.map(e => e.before.clipHi)) * 100).toFixed(2)}%)`);
  log(`  deRim: mean local rim excess ${(cl.reduce((a, e) => a + e.rim.before.rimExcess, 0) / cl.length).toFixed(4)} -> ${(cl.reduce((a, e) => a + e.rim.after.rimExcess, 0) / cl.length).toFixed(4)}`);
  return out;
}

/* ------------------------------------------------------------------------- FX */
// ATLAS_SKY §4/§8: crop the cutouts, KEY the sheets — several FX plates have marks inside
// the 4% crop zone — and cut them apart by CONNECTED COMPONENT, never by a grid. The
// delivered mark count is never the requested one.
// min area per sheet: x45 is 24 sizes of one comma-shaped ember and its marks are an order
// of magnitude smaller than a flak puff, so one global minimum silently returned zero marks
// from it. Per-sheet, and the count is printed so a zero cannot pass unnoticed again.
const FX_SHEETS = [
  ['x40_puff_a', 'puff', 1400], ['x42_puff_b', 'puff', 1400], ['x43_streak', 'streak', 900],
  ['x45_spark', 'spark', 60], ['x46_wisp', 'wisp', 900], ['x47b_shred', 'shred', 700],
  ['x48_blob', 'blob', 1400],
];

function buildFx(log) {
  const frames = [];
  for (const [s, fam, min] of FX_SHEETS) {
    const r = cut(path.join(GEN, `${s}.png`), { cropMode: 'none', largest: false, lo: 18, hi: 64, shrink: 0.14 });
    const parts = split(r.img, { min, pad: 2 });
    if (!parts.length) log(`  ${s}: ZERO MARKS -- min ${min} is above every component`);
    parts.forEach((p, k) => frames.push({ id: `${fam}_${s.slice(1, 3)}${k}`, img: cap(p.img, 224), ax: p.img.w / 2, ay: p.img.h / 2 }));
    log(`  ${s}: ${parts.length} marks (${fam})`);
  }
  const p = atlas.pack(frames, { padding: 4, width: 1024, tight: true });
  const w = atlas.write(mk(path.join(OUT, 'fx')), 'brushes', p);
  log(`brushes ${p.image.w}x${p.image.h} ${(w.bytes / 1024).toFixed(0)} KB, ${frames.length} marks`);
  return { brushes: w };
}

/* ----------------------------------------------------------------------- hero */
// ATLAS_SKY §8.7: SLICE h60b into the zeppelin's three envelope sections. Three
// independently generated thirds do not butt — the seams disagree in silhouette, value and
// seam spacing. Slicing is deterministic and seamless, and it is the crop-don't-prompt
// lesson applied to a different problem.
const HERO = [
  ['h60b_zeppelin_envelope', 'zep_env', { slice: 3 }],
  ['h61_balloon', 'balloon_drachen', {}],
  ['h65b_balloon_sphere', 'balloon_sphere', {}],
  ['h66_chateau', 'chateau', {}],
  ['h67_bridge_wrecked', 'bridge', {}],
  ['h68b_factory', 'factory', {}],
  ['h69_cathedral', 'cathedral', {}],
];

function buildHero(log) {
  const frames = [];
  for (const [file, id, o] of HERO) {
    const r = cut(path.join(GEN, `${file}.png`));
    const f = fitLuma(deRim(cap(r.img, o.slice ? 1536 : 768)).img);
    if (o.slice) {
      const n = o.slice, w = Math.floor(f.img.w / n);
      for (let i = 0; i < n; i++) {
        const seg = new Img(w, f.img.h);
        for (let y = 0; y < f.img.h; y++)
          for (let x = 0; x < w; x++) {
            const s = (y * f.img.w + i * w + x) * 4, d = (y * w + x) * 4;
            seg.data[d] = f.img.data[s]; seg.data[d + 1] = f.img.data[s + 1];
            seg.data[d + 2] = f.img.data[s + 2]; seg.data[d + 3] = f.img.data[s + 3];
          }
        const t = trimTo(seg, { pad: 1, largest: false });
        frames.push({ id: `${id}_${['fore', 'mid', 'aft'][i]}`, img: t.img, ax: t.img.w / 2, ay: t.img.h / 2 });
      }
      log(`  ${id}: sliced into ${n}`);
    } else {
      frames.push({ id, img: f.img, ax: f.img.w / 2, ay: f.img.h });
      if (r.dropped > 400) log(`  ${id}: largest-component dropped ${r.dropped}px of stray furniture`);
    }
  }
  const p = atlas.pack(frames, { padding: 4, width: 2048 });
  const w = atlas.write(mk(path.join(OUT, 'hero')), 'hero', p);
  log(`hero ${p.image.w}x${p.image.h} ${(w.bytes / 1024).toFixed(0)} KB, ${frames.length} frames`);
  return { hero: w };
}

/* --------------------------------------------------------------------- strips */
// Every 2048-texel strip maps to 4096 world units and ships as an A/B pair, giving the pair
// an 8192 wu period (ART.md §4's zoom subsection). Mirroring is banned outright.
const STRIP_SIZE = { hor: [1024, 160], gf: [1536, 224], gm: [2048, 352] };
const STRIP_LAYER = { hor: 'HORIZON', gf: 'GROUND_FAR', gm: 'GROUND_MID' };

function buildStrips(log) {
  const dir = mk(path.join(OUT, 'strips'));
  const out = {}, joins = [];
  for (let act = 1; act <= 5; act++)
    for (const lay of ['hor', 'gf', 'gm'])
      for (const v of ['a', 'b']) {
        const [W, H] = STRIP_SIZE[lay];
        const src = [1, 2].map(k => {
          const f = path.join(RAW, 'strips', `s${act}_${lay}_${v}${k}.png`);
          if (!fs.existsSync(f)) return null;
          // A strip is keyed against the grey field above its skyline, so the sky ramp shows
          // through. `largest:false` — a treeline is legitimately many components.
          const r = cut(f, { inset: 0.04, strip: true, lo: 16, hi: 62, shrink: 0.10 });
          return r.img;
        });
        if (src.some(s => !s)) { log(`  s${act}_${lay}_${v}: MISSING SOURCE, skipped`); continue; }
        // A higher-contrast pair needs a longer dissolve: act 5's burning towns are the
        // only pair whose seam did not settle at W/16 (excess 2.12 against a 1.0 line).
        // Widening the feather is the right fix and it is deterministic, so it is a ladder
        // rather than a hand-tuned per-strip constant.
        let t = null, feather = 0;
        for (const f of [W / 16, W / 10, W / 7, W / 5]) {
          feather = Math.round(f);
          t = tile(src[0], src[1], { w: W, height: H, feather });
          if (checkJoins(t).pass) break;
        }
        const id = `s${act}_${lay}_${v}`;
        const bytes = writeSmallest(path.join(dir, `${id}.png`), t);
        const j = checkJoins(t);
        joins.push({ id, ...j, feather });
        out[id] = { image: `strips/${id}.png`, w: W, h: H, bytes, act, layer: STRIP_LAYER[lay], variant: v, worldW: 4096, feather };
      }
  const bad = joins.filter(j => !j.pass);
  log(`strips ${Object.keys(out).length} files, ${(Object.values(out).reduce((a, b) => a + b.bytes, 0) / 1048576).toFixed(2)} MB`);
  log(`  A3 joins: worst ${Math.max(...joins.map(j => j.join)).toFixed(3)}/255, mean ${(joins.reduce((a, b) => a + b.join, 0) / joins.length).toFixed(3)}, ${bad.length} over budget`);
  bad.forEach(b => log(`    FAIL ${b.id} join ${b.join.toFixed(3)} excess ${b.excess.toFixed(3)} at feather ${b.feather}`));
  const wide = joins.filter(j => j.feather > STRIP_SIZE[j.id.split('_')[1]][0] / 16);
  if (wide.length) log(`  ${wide.length} strip(s) needed a wider dissolve: ${wide.map(w => w.id + '@' + w.feather).join(', ')}`);
  return out;
}

/* --------------------------------------------------------------------- atmos */
function buildAtmos(log) {
  const dir = mk(path.join(OUT, 'sky'));
  const out = {}, strips = {};
  // CLOUD_FAR cirrus: a tiling strip like the ground bands, but shared across acts.
  for (const v of ['a', 'b']) {
    const src = [1, 2].map(k => {
      const f = path.join(RAW, 'atmos', `a_cirrus_${v}${k}.png`);
      return fs.existsSync(f) ? cut(f, { strip: true, lo: 14, hi: 52, shrink: 0.08 }).img : null;
    });
    if (src.some(s => !s)) { log(`  cirrus_${v}: MISSING SOURCE`); continue; }
    let t = null, j = null, feather = 0;
    for (const f of [64, 96, 146, 205]) {
      feather = f;
      t = fitLuma(tile(src[0], src[1], { w: 1024, height: 192, feather })).img;
      j = checkJoins(t);
      if (j.pass) break;
    }
    const bytes = writeSmallest(path.join(dir, `cirrus_${v}.png`), t);
    strips[`cirrus_${v}`] = { image: `sky/cirrus_${v}.png`, w: 1024, h: 192, bytes, layer: 'CLOUD_FAR', variant: v, worldW: 8192, feather };
    log(`  cirrus_${v} ${(bytes / 1024).toFixed(0)} KB  seam excess ${j.excess.toFixed(3)}/255 at feather ${feather}  ${j.pass ? 'PASS' : 'FAIL'}`);
  }
  // CLOUD_NEAR wisps and FG_OCCLUDE shreds: sheets, cut apart by component.
  for (const [prefix, name, crush] of [['a_wisp', 'cloudnear', false], ['a_shred', 'fg', true]]) {
    const frames = [], gains = [];
    for (const k of [1, 2]) {
      const f = path.join(RAW, 'atmos', `${prefix}_${k}.png`);
      if (!fs.existsSync(f)) { log(`  ${name}: MISSING ${prefix}_${k}`); continue; }
      const r = cut(f, { cropMode: 'none', largest: false, lo: 18, hi: 64, shrink: 0.14 });
      split(r.img, { min: 2200, pad: 2 }).forEach((p, i) => {
        // Gate A6: everything on FG_OCCLUDE must sit below 12% luminance. The plate is
        // painted dark but not dark ENOUGH -- see the measured before/after below.
        const c = crush ? crushToSilhouette(cap(p.img, 512)) : null;
        const img = crush ? c.img : fitLuma(deRim(cap(p.img, 512)).img).img;
        if (crush) gains.push(c.gain);
        frames.push({ id: `${name}_${k}${i}`, img, ax: img.w / 2, ay: img.h / 2, raw: p.img });
      });
    }
    if (!frames.length) continue;
    const p = atlas.pack(frames.map(f => ({ id: f.id, img: f.img, ax: f.ax, ay: f.ay })), { padding: 4, width: 1024, tight: true });
    const w = atlas.write(dir, name, p);
    // The mean crush gain is recorded so gate A6 can have a control that actually breaks it:
    // multiplying it back out at draw time reproduces the un-crushed plates exactly, with no
    // second atlas to ship. See tools/skygate.mjs.
    if (crush && gains.length) w.crushGain = +(gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(4);
    out[name] = w;
    const p90 = frames.map(f => p90Luma(f.img)), p90raw = frames.map(f => p90Luma(f.raw));
    log(`  ${name} ${p.image.w}x${p.image.h} ${(w.bytes / 1024).toFixed(0)} KB, ${frames.length} frames` +
      (crush ? `  A6 p90 luma ${Math.max(...p90raw).toFixed(3)} -> ${Math.max(...p90).toFixed(3)} (gate: < 0.12)` : ''));
  }
  return { atlases: out, strips };
}

/* ------------------------------------------------------------------- manifest */
function buildManifest(parts, log) {
  const man = {
    note: 'KITEHAWK painted art. Ramps are sRGB 256x1 rows (D49). Strips map 2048 texels to 4096 wu and alternate A/B for an 8192 wu period; mirroring is banned (ART.md §4).',
    ramps: 'sky/ramps.json',
    grain: 'paper.png',
    atlases: {}, strips: {},
  };
  for (const [k, v] of Object.entries(parts.atlases || {})) man.atlases[k] = { image: v.image.includes('/') ? v.image : dirOf(k) + v.image, w: v.w, h: v.h, bytes: v.bytes, crushGain: v.crushGain, frames: v.frames };
  for (const [k, v] of Object.entries(parts.strips || {})) man.strips[k] = v;
  fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(man, null, 1));
  log(`atlas.json ${Object.keys(man.atlases).length} atlases, ${Object.keys(man.strips).length} strips`);
  return man;
}
const dirOf = k => (k.startsWith('clouds') || k === 'cloudnear' || k === 'fg' ? 'sky/' : k === 'brushes' ? 'fx/' : 'hero/');

/* ----------------------------------------------------------------------- main */
if (require.main === module) {
  const what = process.argv[2] || 'all';
  const log = s => console.log(s);
  mk(OUT);
  const atlases = {}, strips = {};
  const run = (name, fn, into) => { if (what === 'all' || what === name) Object.assign(into, fn(log)); };
  run('clouds', buildClouds, atlases);
  run('fx', buildFx, atlases);
  run('hero', buildHero, atlases);
  if (what === 'all' || what === 'atmos') {
    const a = buildAtmos(log);
    Object.assign(atlases, a.atlases); Object.assign(strips, a.strips);
  }
  run('strips', buildStrips, strips);
  if (what === 'manifest' && !Object.keys(atlases).length) {
    // `manifest` on its own has to re-derive from what is on disk, or it silently writes an
    // empty atlas.json over a good one -- which it did once, and verify.js happily reported
    // "0 errors" on it.
    const prev = fs.existsSync(path.join(OUT, 'atlas.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'atlas.json'))) : null;
    if (!prev || !Object.keys(prev.atlases || {}).length) {
      console.log('manifest: nothing built yet and no previous atlas.json to carry forward — run `all`');
      process.exit(1);
    }
  }
  if (what === 'all' || what === 'manifest') {
    // the paper tooth the renderer multiplies over everything, painted layers and code
    // actors alike -- ART.md §11's first defence against the two-games seam
    fs.copyFileSync(path.join(__dirname, 'paper_grain.png'), path.join(OUT, 'paper.png'));
    const prev = fs.existsSync(path.join(OUT, 'atlas.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'atlas.json'))) : {};
    buildManifest({ atlases: Object.keys(atlases).length ? atlases : prev.atlases, strips: Object.keys(strips).length ? strips : prev.strips }, log);
  }
}

module.exports = { cut, buildClouds, buildFx, buildHero, buildStrips, buildAtmos };
