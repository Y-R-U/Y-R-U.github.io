// verify.js — gates A1, A2 and A3 against what is actually on disk.
//
//   node art/tools/verify.js [--sheet]
//
// Ported in structure from gms/2d/sunderfall/art/tools/verify.js; every assertion is
// rewritten, because Sunderfall's manifest describes destructible materials and terrain runs
// and KITEHAWK's describes sky atlases and tiling strips. Nothing about the shape of that
// file was applicable.
//
// A2's last clause is the important one and it is ART.md §7 bake step 6's own rule: the
// verifier "dumps a contact sheet that a human looks at". An automated pass is not a look —
// ATLAS_SKY §5 has the case that proves it, where `keycheck.py` cleanly missed a die-cut
// sticker border because the border was inset from the frame edge rather than touching it.
const fs = require('fs');
const path = require('path');
const { Img, readPNG, readImage, writePNG, resize, composite } = require('./img.js');
const { checkJoins } = require('./tile.js');
const { p90Luma, stats } = require('./levels.js');

const ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const CEILING = 12, TARGET = 11;

const errors = [], warn = [], note = [];

if (!fs.existsSync(path.join(ASSETS, 'atlas.json'))) {
  console.log('ERROR: no assets/atlas.json — run `node art/tools/build.js all` first');
  process.exit(1);
}
const man = JSON.parse(fs.readFileSync(path.join(ASSETS, 'atlas.json')));

/* ---- A2: atlas hygiene ------------------------------------------------------ */
let frameCount = 0;
for (const [name, a] of Object.entries(man.atlases || {})) {
  const p = path.join(ASSETS, a.image);
  if (!fs.existsSync(p)) { errors.push(`atlas ${name}: missing ${a.image}`); continue; }
  const im = readImage(p);
  if (im.w !== a.w || im.h !== a.h) errors.push(`atlas ${name}: declared ${a.w}x${a.h}, file is ${im.w}x${im.h}`);
  if (im.w > 2048 || im.h > 2048) errors.push(`atlas ${name}: ${im.w}x${im.h} exceeds 2048`);
  const ids = Object.keys(a.frames);
  if (!ids.length) errors.push(`atlas ${name}: no frames`);
  for (const [id, f] of Object.entries(a.frames)) {
    frameCount++;
    if (f.x < 0 || f.y < 0 || f.x + f.w > im.w || f.y + f.h > im.h)
      errors.push(`frame ${name}/${id} out of bounds`);
    // "no fully-transparent entry" — the failure mode that silently ships an empty slot
    let any = 0;
    for (let y = f.y; y < f.y + f.h && !any; y++)
      for (let x = f.x; x < f.x + f.w; x++)
        if (im.data[(y * im.w + x) * 4 + 3] > 8) { any = 1; break; }
    if (!any) errors.push(`frame ${name}/${id} is fully transparent`);
  }
}

/* ---- A3: tiling -------------------------------------------------------------- */
const joins = [];
for (const [id, s] of Object.entries(man.strips || {})) {
  const p = path.join(ASSETS, s.image);
  if (!fs.existsSync(p)) { errors.push(`strip ${id}: missing ${s.image}`); continue; }
  const im = readPNG(p);
  if (im.w !== s.w || im.h !== s.h) errors.push(`strip ${id}: declared ${s.w}x${s.h}, file is ${im.w}x${im.h}`);
  const j = checkJoins(im);
  joins.push({ id, ...j });
  if (!j.pass) errors.push(`strip ${id}: seam excess ${j.excess.toFixed(2)}/255 over its own neighbourhood (local ${j.near.toFixed(2)})`);
}
// A/B pairing: a lone variant means the layer repeats at 4096 wu instead of 8192
const bases = new Set(Object.keys(man.strips || {}).map(k => k.replace(/_(a|b)$/, '')));
for (const b of bases)
  if (!man.strips[b + '_a'] || !man.strips[b + '_b'])
    errors.push(`strip ${b}: only one variant — the A/B alternation needs both or the period halves`);

