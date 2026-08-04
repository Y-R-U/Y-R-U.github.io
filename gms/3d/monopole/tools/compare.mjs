#!/usr/bin/env node
// Builds a blind side-by-side sheet: our render and the reference plate, same size,
// side randomised. The answer key is written outside the critic's reading path.
//
//   node tools/compare.mjs --shot=nebula_back --round=1 --ref=244160_17c

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Reference plates live OUTSIDE the public repo — they are copyrighted press screenshots.
const REFS = resolve(ROOT, '../../../../gms/3d/aaa_refs/space/refs/clean');
const OUT = resolve(ROOT, 'critique');
const KEYS = resolve(ROOT, '.keys');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const shot = args.shot;
const round = args.round || 1;
if (!shot) { console.error('need --shot'); process.exit(1); }

const meta = JSON.parse(readFileSync(resolve(ROOT, `shots/${shot}.json`), 'utf8'));
const refId = args.ref || meta.ref;
if (!refId) { console.error('no ref recorded for this shot — pass --ref=<plateId>'); process.exit(1); }
const refPath = resolve(REFS, `${refId}.jpg`);
const ourPath = resolve(ROOT, `shots/${shot}.png`);

if (!existsSync(refPath)) { console.error(`missing reference plate ${refPath}`); process.exit(1); }
if (!existsSync(ourPath)) { console.error(`missing render ${ourPath}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
mkdirSync(KEYS, { recursive: true });

const oursLeft = Math.random() < 0.5;
const left = oursLeft ? ourPath : refPath;
const right = oursLeft ? refPath : ourPath;
const sheet = resolve(OUT, `${shot}_r${round}.png`);

// A critic that can see the reference game's UI stops judging the render and starts reading the
// HUD. The four Homeworld Remastered `…c` plates already have their logo band cut off; anything
// else that needs a band removed gets it cut off BOTH images so the crop is not the next tell.
const TRIM = {};
const cut = TRIM[refId] || 0;
const prep = (cut ? `crop=iw:ih*${(1 - cut).toFixed(3)}:0:0,` : '')
  + 'scale=900:506:force_original_aspect_ratio=increase,crop=900:506';

execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
  '-i', left, '-i', right,
  '-filter_complex',
  `[0:v]${prep}[a];[1:v]${prep}[b];[a][b]hstack=inputs=2,pad=iw+24:ih+24:12:12:color=0x0b0e14`,
  '-frames:v', '1', sheet]);

writeFileSync(resolve(KEYS, `${shot}_r${round}.json`),
  JSON.stringify({ shot, round, oursSide: oursLeft ? 'left' : 'right', ref: refId, stats: meta.stats }, null, 2));

console.log(sheet);
