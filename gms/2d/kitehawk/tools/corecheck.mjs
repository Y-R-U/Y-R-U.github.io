#!/usr/bin/env node
/**
 * Structural enforcement of ARCHITECTURE §8.1's precondition, one phase early.
 *
 * §8.1 says nothing under js/sim/, js/modes/ or js/data/ may touch the DOM,
 * WebGL, wall-clock time, Math.random or core/camera.js — otherwise every number
 * in the balance plan is a fiction about a different game. Those folders do not
 * exist yet. What DOES exist is the set of core modules they will import, and if
 * any of those is impure the rule is unenforceable before it is ever written.
 *
 * So this file splits js/core/ into two tiers and checks both:
 *
 *   PURE  — node imports it, and it contains no banned token. sim/ may import
 *           these: math, rng, events, bands, viewprofile, camera.
 *   HOST  — browser-only by nature. sim/ must NEVER import these:
 *           viewport, input, loop, save, quality, debug, audio.
 *
 * camera.js is in the PURE tier and that is deliberate: it must be node-testable
 * (tools/camtrace.mjs), and being pure is not permission to import it from sim/.
 * That direction is a separate rule and gates_purity owns it.
 *
 *   node tools/corecheck.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PURE = ['math.js', 'rng.js', 'events.js', 'bands.js', 'viewprofile.js', 'camera.js'];
const HOST = ['viewport.js', 'input.js', 'loop.js', 'save.js', 'quality.js', 'debug.js', 'audio.js'];

const BANNED = [
  [/\bdocument\b/, 'document'],
  [/\bwindow\b/, 'window'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bnavigator\b/, 'navigator'],
  [/\bperformance\s*\./, 'performance.*'],
  [/\bDate\s*\.\s*now/, 'Date.now'],
  [/\bnew\s+Date\b/, 'new Date'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
  [/\bsetTimeout\b/, 'setTimeout'],
  [/\bMath\s*\.\s*random\b/, 'Math.random'],
  [/\bWebGL|getContext\b/, 'WebGL'],
  [/\blocation\b/, 'location'],
];

// Strip comments and strings so a rule NAMED in prose is not a violation.
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

let fails = 0;
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

console.log('\nPURE tier — node imports it, no banned token, safe for js/sim/ to import:');
for (const f of PURE) {
  const path = join(ROOT, 'js/core', f);
  const src = code(readFileSync(path, 'utf8'));
  const hits = BANNED.filter(([re]) => re.test(src)).map(([, n]) => n);
  let imported = true, err = '';
  try { await import(path); } catch (e) { imported = false; err = e.message.split('\n')[0]; }
  say(imported && hits.length === 0,
    `core/${f.padEnd(15)} import ${imported ? 'ok' : 'FAILED: ' + err}${hits.length ? '  banned: ' + hits.join(', ') : '  clean'}`);
}

console.log('\nHOST tier — browser-only by nature; js/sim/ must never import these:');
for (const f of HOST) {
  const path = join(ROOT, 'js/core', f);
  const src = code(readFileSync(path, 'utf8'));
  const hits = BANNED.filter(([re]) => re.test(src)).map(([, n]) => n);
  // Two of these have no host token: audio.js is a bare re-export, and
  // quality.js happens to be pure. Neither is promoted to the PURE tier — sim/
  // has no business reading a render-quality flag, and a module that MIGHT be
  // imported one day is not the same as one that is meant to be.
  console.log(`  note  core/${f.padEnd(15)} host tokens: ${hits.join(', ') || '(none)'}`);
}

console.log('\nCross-check — the pure tier must not reach the host tier:');
for (const f of PURE) {
  const src = readFileSync(join(ROOT, 'js/core', f), 'utf8');
  const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  const bad = imports.filter((i) => HOST.some((h) => i.endsWith('/' + h)));
  say(bad.length === 0, `core/${f.padEnd(15)} imports ${imports.join(', ') || '(nothing)'}`);
}

console.log(fails ? `\nFAIL — ${fails} problem(s)\n` : '\nPASS — the pure tier is node-importable and clean\n');
process.exit(fails ? 1 : 0);