/* ---- A6: near layers go near-black ------------------------------------------ */
// A6 is a property of the ART, so it is measured on the shipped atlas rather than in the
// framebuffer, and this is a correction rather than a convenience.
//
// The browser version measured the framebuffer after post-processing, thresholding at
// L > 0.002 to pick out "everything drawn". That threshold admits the post-process grain
// and vignette, which cover the WHOLE frame, so the population was 21% of all pixels and
// its 90th percentile was the noise floor, not the paint. It read 0.0675 and did not move
// by a single digit when the layer's mul was set to [1,1,1], its shade to 0, or the crush
// pass undone -- a criterion that cannot fail. Same shape as D43's mean-RMS finding.
//
// Here the population is exactly the opaque pixels of the FG_OCCLUDE frames, times the
// layer's own multiply, which is all the renderer does to them (FG_OCCLUDE is deliberately
// left at rampAmt 0 -- see sky.js).
// Read from js/gfx/sky.js rather than duplicated here. The duplicate drifted once -- the
// renderer moved to 0.20 and this gate went on measuring 0.55, so A6 was scoring a frame the
// game does not draw. It was conservative, so nothing failed and nothing noticed. A gate that
// keeps its own copy of a renderer constant is measuring its own copy.
const FG_MUL = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'gfx', 'sky.js'), 'utf8');
  const m = /FG_OCCLUDE_MUL\s*=\s*\[([^\]]+)\]/.exec(src);
  if (!m) {
    console.log('ERROR: cannot find FG_OCCLUDE_MUL in js/gfx/sky.js -- A6 cannot be measured');
    process.exit(1);
  }
  return m[1].split(',').map(Number);
})();
let a6 = null;
if (man.atlases && man.atlases.fg) {
  const im = readPNG(path.join(ASSETS, man.atlases.fg.image));
  const v = [], vArt = [];
  for (const f of Object.values(man.atlases.fg.frames))
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) {
        const i = (y * im.w + x) * 4;
        if (im.data[i + 3] < 200) continue;
        v.push((im.data[i] * FG_MUL[0] * 0.2126 + im.data[i + 1] * FG_MUL[1] * 0.7152
          + im.data[i + 2] * FG_MUL[2] * 0.0722) / 255);
        // the ART's own luminance, before the layer multiply. Both are required below 0.12:
        // with the multiply alone at 0.20-0.28 the drawn figure passes whatever the atlas
        // contains, so measuring only that turns A6 into a test of the layer config.
        vArt.push((im.data[i] * 0.2126 + im.data[i + 1] * 0.7152 + im.data[i + 2] * 0.0722) / 255);
      }
  v.sort((p, q) => p - q);
  vArt.sort((p, q) => p - q);
  a6 = { n: v.length, p50: v[v.length >> 1], p90: v[Math.round(0.9 * (v.length - 1))], max: v[v.length - 1],
    artP90: vArt[Math.round(0.9 * (vArt.length - 1))],
    gain: man.atlases.fg.crushGain };
  // D66: the unnamed 0.12-0.18 band is closed at 0.12. Pass below, fail at or above. The
  // broken control lands at 0.146, so any threshold above that would let it through.
  if (a6.p90 >= 0.12) errors.push(`A6: FG_OCCLUDE drawn p90 ${a6.p90.toFixed(4)} is at or above the 0.12 line`);
  if (a6.artP90 >= 0.12) errors.push(`A6: FG_OCCLUDE art p90 ${a6.artP90.toFixed(4)} is at or above the 0.12 line`);
} else warn.push('A6: no FG_OCCLUDE atlas to measure');

/* ---- A1: payload ------------------------------------------------------------- */
let bytes = 0;
const byDir = {};
(function walk(d, top) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, top || f.name);
    else { const n = fs.statSync(p).size; bytes += n; byDir[top || '.'] = (byDir[top || '.'] || 0) + n; }
  }
})(ASSETS, null);
const mb = bytes / 1048576;
if (mb > CEILING) errors.push(`payload ${mb.toFixed(2)} MB exceeds the ${CEILING} MB hard ceiling`);
else if (mb > TARGET) warn.push(`payload ${mb.toFixed(2)} MB is over the ${TARGET} MB target but inside the ${CEILING} MB ceiling`);

