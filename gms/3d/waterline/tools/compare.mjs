#!/usr/bin/env node
// Builds a blind side-by-side sheet: our render and the reference plate, same size, side
// randomised. The answer key is written outside the critic's reading path — see
// ~/cc/yru/gms/3d/aaa_refs/naval/CRITIC_PROTOCOL.md. Hand the critic the sheet and nothing else.
//
//   node tools/compare.mjs --shot=bridge_table --round=1
//   node tools/compare.mjs --shot=hit_explode --round=2 --ref=1272010_06
//   node tools/compare.mjs --shot=match_cut --sheet=motion --round=1

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOLS, '..');
const PLATES = JSON.parse(readFileSync(resolve(TOOLS, 'plates.json'), 'utf8'));
// Reference plates live OUTSIDE the public repo — they are copyrighted press screenshots.
const REFS = resolve(ROOT, PLATES.refs || '../../../../gms/3d/aaa_refs/naval/refs');
const SHOTS = resolve(ROOT, 'shots');
const OUT = resolve(ROOT, 'critique');
const KEYS = resolve(ROOT, '.keys');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const shot = args.shot;
const round = args.round || 1;
if (!shot) { console.error('need --shot'); process.exit(1); }

mkdirSync(OUT, { recursive: true });
mkdirSync(KEYS, { recursive: true });

// Two images, 900×506 each, side randomised. This is the sheet the gate is scored on.
function pairSheet() {
  const meta = readMeta(shot);
  const refId = args.ref || PLATES.shots?.[shot] || meta.ref;
  if (!refId) { console.error(`no plate for ${shot} — add it to tools/plates.json or pass --ref=`); process.exit(1); }

  const plate = PLATES.plates?.[refId];
  if (!plate) { console.error(`${refId} is not in plates.json — add it, with a crop rect if it has UI`); process.exit(1); }
  if (PLATES.dropped?.[refId]) { console.error(`${refId} was dropped: ${PLATES.dropped[refId]}`); process.exit(1); }

  const refPath = resolve(REFS, plate.dir || 'clean', `${refId}.jpg`);
  const ourPath = resolve(SHOTS, `${shot}.png`);
  if (!existsSync(refPath)) { console.error(`missing reference plate ${refPath}`); process.exit(1); }
  if (!existsSync(ourPath)) { console.error(`missing render ${ourPath}`); process.exit(1); }

  const oursLeft = Math.random() < 0.5;
  const left = oursLeft ? ourPath : refPath;
  const right = oursLeft ? refPath : ourPath;
  const sheet = resolve(OUT, `${shot}_r${round}.png`);

  // A critic that can see the reference game's UI stops judging the render and starts reading the
  // HUD — FORGE's round 4 named a toolbar as its evidence on both sheets. Two kinds of crop:
  //   both:true  a UI trim, applied to BOTH images so the crop itself can't become the next tell
  //   both:false a reframe of a HUD-bordered plate, applied to the PLATE ONLY — and then the
  //              scenario's camera must be authored to match that framing, or the difference in
  //              field of view is the tell instead.
  // fit() scales-to-fill then centre-crops to 900×506. A crop rect whose aspect is far from 16:9
  // therefore loses edges that the rect was chosen to keep — silently, which is the worst way for
  // a reframe to be wrong. Say so; the rect belongs to plates.json's owner, not to this tool.
  if (plate.crop) {
    const a = (plate.crop[2] / plate.crop[3]) * (16 / 9);   // source is 16:9, so this is the rect's own aspect
    if (Math.abs(a - 900 / 506) > 0.12) {
      console.warn(`warn: ${refId} crop is ${a.toFixed(2)}:1, sheet cells are 1.78:1 — the fill crop will cut `
        + `${a > 1.78 ? 'the left and right' : 'the top and bottom'} off the rect you asked for`);
    }
  }

  const plateFilter = fit(cropExpr(plate.crop));
  const oursFilter = fit(plate.both ? cropExpr(plate.crop) : '');
  const lf = oursLeft ? oursFilter : plateFilter;
  const rf = oursLeft ? plateFilter : oursFilter;

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-i', left, '-i', right,
    '-filter_complex',
    `[0:v]${lf}[a];[1:v]${rf}[b];[a][b]hstack=inputs=2,pad=iw+24:ih+24:12:12:color=0x151719`,
    '-frames:v', '1', sheet]);

  writeFileSync(resolve(KEYS, `${shot}_r${round}.json`), JSON.stringify({
    shot, round, oursSide: oursLeft ? 'left' : 'right',
    ref: refId, plateUse: plate.use, crop: plate.crop || null, cropBoth: !!plate.both,
    stats: meta.stats,
  }, null, 2));

  console.log(sheet);
}

// For shots with no plate (match_cut) and for the window_out continuity read: our own frames
// tiled 3×2, scored on the rubric alone.
function motionSheet() {
  const frames = readdirSync(SHOTS)
    .filter(f => f.startsWith(`${shot}@`) && f.endsWith('.png'))
    .sort((a, b) => at(a) - at(b));
  if (frames.length < 2) { console.error(`need shots/${shot}@*.png — run shot.mjs --at=…`); process.exit(1); }

  const sheet = resolve(OUT, `${shot}_motion_r${round}.png`);
  const ins = frames.flatMap(f => ['-i', resolve(SHOTS, f)]);
  const parts = frames.map((_, i) => `[${i}:v]scale=600:338:force_original_aspect_ratio=increase,crop=600:338[f${i}]`);

  // hstack rows then vstack, not xstack: ffmpeg 8.1 silently placed only four of six tiles for a
  // `w0*2` layout expression, and a quietly dropped frame is worse than a loud failure.
  const rows = [];
  for (let i = 0; i < frames.length; i += 3) {
    const cells = frames.slice(i, i + 3).map((_, j) => `[f${i + j}]`);
    const tag = `[r${rows.length}]`;
    parts.push(cells.length > 1
      ? `${cells.join('')}hstack=inputs=${cells.length},pad=1800:338:0:0:color=0x151719${tag}`
      : `${cells[0]}pad=1800:338:0:0:color=0x151719${tag}`);
    rows.push(tag);
  }
  parts.push(`${rows.join('')}${rows.length > 1 ? `vstack=inputs=${rows.length},` : ''}pad=iw+24:ih+24:12:12:color=0x151719`);

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins,
    '-filter_complex', parts.join(';'), '-frames:v', '1', sheet]);

  writeFileSync(resolve(KEYS, `${shot}_motion_r${round}.json`),
    JSON.stringify({ shot, round, sheet: 'motion', frames, stats: readMeta(frames[0].replace(/\.png$/, '')).stats }, null, 2));

  console.log(sheet);
}

const at = f => +f.slice(f.indexOf('@') + 1, -4);

// crop=w:h:x:y in source fractions
const cropExpr = c => (c ? `crop=iw*${c[2]}:ih*${c[3]}:iw*${c[0]}:ih*${c[1]},` : '');
const fit = pre => `${pre}scale=900:506:force_original_aspect_ratio=increase,crop=900:506`;

function readMeta(id) {
  const p = resolve(SHOTS, `${id}.json`);
  if (!existsSync(p)) { console.error(`missing ${p} — run tools/shot.mjs first`); process.exit(1); }
  return JSON.parse(readFileSync(p, 'utf8'));
}

if (args.sheet === 'motion') motionSheet(); else pairSheet();
