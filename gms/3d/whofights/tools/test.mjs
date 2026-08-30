#!/usr/bin/env node
// The test runner. `node tools/test.mjs` finds every js/**/*.test.mjs, imports it, and runs what
// it registered with tools/harness.mjs. No node:test, no dependencies.
//
//   node tools/test.mjs            all of them
//   node tools/test.mjs hotspot    only files whose path matches

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { queue, setFile } from './harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.test.mjs')) out.push(p);
  }
  return out;
}

const filter = process.argv[2];
const files = walk(join(ROOT, 'js')).filter(f => !filter || f.includes(filter)).sort();

// A file that does not import the harness runs itself at import time and may call process.exit,
// which would take this runner down before it reports. js/dev/ is another agent's directory and
// writes its tests that way, so those go into a child process and are scored on the exit code.
const own = files.filter(f => readFileSync(f, 'utf8').includes('harness.mjs'));
const foreign = files.filter(f => !own.includes(f));

for (const f of own) {
  setFile(relative(ROOT, f));
  await import(pathToFileURL(f).href);
}

let pass = 0;
const fails = [];

for (const f of foreign) {
  const name = relative(ROOT, f);
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  if (r.status === 0) { pass++; console.log(`  ${name}: ${out.split('\n').pop() || 'ok'}`); }
  else fails.push(`${name} — exit ${r.status}\n    ${out}${r.stderr || ''}`);
}
for (const t of queue) {
  try { await t.fn(); pass++; }
  catch (e) { fails.push(`${t.file} — ${t.name}\n    ${e.message}`); }
}

console.log(`${pass}/${queue.length + foreign.length} passed across ${files.length} files`);
for (const f of fails) console.error(`\nFAIL  ${f}`);
process.exit(fails.length ? 1 : 0);