/* ---- the contact sheet a human has to look at -------------------------------- */
if (process.argv.includes('--sheet') || true) {
  const cells = [];
  for (const [name, a] of Object.entries(man.atlases || {})) {
    const im = readPNG(path.join(ASSETS, a.image));
    for (const [id, f] of Object.entries(a.frames)) {
      const c = new Img(f.w, f.h);
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++) {
          const s = ((f.y + y) * im.w + f.x + x) * 4, d = (y * f.w + x) * 4;
          c.data[d] = im.data[s]; c.data[d + 1] = im.data[s + 1];
          c.data[d + 2] = im.data[s + 2]; c.data[d + 3] = im.data[s + 3];
        }
      cells.push({ id: `${name}/${id}`, img: c });
    }
  }
  for (const [id, s] of Object.entries(man.strips || {})) cells.push({ id, img: readPNG(path.join(ASSETS, s.image)) });
  const CELL = 150, COLS = 12;
  const rows = Math.ceil(cells.length / COLS);
  const sheet = new Img(COLS * CELL, rows * CELL);
  // mid grey, so a stray white halo and a stray black speck are both visible
  for (let i = 0; i < sheet.w * sheet.h; i++) {
    sheet.data[i * 4] = 118; sheet.data[i * 4 + 1] = 120; sheet.data[i * 4 + 2] = 124; sheet.data[i * 4 + 3] = 255;
  }
  cells.forEach((c, i) => {
    const k = Math.max(c.img.w, c.img.h) / (CELL - 8);
    const w = Math.max(1, Math.round(c.img.w / k)), h = Math.max(1, Math.round(c.img.h / k));
    composite(sheet, resize(c.img, w, h), (i % COLS) * CELL + (CELL - w) / 2 | 0, ((i / COLS) | 0) * CELL + (CELL - h) / 2 | 0);
  });
  fs.mkdirSync(path.join(ROOT, 'shots', 'p3'), { recursive: true });
  writePNG(path.join(ROOT, 'shots', 'p3', 'contact.png'), sheet, { forceAlpha: false });
  note.push(`contact sheet -> shots/p3/contact.png (${cells.length} entries) — LOOK AT IT, an automated pass is not a look`);
}

/* ---- report ------------------------------------------------------------------ */
console.log(`atlases ${Object.keys(man.atlases || {}).length}, frames ${frameCount}, strips ${Object.keys(man.strips || {}).length}`);
for (const [d, n] of Object.entries(byDir).sort((a, b) => b[1] - a[1]))
  console.log(`  ${d.padEnd(10)} ${(n / 1048576).toFixed(2)} MB`);
console.log(`A1 payload   ${mb.toFixed(2)} MB   target ${TARGET}, ceiling ${CEILING}   ${mb <= CEILING ? 'PASS' : 'FAIL'}`);
console.log(`A2 hygiene   ${errors.filter(e => e.includes('atlas') || e.includes('frame')).length} problems`);
if (a6) {
  console.log(`A6 near-black FG_OCCLUDE  art p90 ${a6.artP90.toFixed(4)}   drawn p90 ${a6.p90.toFixed(4)} (mul ${FG_MUL.join('/')})   over ${a6.n} opaque px   ` +
    `${a6.p90 < 0.12 && a6.artP90 < 0.12 ? 'PASS' : 'FAIL'} (D66: both fail at or above 0.12)`);
  if (process.argv.includes('--falsify') && a6.gain) {
    // undo the crush and require the number to go red. Without this the criterion is a
    // claim, not a measurement.
    // The success condition is "leaves the PASS band", not "crosses the FAIL line". A6's
    // table has a gap: PASS below 0.12, FAIL above 0.18, and nothing named in between. The
    // un-crushed plates land at 0.146, squarely in that gap -- so the criterion does respond
    // to the pass it exists to test, and it also cannot be made to say FAIL by removing that
    // pass. Reported rather than adjusted; the gap is the manager's to close.
    // The control is applied to the ART figure. Applied to the drawn figure it stopped
    // biting the moment the layer multiply was darkened to 0.20-0.28 for the act-1 repair:
    // un-crushed art still came out at 0.0554, so A6 would have passed with the pass it
    // exists to test switched off. The multiply is a rendering choice; the art is what A6
    // is about.
    const k = 1 / a6.gain;
    const c = a6.artP90 * k;
    console.log(`   control: crush pass undone (x${k.toFixed(2)}) -> art p90 ${c.toFixed(4)}   ` +
      `${c >= 0.12 ? 'went RED, as required' : 'STAYED GREEN -- the criterion does not catch its own bug'}`);
  }
}
if (joins.length) {
  const worst = joins.reduce((a, b) => (b.excess > a.excess ? b : a));
  console.log(`A3 tiling    worst seam excess ${worst.excess.toFixed(2)}/255 (${worst.id}), mean ${(joins.reduce((a, b) => a + b.excess, 0) / joins.length).toFixed(2)}   ` +
    `${joins.every(j => j.pass) ? 'PASS' : 'FAIL'}`);
  console.log(`             raw join MAD ${(joins.reduce((a, b) => a + b.join, 0) / joins.length).toFixed(2)}/255 against the strips' own ` +
    `${(joins.reduce((a, b) => a + b.body, 0) / joins.length).toFixed(2)}/255 adjacent-column baseline — see P3_NOTES §5 on why the absolute 2/255 wording does not measure tiling`);
}
note.forEach(n => console.log('note: ' + n));
warn.forEach(w => console.log('warn: ' + w));
errors.forEach(e => console.log('ERROR: ' + e));
console.log(`${errors.length} errors, ${warn.length} warnings`);
process.exit(errors.length ? 1 : 0);
