#!/usr/bin/env node
// Stage a blind A/B pair for a critic agent.
// Ported from gms/2d/sunderfall/tools/blind.mjs, plus a round ledger.
//
//   node tools/blind.mjs <ours.png> <reference.png> <outdir> [label]
//   node tools/blind.mjs --round <n> <outdir> ours1.png ref1.png ours2.png ref2.png ...
//   node tools/blind.mjs --reveal <outdir>
//
// Copies both images into <outdir> as <label>_A.png / <label>_B.png with the side chosen at
// random, and writes the key to <outdir>/.key_<label> — which the critic is never pointed
// at. Prints only the two paths, so the orchestrator can paste them into a critic brief
// without leaking which is which.
//
// ART.md §9 and D10: three fresh critics per round, three shots, sides randomised, project
// preference withheld, never told which is ours, NEVER reused across rounds. The dot-file
// naming is not cosmetic — it keeps the key out of a `ls *.png` a critic might be shown.

import { copyFileSync, mkdirSync, appendFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const argv = process.argv.slice(2);

function pair(ours, ref, outdir, label) {
  mkdirSync(outdir, { recursive: true });
  const oursIsA = Math.random() < 0.5;
  copyFileSync(ours, `${outdir}/${label}_${oursIsA ? 'A' : 'B'}.png`);
  copyFileSync(ref, `${outdir}/${label}_${oursIsA ? 'B' : 'A'}.png`);
  appendFileSync(`${outdir}/.key_${label}`,
    `${label}: A=${oursIsA ? 'OURS' : 'REF'} B=${oursIsA ? 'REF' : 'OURS'}  (ours=${basename(ours)} ref=${basename(ref)})\n`);
  return { a: `${outdir}/${label}_A.png`, b: `${outdir}/${label}_B.png`, oursIsA };
}

if (argv[0] === '--reveal') {
  const dir = argv[1];
  for (const f of readdirSync(dir).filter(f => f.startsWith('.key_')).sort())
    process.stdout.write(readFileSync(`${dir}/${f}`, 'utf8'));
  process.exit(0);
}

if (argv[0] === '--round') {
  const n = argv[1], outdir = argv[2], files = argv.slice(3);
  if (files.length % 2) { console.error('--round needs pairs: ours ref ours ref ...'); process.exit(1); }
  const shots = [];
  for (let i = 0; i < files.length; i += 2) {
    const label = `r${n}s${i / 2 + 1}`;
    const p = pair(files[i], files[i + 1], outdir, label);
    shots.push(p);
    console.log(`shot ${i / 2 + 1}:  ${p.a}   ${p.b}`);
  }
  appendFileSync(`${outdir}/.round${n}`, `round ${n}: ${shots.length} shots, ${new Date().toISOString()}\n`);
  console.error(`round ${n} staged, ${shots.length} shots. Keys in ${outdir}/.key_r${n}s*`);
  process.exit(0);
}

const [ours, ref, outdir, label = 'pair'] = argv;
if (!ours || !ref || !outdir) {
  console.error('usage: blind.mjs <ours.png> <reference.png> <outdir> [label]');
  console.error('       blind.mjs --round <n> <outdir> ours ref [ours ref ...]');
  console.error('       blind.mjs --reveal <outdir>');
  process.exit(1);
}
if (!existsSync(ours) || !existsSync(ref)) { console.error('missing input'); process.exit(1); }
const p = pair(ours, ref, outdir, label);
console.log(p.a);
console.log(p.b);
console.error(`key -> ${outdir}/.key_${label}`);
