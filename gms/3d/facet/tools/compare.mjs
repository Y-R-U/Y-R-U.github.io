#!/usr/bin/env node
// Builds a blind side-by-side sheet: our render and a reference plate, same size, side randomised.
// The answer key is written outside the critic's reading path.
//
//   node tools/compare.mjs --shot=village_day --round=1
//   node tools/compare.mjs --shot=woods_autumn --ref=lp_12_faceted-forest-slab --round=2

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Reference plates live OUTSIDE the public repo — they are copyrighted portfolio renders.
const REFS = resolve(ROOT, '../../../../gms/3d/aaa_refs/refs/lowpoly');
const OUT = resolve(ROOT, 'critique');
const KEYS = resolve(ROOT, '.keys');

// Which plate each scenario is answerable against. Matched on subject and light, not just style —
// judging a dusk shoreline against a midday forest tells you nothing useful.
const PLATES = {
  village_day: 'lp_01_iso-snow-village',
  island_wide: 'lp_11_forest-river-diorama',
  shore_dusk: 'lp_17_dock-sunset-hero',
  woods_autumn: 'lp_12_faceted-forest-slab',
  craft_macro: 'lp_09_windmill-hut-diorama',
  frost_ridge: 'lp_10_arctic-diorama',
};

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const shot = args.shot;
if (!shot) { console.error('need --shot'); process.exit(1); }

const refId = args.ref || PLATES[shot];
if (!refId) { console.error(`no plate mapped for ${shot} — pass --ref=<plateId>`); process.exit(1); }

const refPath = resolve(REFS, `${refId}.jpg`);
const ourPath = resolve(ROOT, args.png || `shots/${shot}.png`);
if (!existsSync(refPath)) { console.error(`missing plate ${refPath}`); process.exit(1); }
if (!existsSync(ourPath)) { console.error(`missing render ${ourPath}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
mkdirSync(KEYS, { recursive: true });

const round = args.round || 1;
const oursLeft = Math.random() < 0.5;
const sheet = resolve(OUT, `${shot}_r${round}.png`);
const prep = 'scale=900:640:force_original_aspect_ratio=increase,crop=900:640';

execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
  '-i', oursLeft ? ourPath : refPath, '-i', oursLeft ? refPath : ourPath,
  '-filter_complex',
  `[0:v]${prep}[a];[1:v]${prep}[b];[a][b]hstack=inputs=2,pad=iw+24:ih+24:12:12:color=0x151719`,
  '-frames:v', '1', sheet]);

const meta = existsSync(ourPath.replace(/\.png$/, '.json'))
  ? JSON.parse(readFileSync(ourPath.replace(/\.png$/, '.json'), 'utf8')) : {};
writeFileSync(resolve(KEYS, `${shot}_r${round}.json`),
  JSON.stringify({ shot, round, oursSide: oursLeft ? 'left' : 'right', ref: refId, stats: meta.stats }, null, 2));

console.log(sheet);
