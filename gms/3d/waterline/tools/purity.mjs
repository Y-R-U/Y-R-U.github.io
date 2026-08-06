#!/usr/bin/env node
// Fails if anything under js/sim/ reaches out of the pure world.
//
// The sim must be replayable headlessly, deterministically, from a seed — which it cannot be if
// it can see the clock, the DOM, the renderer, or an unseeded random. Run in the soak harness.
//
//   node tools/purity.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIM = resolve(ROOT, 'js/sim');

const BANNED = [
  [/from\s+['"]three['"]/, "imports three"],
  [/\bwindow\./, "touches window"],
  [/\bdocument\./, "touches document"],
  [/\bperformance\./, "reads performance"],
  [/\bMath\.random\b/, "uses Math.random — seed the game's own generator instead"],
  [/\bDate\.now\b/, "reads Date.now"],
  [/\bnavigator\./, "touches navigator"],
  [/\blocalStorage\b/, "touches localStorage"],
];

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

let files = [];
try { files = walk(SIM); } catch { console.error('no js/sim/ yet'); process.exit(1); }
// js/sim imports config.js, so config is part of the pure surface whether it lives here or not.
// Without this, a `window.` in config breaks `node sim.mjs` while purity still reports clean.
files.push(resolve(ROOT, 'js/config.js'));

const fails = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    // a line that is only a comment is documentation, not a dependency
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const [re, why] of BANNED) if (re.test(line)) fails.push(`${relative(ROOT, f)}:${i + 1}  ${why}\n    ${line.trim()}`);
  });
}

if (fails.length) {
  console.error(`purity: ${fails.length} violation(s)\n`);
  for (const f of fails) console.error('  ' + f);
  process.exit(1);
}
console.log(`purity: ok — ${files.length} file(s) under js/sim/ are pure`);
