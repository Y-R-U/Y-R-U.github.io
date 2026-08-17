#!/usr/bin/env node
// Builds a blind side-by-side sheet: our render and the reference plate, same size, side
// randomised. The answer key is written OUTSIDE the repo.
//
//   node tools/compare.mjs --shot=fog_city --round=1
//   node tools/compare.mjs --shot=fog_city --round=4 --calib
//   node tools/compare.mjs --shot=day_smog --round=1 --ref=1091500_08
//
// §12.4.1 — the nine tells and how each is closed:
//  1 filename        sheet is critique/sheet_<8-hex>.png, hex from crypto, unrelated to shot/round
//  2 key location    ~/.cache/neonhaul-keys/, outside the repo; `ls` in the repo finds nothing
//  3 compression     our half is JPEG q88'd BEFORE the shared chain; matched grain on both halves
//  4 ordering        side seeded from crypto.randomBytes and balanced 50/50 per shot
//  5 metadata        -map_metadata -1 -fflags +bitexact
//  6 resampling      render must be >= 900x506 so both halves are always downsampled
//  7 colour profile  both forced to bt709, no ICC carried through
//  8 padding         aspects asserted equal; nothing is ever letterboxed
//  9 prompt          the critic is handed the sheet path and CRITIC_PROTOCOL.md, nothing else
//
// Deviation from the plan, deliberately: the finished sheet is PNG, not JPEG q88. Both halves
// already carry identical JPEG generation history from step 3, so a second shared encode adds
// nothing and a PNG container cannot introduce a per-half difference. --jpg restores the literal
// form if a round wants it.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Copyrighted press screenshots. They live outside site/, are never copied in, never committed,
// never shipped.
const REFS = resolve(ROOT, '../../../../gms/3d/aaa_refs/cyber/refs/board');
const OUT = resolve(ROOT, 'critique');
const KEYS = resolve(homedir(), '.cache/neonhaul-keys');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, '');
  const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const shot = args.shot;
const round = args.round === undefined ? 1 : +args.round;
const calib = !!args.calib;
if (!shot) die('need --shot');

// §12.1 — our crop rects, applied to the plate, as [x0, y0, x1, y1].
//
// P3b re-derived these rather than inheriting them, because DECISIONS T1's audit recorded a
// DIFFERENT rect for both of these plates in plates.json and the two sets are not
// interchangeable. Both were rendered and looked at (the standing lesson), and here is what is in
// each:
//
//   1475810_04  T1's [0.65,0.45,0.35,0.35] (x,y,w,h) → 420x236 of defocused wet tarmac. It clears
//               the man and the dog, and it also clears every reflection worth scoring.
//               §12.1's rect keeps the posts, the railing and the doubled sign colour, and has no
//               figure in it either. §12.1 wins.
//   1091500_08  T1's [0.0,0.04,0.40,0.40] → 480x270 of one tower edge against blank sky. Nothing
//               to score at all. §12.1's rect keeps the blown sky, the silhouetted tower with its
//               rust/teal panels, the haze band AND a flying craft — and, checked at full
//               resolution, no figure. §12.1 wins.
//
// The reconciliation: plates.json's rects were authored for the BOARD, where the job is "remove
// the person"; §12.1's were authored for SCORING, where the job is "remove the person and keep
// the thing the plate is cited for". compare.mjs's own header already said ours win where both
// exist — that is still the rule, and this is the case that proves why.
const CROP = {
  wet_street: [0.00, 0.30, 0.44, 1.00],   // 528x472 of 1200x675 → aspect 1.119
  day_smog:   [0.63, 0.00, 1.00, 0.78],   // 444x526             → aspect 0.844
};

// Obligation T4 recorded these two aspects as 0.63 and 0.84. 0.84 is right; 0.63 is the crop's
// own w/h fractions (0.44 / 0.70) rather than an aspect — the source is 16:9, so the real number
// is 0.44*1200 / 0.70*675 = 1.119. The shot cameras are authored at the MEASURED aspects.

