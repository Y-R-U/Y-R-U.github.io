#!/usr/bin/env node
// AU checks: music pack schema + licences, Apple items resolved, piano note files, melodies, listen format.
//   node tools/au_test.mjs            (exit 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUSIC = path.join(ROOT, 'data/music');
let fails = 0, warns = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };
const warn = (m) => { warns++; console.log('warn ' + m); };

const FREE = /^(PD|Public domain|CC0|CC0 1\.0|PDM|PDM-owner|Public Domain Mark.*|CC BY(-SA)? \d\.\d( [a-z]{2,})?)$/i;
const APPLE_LIC = 'Apple Music preview (streamed, not stored)';
const THEMES = ['music'];

export function checkPack(p, file) {
  const errs = [];
  const e = (m) => errs.push(`${file}: ${m}`);
  if (!p.id || p.id + '.json' !== path.basename(file)) e(`id "${p.id}" does not match file name`);
  if (!p.title) e('missing title');
  if (!THEMES.includes(p.theme)) e(`theme "${p.theme}"`);
  if (!Array.isArray(p.items) || !p.items.length) e('no items');
  if (!Array.isArray(p.sources) || !p.sources.length) e('no sources');
  const ids = new Set();
  for (const it of p.items || []) {
    const w = (m) => e(`${it.id}: ${m}`);
    if (!it.id || ids.has(it.id)) w('missing or duplicate id');
    ids.add(it.id);
    if (!it.name) w('no name');
    if (![1, 2, 3].includes(it.difficulty)) w('difficulty must be 1-3');
    const audio = it.media?.audio || [];
    if (!audio.length) w('no audio');
    for (const a of audio) {
      if (!a.src) w('audio without src');
      if (!a.credit || !a.license || !a.page) w('audio without credit/license/page');
      if (a.apple) {
        if (a.license !== APPLE_LIC) w('apple audio with wrong licence label');
        if (!Number.isInteger(a.apple.trackId)) w('apple trackId missing');
        if (!/^https:\/\/music\.apple\.com\//.test(a.apple.url || '')) w('apple url not music.apple.com');
        if (!/^https:\/\/[a-z0-9-]+\.(itunes\.apple\.com|mzstatic\.com)\//.test(a.src)) w('preview not from Apple');
        if (a.page !== a.apple.url) w('page should be the Apple link');
      } else if (!FREE.test(a.license)) w(`licence "${a.license}" not allowed`);
      if (a.type === 'piano') {
        const nf = path.join(ROOT, a.src);
        if (!fs.existsSync(nf)) { w(`note file ${a.src} missing`); continue; }
        const piece = JSON.parse(fs.readFileSync(nf, 'utf8'));
        for (const m of checkPiece(piece)) w(`${a.src}: ${m}`);
      } else if (!a.apple && !/^https:\/\/upload\.wikimedia\.org\//.test(a.src) && !fs.existsSync(path.join(ROOT, a.src))) w(`local audio ${a.src} missing`);
    }
    const f = it.facts || {};
    if (f.year != null && !(Number.isInteger(f.year) && f.year >= 1500 && f.year <= 2026)) w(`bad year ${f.year}`);
    if (f.decade != null && f.year != null && f.decade !== `${Math.floor(f.year / 10) * 10}s`) w(`decade ${f.decade} does not match year ${f.year}`);
    for (const k of Object.keys(f)) if (!p.factsMeta?.[k]) w(`fact "${k}" missing from factsMeta`);
    if (it.lyrics && !audio.every((a) => a.type === 'piano' && /^(PD|Public domain)$/i.test(a.license))) w('lyrics allowed only on public-domain songs');
  }
  return errs;
}

export function checkPiece(pc) {
  const out = [];
  if (!(pc.bpm > 20 && pc.bpm < 400)) out.push(`bpm ${pc.bpm}`);
  if (!Array.isArray(pc.notes) || pc.notes.length < 8) out.push('too few notes');
  for (const n of pc.notes || []) {
    const [b, m, d, v] = n;
    if (!(b >= 0 && m >= 21 && m <= 108 && d > 0 && v >= 1 && v <= 127)) { out.push(`bad note ${JSON.stringify(n)}`); break; }
    if (m < 21 - 2 || m > 96 + 2) { out.push(`note ${m} outside the sampled range`); break; }
  }
  if (!pc.source?.license) out.push('no source licence');
  const dur = (pc.notes || []).reduce((mx, [b, , d]) => Math.max(mx, b + d), 0) * 60 / pc.bpm;
  if (dur < 5 || dur > 60) out.push(`duration ${dur.toFixed(1)} s`);
  return out;
}

async function main() {
  const files = fs.readdirSync(MUSIC).filter((f) => f.endsWith('.json'));
  if (files.length < 10) fail(`only ${files.length} music packs`);
  const packs = [];
  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(path.join(MUSIC, f), 'utf8'));
    packs.push(p);
    checkPack(p, f).forEach(fail);
    const easy = p.items.filter((i) => i.difficulty === 1).length;
    if (easy < 15) warn(`${p.id}: only ${easy} difficulty-1 items (target 15)`);
    console.log(`ok   ${p.id}: ${p.items.length} items, ${easy} easy`);
  }

  // every Apple list row resolved, or explicitly reported as dropped
  for (const f of fs.readdirSync(path.join(ROOT, 'tools/au_lists')).filter((x) => x.endsWith('.txt'))) {
    const txt = fs.readFileSync(path.join(ROOT, 'tools/au_lists', f), 'utf8');
    const id = txt.match(/^@id (.+)$/m)[1].trim();
    const rows = txt.split('\n').filter((l) => l.trim() && !/^[#@]/.test(l.trim())).length;
    const pk = packs.find((p) => p.id === id);
    const chk = path.join(ROOT, 'tools/au_lists', id + '.check.json');
    if (!pk || !fs.existsSync(chk)) { fail(`${id}: not built (run tools/au_resolve.mjs)`); continue; }
    const dropped = JSON.parse(fs.readFileSync(chk, 'utf8')).dropped.length;
    if (pk.items.length < rows * 0.85) fail(`${id}: only ${pk.items.length}/${rows} rows resolved`);
    const songs = pk.items.reduce((s, i) => s + i.media.audio.length, 0);
    console.log(`ok   ${id}: ${pk.items.length} items from ${rows} rows (${dropped} dropped), ${songs} previews`);
    if (pk.items.some((i) => i.media.audio.some((a) => !a.apple))) fail(`${id}: non-Apple audio in an Apple pack`);
  }

  // hand transcriptions: bar lengths add up
  const { MELODIES, compile } = await import(pathToFileURL(path.join(ROOT, 'tools/au_melodies.mjs')).href);
  for (const m of MELODIES.filter((x) => !x.sameAs)) {
    try { const pc = compile(m); checkPiece(pc).forEach((x) => fail(`${m.id}: ${x}`)); } catch (e) { fail(e.message); }
  }
  console.log(`ok   ${MELODIES.length} melodies compile`);

  // listen format: generates valid, deterministic, serialisable questions on every pack
  const listen = (await import(pathToFileURL(path.join(ROOT, 'js/audio/listen.js')).href + '?v=1')).default;
  const { mulberry32 } = await import(pathToFileURL(path.join(ROOT, 'js/core/rng.js')).href + '?v=1');
  for (const p of packs) {
    for (const [opts, kids, diff] of [[{}, false, 0], [{ clip: 1, art: 'blur' }, false, 3], [{ clip: 30 }, true, 1], [{ ask: 'artist', answers: 6 }, false, 2]]) {
      const qs = listen.generate({ rng: mulberry32(42), packs: [p], count: 8, opts, difficulty: diff, kids });
      const again = listen.generate({ rng: mulberry32(42), packs: [p], count: 8, opts, difficulty: diff, kids });
      if (JSON.stringify(qs) !== JSON.stringify(again)) fail(`${p.id}: listen not deterministic`);
      if (!qs.length && !opts.ask && (!kids || p.kids || p.items.some((i) => i.difficulty === 1))) fail(`${p.id}: listen made no questions (${JSON.stringify(opts)} kids=${kids})`);
      for (const q of qs) {
        const w = (m) => fail(`${p.id} ${q.id}: ${m}`);
        if (q.format !== 'listen') w('format');
        if (!(q.answer >= 0 && q.answer < q.options.length)) w('answer index');
        const texts = q.options.map((o) => o.text.toLowerCase());
        if (new Set(texts).size !== texts.length) w('duplicate options');
        if (q.options[q.answer].text !== q.answerText) w('answerText mismatch');
        if (kids && q.options.length > 3) w('kids need ≤ 3 answers');
        if (!q.data.a?.src || q.data.len <= 0) w('no clip');
        if (q.data.a.apple && q.data.start < 3) w('Apple clip should skip the first 3 s');
        if (kids && q.data.replays !== -1) w('kids need unlimited replays');
        const it = p.items.find((i) => `${p.id}/${i.id}` === q.refs[0]);
        const k = q.data.kind;
        const want = { title: it.name, film: it.name, name: it.name, 'artist-name': it.name, artist: it.facts?.artist, composer: it.facts?.composer, decade: it.facts?.decade }[k];
        if (k !== 'lyrics' && q.answerText !== String(want)) w(`answer "${q.answerText}" is not the item's ${k} "${want}"`);
        if (k === 'lyrics') { const line = q.prompt.match(/“(.*) …”/)?.[1]; const i = it.lyrics.indexOf(line); if (i < 0 || it.lyrics[i + 1] !== q.answerText || it.lyrics.lastIndexOf(line) !== i) w('lyric answer is not the line that follows'); }
        if (q.timeLimit < q.data.len * 1000) w('time limit shorter than the clip');
        JSON.parse(JSON.stringify(q));
      }
    }
  }
  for (const p of packs.filter((x) => !x.items.some((i) => i.lyrics))) {
    const qs = listen.generate({ rng: mulberry32(7), packs: [p], count: 4, opts: { grow: 'on' }, difficulty: 0 });
    for (const q of qs) {
      if (q.stages !== 5 || q.data.stageLens.length !== 5) fail(`${p.id} ${q.id}: grow mode needs stages 5`);
      if (q.data.stageLens.some((x, i, a) => i && x < a[i - 1])) fail(`${p.id} ${q.id}: stage lengths must grow`);
    }
    const off = listen.generate({ rng: mulberry32(7), packs: [p], count: 2, opts: {}, difficulty: 0 });
    if (off.some((q) => q.stages)) fail(`${p.id}: stages without grow (solo default must be off)`);
    const online = listen.generate({ rng: mulberry32(7), packs: [p], count: 2, opts: {}, difficulty: 0, spec: { online: true } });
    if (online.some((q) => !q.stages)) fail(`${p.id}: online rooms should grow by default`);
  }
  console.log('ok   listen generate');
  console.log(fails ? `\n${fails} FAILED, ${warns} warnings` : `\nall passed (${warns} warnings)`);
  process.exit(fails ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
