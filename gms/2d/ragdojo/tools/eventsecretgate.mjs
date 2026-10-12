#!/usr/bin/env node
/**
 * Picture-reveal secrets stay off the public site:
 *   - no approved answer anywhere in the built bundle (JS/HTML/CSS of dist/home and dist/itch),
 *     nor in the game's own source (js/, dev/, index.html);
 *   - no picture in assets/events or in either build: only manifest.json;
 *   - the manifest names no image and no answer (choices + name box only);
 *   - the engine has no answer table.
 * Answers are read from Aaron's answers file (EVENTART_DATA or ~/.ragdojo/eventart), so the gate
 * itself never contains one. With no answers file it still checks everything else.
 *
 *   node tools/build.mjs && node tools/eventsecretgate.mjs [--root <game dir>]
 *   node tools/eventsecretgate.mjs --falsify     3 broken copies of dist must go red
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { ROOT } from './cdp.mjs';

const args = process.argv.slice(2);
const root = args.includes('--root') ? args[args.indexOf('--root') + 1] : ROOT;
const DATA = process.env.EVENTART_DATA || join(homedir(), '.ragdojo/eventart');
const read = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const norm = (s) => String(s).toUpperCase().replace(/\s+/g, ' ').trim();
const answers = [...new Set([
  ...Object.values(read(join(DATA, 'answers.json'), {}).answers || {}),
  ...Object.values(read(join(DATA, 'state.json'), {}).themes || {}).map((t) => t.answer),
].filter(Boolean).map(norm))];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

export function check(game, { label = '' } = {}) {
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${n}${x && !c ? '  ' + x : ''}`); };
  const builds = ['home', 'itch'].map((e) => join(game, 'dist', e)).filter(existsSync);
  ok('the release builds exist (run tools/build.mjs first)', builds.length === 2);
  const code = [...builds.flatMap((b) => walk(b)), ...walk(join(game, 'js')), ...walk(join(game, 'dev')), join(game, 'index.html')]
    .filter((f) => /\.(m?js|html|css)$/.test(f));
  const hits = [];
  for (const f of code) {
    const text = norm(readFileSync(f, 'utf8'));
    for (const a of answers) if (text.includes(a)) hits.push(`${relative(game, f)}: ${a.length} chars`);
  }
  ok(`no approved answer in the bundle or the game source (${answers.length} answers, ${code.length} files)`, hits.length === 0, hits.join(', '));
  if (!answers.length) console.log(`WARN  no answers file in ${DATA}: the answer scan had nothing to look for`);
  const pics = [join(game, 'assets/events'), ...builds.map((b) => join(b, 'assets/events'))].flatMap((d) => walk(d)).filter((f) => !f.endsWith('manifest.json'));
  ok('no picture in assets/events or in either build', pics.length === 0, pics.map((f) => relative(game, f)).join(', '));
  for (const m of [join(game, 'assets/events/manifest.json'), ...builds.map((b) => join(b, 'assets/events/manifest.json'))]) {
    const man = read(m, null);
    const bad = man ? Object.entries(man.pictures || {}).filter(([, e]) => Object.keys(e).some((k) => !['w', 'h', 'choices', 'overlay'].includes(k))) : [];
    ok(`${relative(game, m)}: choices and name box only (no image, no answer)`, !!man && bad.length === 0, JSON.stringify(bad));
  }
  const rv = readFileSync(join(game, 'js/events/reveal.js'), 'utf8');
  ok('the engine has no answer table', !/PICTURES|answer\s*:/.test(rv));
  return { pass, fail };
}

if (args.includes('--falsify')) {
  const MUT = [
    ['an answer in the bundle', (d) => { if (!answers.length) return false; const f = join(d, 'dist/home/js/main.js'); writeFileSync(f, readFileSync(f, 'utf8') + `\n//${answers[0]}`); return true; }],
    ['a full picture shipped', (d) => { writeFileSync(join(d, 'dist/itch/assets/events/reveal-week-2026-W43.webp'), 'RIFF'); return true; }],
    ['the manifest names an image', (d) => { const f = join(d, 'assets/events/manifest.json'); const m = read(f, { pictures: {} }); m.pictures['x:1'] = { img: 'x.webp', w: 1, h: 1, choices: [] }; writeFileSync(f, JSON.stringify(m)); return true; }],
  ];
  let red = 0;
  for (const [what, mutate] of MUT) {
    const d = mkdtempSync(join(tmpdir(), 'secretgate-'));
    for (const x of ['dist', 'js', 'dev', 'assets/events', 'index.html']) cpSync(join(root, x), join(d, x), { recursive: true });
    if (!mutate(d)) { console.log(`SKIP  ${what} (no answers file)`); red++; rmSync(d, { recursive: true, force: true }); continue; }
    const r = check(d, { label: '[mut] ' });
    rmSync(d, { recursive: true, force: true });
    console.log(r.fail ? `RED   ${what}` : `GREEN ${what} — not noticed`);
    if (r.fail) red++;
  }
  console.log(`\nfalsify: ${red}/${MUT.length} mutants caught`);
  process.exit(red === MUT.length ? 0 : 1);
} else {
  const r = check(root);
  console.log(`\n${r.pass} passed, ${r.fail} failed`);
  process.exit(r.fail ? 1 : 0);
}