// Fraction cut off the TOP of BOTH halves, to remove the source game's HUD. A visible third-party
// HUD identifies the real game instantly and voids the round.
//   audited: true  → someone opened the plate at full resolution and checked
const TRIM = {
  '746850_02':  { top: 0.12, audited: true,  why: 'Cloudpunk mission card across the top band' },
  '746850_01':  { top: 0.00, audited: true,  why: 'clean aerial, no HUD' },
  '746850_03':  { top: 0.00, audited: true,  why: 'a mouse cursor near the ARCADE sign, lower right — removed by CONTAM below' },
  '1939970_00': { top: 0.00, audited: true,  why: 'clean — no HUD, no watermark, no cursor' },
  '1475810_04': { top: 0.00, audited: true,  why: 'clean of HUD; the man + dog are removed by §12.1\'s scoring crop' },
  '1091500_08': { top: 0.00, audited: true,  why: 'clean of HUD; the figure is removed by §12.1\'s scoring crop' },
  '1488490_00': { top: 0.00, audited: true,  why: 'clean — not scored, kept for the density reference' },
};

// Contamination rects from plates.json's audit (DECISIONS T1), applied only where §12.1 has no
// scoring crop of its own. `746850_03` is the one that matters: a mouse cursor sits by the ARCADE
// sign in the lower right, and a cursor in one half of a blind sheet is an identification, not a
// blemish.
const CONTAM = {
  '746850_03': [0.00, 0.00, 0.88, 0.88],
};

// The sheet's half size is derived from the PLATE CROP'S OWN ASPECT, long side 900. A fixed
// 900x506 half forces `scale=...:increase, crop=900:506` to cut a letterbox strip out of a
// portrait crop — which mangles the composition of both halves equally and then scores the
// wreckage. §12.1 authors two shots at non-16:9 aspects on purpose (obligation T4); this is what
// makes that mean something.
const LONG = 900;

const defPath = resolve(ROOT, `shots/${shot}.json`);
if (!existsSync(defPath)) die(`no scenario definition at shots/${shot}.json`);
const def = JSON.parse(readFileSync(defPath, 'utf8'));

const refId = args.ref || def.ref;
if (!refId) die('no ref recorded for this shot — pass --ref=<plateId>');
const refPath = resolve(REFS, `${refId}.jpg`);
if (!existsSync(refPath)) die(`missing reference plate ${refPath}`);

const trim = TRIM[refId] || { top: 0, audited: false, why: 'UNAUDITED — no TRIM entry at all' };
if (!trim.audited) console.warn(`⚠ plate ${refId} is not HUD-audited (${trim.why}). Look at the sheet before scoring it.`);

const crop = CROP[shot] || CONTAM[refId] || null;

// Half size, from the plate crop's aspect (long side 900).
const pz0 = probe(refPath);
const cw = pz0.w * (crop ? crop[2] - crop[0] : 1);
const ch = pz0.h * (crop ? crop[3] - crop[1] : 1) * (1 - trim.top);
const plateAspect = cw / ch;
const SHEET_W = plateAspect >= 1 ? LONG : Math.round(LONG * plateAspect);
const SHEET_H = plateAspect >= 1 ? Math.round(LONG / plateAspect) : LONG;

// T1's known gap, generalised. `day_smog`'s crop is 444 px of a 1200-wide plate — it arrives at
// the sheet UPSCALED, while our render is crisp at native resolution, and resolution itself then
// becomes the tell. So whenever the cropped plate is smaller than the sheet half, OUR half is
// first downscaled to the plate's exact cropped size and the shared tail upscales both by the
// same factor from the same number of pixels. Run on every plate, not just the one that was
// noticed: `wet_street` is 528 px and needed it too.
const PRE = (cw < SHEET_W) ? { w: Math.round(cw), h: Math.round(ch) } : null;

mkdirSync(OUT, { recursive: true });
mkdirSync(KEYS, { recursive: true });

const TMP = resolve(tmpdir(), `nh-cmp-${process.pid}`);
mkdirSync(TMP, { recursive: true });

// ── helpers ────────────────────────────────────────────────────────────────

