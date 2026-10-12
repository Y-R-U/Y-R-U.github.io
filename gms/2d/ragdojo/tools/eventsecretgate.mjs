#!/usr/bin/env node
/**
 * Picture-reveal secrets stay off the public site:
 *   - no approved answer anywhere in the built bundle (JS/HTML/CSS of dist/home and dist/itch),
 *     nor in the game's own source, server, docs or tools (js/, dev/, index.html, server/, docs/,
 *     tools/, CLAUDE.md), the public manifest's choices excepted;
 *   - no approved answer anywhere in the public repo's history of the game (git log -S), and no
 *     current choice was a choice in an earlier version of the manifest (F4: history cannot be
 *     rewritten, so each picture got new wording);
 *   - no picture in assets/events or in either build: only manifest.json;
 *   - the manifest names no image and no answer (choices + name box only);
 *   - the engine has no answer table.
 * Answers are read from Aaron's answers file (EVENTART_DATA or ~/.ragdojo/eventart), so the gate
 * itself never contains one. With no answers file it still checks everything else.
 *
 *   node tools/build.mjs && node tools/eventsecretgate.mjs [--root <game dir>]
 *   node tools/eventsecretgate.mjs --falsify     5 broken copies must go red
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
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
    if (f === 'node_modules' || f.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const MAN = 'assets/events/manifest.json';

/** Commits in the game's history that add or remove an answer anywhere but the manifest's choices. */
export function historyHits(game, list = answers) {
  const hits = [];
  for (const a of list) {
    for (const v of new Set([a, a.toLowerCase()])) {
      const out = git(game, 'log', '--all', '--format=%h', '-i', '-S', v, '--', '.', `:(exclude)${MAN}`).trim();
      if (out) { hits.push(`${a.length}-char answer in ${out.split('\n').length} commit(s)`); break; }
    }
  }
  return hits;
}

/** Current choices that were already a choice in an earlier version of the manifest. */
export function reusedChoices(game) {
  const cur = read(join(game, MAN), { pictures: {} }).pictures || {};
  const earlier = new Set();
  for (const h of git(game, 'log', '--all', '--format=%h', '--', MAN).split('\n').filter(Boolean)) {
    let m;
    try { m = JSON.parse(git(game, 'show', `${h}:./${MAN}`)); } catch { continue; }
    for (const [ev, e] of Object.entries(m.pictures || {})) {
      const now = cur[ev]?.choices || [];
      const same = now.length && (e.choices || []).length === now.length && now.every((c) => e.choices.includes(c));
      if (!same) for (const c of e.choices || []) earlier.add(norm(c));
    }
  }
  return Object.values(cur).flatMap((e) => (e.choices || []).map(norm)).filter((c) => earlier.has(c)).length;
}

export function check(game, { label = '', noHistory = false } = {}) {
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${n}${x && !c ? '  ' + x : ''}`); };
  const builds = ['home', 'itch'].map((e) => join(game, 'dist', e)).filter(existsSync);
  ok('the release builds exist (run tools/build.mjs first)', builds.length === 2);
  const code = [...builds.flatMap((b) => walk(b)), ...walk(join(game, 'js')), ...walk(join(game, 'dev')), join(game, 'index.html')]
    .filter((f) => /\.(m?js|html|css)$/.test(f));
  const text = ['server', 'docs', 'tools'].flatMap((d) => walk(join(game, d))).concat(join(game, 'CLAUDE.md'))
    .filter((f) => existsSync(f) && /\.(go|md|m?js|json|html|css|sh|txt|fragment|service|mod)$|Caddyfile/.test(f));
  code.push(...text);
  const hits = [];
  for (const f of code) {
    const text = norm(readFileSync(f, 'utf8'));
    for (const a of answers) if (text.includes(a)) hits.push(`${relative(game, f)}: ${a.length} chars`);
  }
  ok(`no approved answer in the bundle, game source, server, docs or tools (${answers.length} answers, ${code.length} files)`, hits.length === 0, hits.join(', '));
  if (!noHistory) {
    const hh = historyHits(game);
    ok(`no approved answer anywhere in the game's public git history (${answers.length} answers)`, hh.length === 0, hh.join(', '));
    const reused = reusedChoices(game);
    ok('no current choice was a choice in an earlier manifest', reused === 0, `${reused} reused`);
  }
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
    ['an answer in a server comment', (d) => { if (!answers.length) return false; const f = join(d, 'server/events.go'); writeFileSync(f, readFileSync(f, 'utf8') + `\n// ${answers.at(-1).toLowerCase()}\n`); return true; }],
    ['an answer in the docs', (d) => { if (!answers.length) return false; const f = join(d, 'docs/MANAGER_STATE.md'); writeFileSync(f, readFileSync(f, 'utf8') + `\n${answers[1] || answers[0]}\n`); return true; }],
  ];
  let red = 0;
  for (const [what, mutate] of MUT) {
    const d = mkdtempSync(join(tmpdir(), 'secretgate-'));
    for (const x of ['dist', 'js', 'dev', 'assets/events', 'index.html', 'server', 'docs', 'tools', 'CLAUDE.md']) cpSync(join(root, x), join(d, x), { recursive: true, filter: (s) => !/node_modules|ragdojo-arena$/.test(s) });
    if (!mutate(d)) { console.log(`SKIP  ${what} (no answers file)`); red++; rmSync(d, { recursive: true, force: true }); continue; }
    const r = check(d, { label: '[mut] ', noHistory: true });
    rmSync(d, { recursive: true, force: true });
    console.log(r.fail ? `RED   ${what}` : `GREEN ${what} — not noticed`);
    if (r.fail) red++;
  }
  // History: a throwaway repo whose past holds an answer outside the manifest, and a manifest
  // whose choices were all offered before.
  if (answers.length) {
    const g = mkdtempSync(join(tmpdir(), 'secretgit-'));
    const run = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: g, stdio: 'ignore' });
    run('init', '-q');
    cpSync(join(root, MAN), join(g, MAN));
    writeFileSync(join(g, 'notes.md'), `old notes: ${answers[0].toLowerCase()}\n`);
    run('add', '.'); run('commit', '-qm', 'a');
    writeFileSync(join(g, 'notes.md'), 'scrubbed\n');
    run('add', '.'); run('commit', '-qm', 'b');
    const m = read(join(g, MAN), { pictures: {} });
    const caughtHist = historyHits(g).length > 0;
    for (const e of Object.values(m.pictures)) e.choices = [...e.choices].reverse().map((c, i) => (i ? c : c + ' AGAIN'));
    writeFileSync(join(g, MAN), JSON.stringify(m));
    run('add', '.'); run('commit', '-qm', 'c');
    const caughtReuse = reusedChoices(g) > 0;
    rmSync(g, { recursive: true, force: true });
    console.log(caughtHist ? 'RED   an answer in the history' : 'GREEN an answer in the history — not noticed');
    console.log(caughtReuse ? 'RED   choices reused from an earlier manifest' : 'GREEN choices reused from an earlier manifest — not noticed');
    red += caughtHist + caughtReuse;
  } else { console.log('SKIP  history mutants (no answers file)'); red += 2; }
  console.log(`\nfalsify: ${red}/${MUT.length + 2} mutants caught`);
  process.exit(red === MUT.length + 2 ? 0 : 1);
} else {
  const r = check(root);
  console.log(`\n${r.pass} passed, ${r.fail} failed`);
  process.exit(r.fail ? 1 : 0);
}
