#!/usr/bin/env node
// Stage a blind A/B pair for a critic agent.
//
//   node tools/blind.mjs <ours.png> <reference.png> <outdir> [label]
//
// Copies both images into <outdir> as <label>_A.png / <label>_B.png with the side
// chosen at random, and writes the key to <outdir>/.key_<label> — which the critic is
// never pointed at. Prints only the two paths, so the orchestrator can paste them into
// a critic brief without leaking which is which.

import { copyFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { basename } from 'node:path';

const [ours, ref, outdir, label = 'pair'] = process.argv.slice(2);
if (!ours || !ref || !outdir) {
  console.error('usage: blind.mjs <ours.png> <reference.png> <outdir> [label]');
  process.exit(1);
}

mkdirSync(outdir, { recursive: true });
const oursIsA = Math.random() < 0.5;
copyFileSync(ours, `${outdir}/${label}_${oursIsA ? 'A' : 'B'}.png`);
copyFileSync(ref, `${outdir}/${label}_${oursIsA ? 'B' : 'A'}.png`);
appendFileSync(`${outdir}/.key_${label}`,
  `${label}: A=${oursIsA ? 'OURS' : 'REF'} B=${oursIsA ? 'REF' : 'OURS'}  (ours=${basename(ours)} ref=${basename(ref)})\n`);

console.log(`${outdir}/${label}_A.png`);
console.log(`${outdir}/${label}_B.png`);
console.error(`key -> ${outdir}/.key_${label}`);