function die(m) { console.error(m); process.exit(1); }
function ff(a) { return execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { encoding: 'utf8' }); }
function probe(p) {
  const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim();
  const [w, h] = o.split(',').map(Number);
  return { w, h };
}
// Mean luma of a prepared half. A half with no noise floor sits at 0 where the other does not,
// which is the same tell as (3) wearing a different hat.
function luma(p) {
  // ffmpeg writes the metadata filter's output to stderr, not stdout.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-i', p,
    '-vf', 'signalstats,metadata=print', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  const g = k => { const m = out.match(new RegExp(`lavfi\\.signalstats\\.${k}=([-\\d.]+)`)); return m ? +m[1] : NaN; };
  return { YAVG: g('YAVG'), YMIN: g('YMIN'), YMAX: g('YMAX') };
}
const cropExpr = c => `crop=iw*${(c[2] - c[0]).toFixed(6)}:ih*${(c[3] - c[1]).toFixed(6)}:iw*${c[0].toFixed(6)}:ih*${c[1].toFixed(6)}`;
const trimExpr = t => (t > 0 ? `crop=iw:ih*${(1 - t).toFixed(4)}:0:0` : null);

// The shared tail. Everything below this line is byte-identical between the two halves, so
// neither the codec nor the resampler can become a tell.
const TAIL = `scale=${SHEET_W}:${SHEET_H}:force_original_aspect_ratio=increase,crop=${SHEET_W}:${SHEET_H},noise=alls=4:allf=t+u`;

const COLOUR = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
const CLEAN = ['-map_metadata', '-1', '-fflags', '+bitexact'];

// Writes a prepared half: pre-filters, then the shared tail, as an intermediate PNG.
function prepare(src, pre, dst, extra = []) {
  const chain = [...pre.filter(Boolean), TAIL].join(',');
  ff(['-i', src, '-vf', chain, ...extra, '-frames:v', '1', ...CLEAN, ...COLOUR, '-pix_fmt', 'rgb24', dst]);
  return dst;
}

// ── build the two halves ───────────────────────────────────────────────────

const key = { sheet: null, shot, round, calib, ref: refId, crop, trim: trim.top,
  half: [SHEET_W, SHEET_H], plateCrop: [Math.round(cw), Math.round(ch)], preScale: PRE,
  oursSide: null, stats: null, halves: {} };
let aPath, bPath, aLabel, bLabel;

if (calib) {
  // §12.4 — never the identical file on both sides. A critic that notices the halves are
  // pixel-identical scores them identically by inspection and the check measures nothing.
  const base = crop || [0, 0, 1, 1];
  const jitterSide = randomBytes(1)[0] & 1 ? 'left' : 'right';
  // a 1.5% pan + a ±2% exposure jitter: different pictures of the same plate, same content.
  const panned = [base[0] + (base[2] - base[0]) * 0.015, base[1], base[2], base[3] - (base[3] - base[1]) * 0.015];

  const jpgL = resolve(TMP, 'cal_l.jpg'), jpgR = resolve(TMP, 'cal_r.jpg');
  ff(['-i', refPath, '-frames:v', '1', '-q:v', '3', ...CLEAN, ...COLOUR, '-pix_fmt', 'yuvj420p', jpgL]);
  ff(['-i', refPath, '-frames:v', '1', '-q:v', '3', ...CLEAN, ...COLOUR, '-pix_fmt', 'yuvj420p', jpgR]);

  const exp = 'eq=brightness=0.02:contrast=1.0';
  aPath = prepare(jpgL, [cropExpr(base), trimExpr(trim.top), jitterSide === 'left' ? exp : null], resolve(TMP, 'a.png'));
  bPath = prepare(jpgR, [cropExpr(panned), trimExpr(trim.top), jitterSide === 'right' ? exp : null], resolve(TMP, 'b.png'));
  aLabel = 'calib-A'; bLabel = 'calib-B';
  key.oursSide = 'none';
  key.calibJitter = jitterSide;

} else {
  const ourPng = resolve(ROOT, `shots/${shot}.png`);
  if (!existsSync(ourPng)) die(`missing render ${ourPng} — run tools/shot.mjs --shot=${shot} --w=1600 --h=900 first`);

  // (6) an upscaled half is softer than a downscaled one, and that is visible.
  const oz = probe(ourPng);
  if (oz.w < SHEET_W || oz.h < SHEET_H) {
    die(`render is ${oz.w}x${oz.h}; compare.mjs needs at least ${SHEET_W}x${SHEET_H} for this shot. `
      + `Re-run: node tools/shot.mjs --shot=${shot} --w=${SHEET_W * 2} --h=${Math.round(SHEET_W * 2 / plateAspect)}`);
  }

  // (8) aspects must already match — nothing is ever letterboxed to fit.
  // The TRIM cancels — it is applied to both halves by the same factor — so compare pre-trim.
  const ourAspect = oz.w / oz.h;
  const err = Math.abs(ourAspect - plateAspect) / plateAspect;
  if (err > 0.06 && !args.anyaspect) {
    const wantH = Math.round(oz.w / plateAspect);
    die(`aspect mismatch: render ${ourAspect.toFixed(3)} vs plate-after-crop ${plateAspect.toFixed(3)} (${(err * 100).toFixed(1)}%).\n`
      + `  Author the shot at the crop's aspect (§12.1): node tools/shot.mjs --shot=${shot} --w=${oz.w} --h=${wantH}\n`
      + `  --anyaspect overrides, but a padded or squeezed half is tell #8.`);
  }

  // (3) our half is a mathematically clean PNG; the plate is a press JPEG. Put ours through one
  // JPEG generation FIRST so the artefact floors match before anything shared happens.
  const ourJpg = resolve(TMP, 'ours.jpg');
  ff(['-i', ourPng, '-frames:v', '1', '-q:v', '3', ...CLEAN, ...COLOUR, '-pix_fmt', 'yuvj420p', ourJpg]);

  // T1's resolution match, applied to our half only — the plate is already at this size.
  const preScale = PRE ? `scale=${PRE.w}:${PRE.h}` : null;
  if (PRE) console.error(`resolution match: our half pre-scaled to ${PRE.w}x${PRE.h} (the plate's cropped size) `
    + `before the shared ${SHEET_W}x${SHEET_H} upscale, so neither half is sharper than the other`);
  const oursPrep = prepare(ourJpg, [trimExpr(trim.top), preScale], resolve(TMP, 'ours_prep.png'));
  const refPrep = prepare(refPath, [crop ? cropExpr(crop) : null, trimExpr(trim.top)], resolve(TMP, 'ref_prep.png'));

  // (4) crypto-seeded, and balanced per shot so a critic scoring many rounds cannot learn a bias.
  const prev = readdirSync(KEYS).filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(readFileSync(resolve(KEYS, f), 'utf8')); } catch { return null; } })
    .filter(k => k && k.shot === shot && !k.calib);
  const lefts = prev.filter(k => k.oursSide === 'left').length;
  const rights = prev.length - lefts;
  const oursLeft = lefts === rights ? !!(randomBytes(1)[0] & 1) : lefts < rights;

  aPath = oursLeft ? oursPrep : refPrep;
  bPath = oursLeft ? refPrep : oursPrep;
  aLabel = oursLeft ? 'ours' : 'ref';
  bLabel = oursLeft ? 'ref' : 'ours';
  key.oursSide = oursLeft ? 'left' : 'right';

  const statsPath = resolve(ROOT, `shots/${shot}.stats.json`);
  if (existsSync(statsPath)) key.stats = JSON.parse(readFileSync(statsPath, 'utf8'));
}

// (3b) neither half may have a dead noise floor where the other has grain.
const la = luma(aPath), lb = luma(bPath);
key.halves = { left: { label: aLabel, ...la }, right: { label: bLabel, ...lb } };
for (const [side, l] of [['left', la], ['right', lb]]) {
  if (!(l.YAVG > 0.3)) die(`${side} half has no noise floor (YAVG=${l.YAVG}) — the grain filter did not apply, which is tell #3`);
}

// ── stack ──────────────────────────────────────────────────────────────────

const hex = randomBytes(4).toString('hex');           // (1) unrelated to shot or round
const ext = args.jpg ? 'jpg' : 'png';
const sheet = resolve(OUT, `sheet_${hex}.${ext}`);
const enc = args.jpg ? ['-q:v', '3', '-pix_fmt', 'yuvj420p'] : ['-pix_fmt', 'rgb24'];

ff(['-i', aPath, '-i', bPath, '-filter_complex',
  '[0:v][1:v]hstack=inputs=2,pad=iw+24:ih+24:12:12:color=0x0b0d12',
  '-frames:v', '1', ...CLEAN, ...COLOUR, ...enc, sheet]);

key.sheet = sheet;
writeFileSync(resolve(KEYS, `${hex}.json`), JSON.stringify(key, null, 2) + '\n');
rmSync(TMP, { recursive: true, force: true });

console.log(sheet);
console.error(`key → ${resolve(KEYS, hex + '.json')}   (outside the repo; never show this to a critic)`);
