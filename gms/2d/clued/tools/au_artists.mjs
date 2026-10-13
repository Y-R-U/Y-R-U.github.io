#!/usr/bin/env node
// Grow tools/au_lists/artists.txt with the biggest chart acts from tools/au_lists/charts.json.
//   node tools/au_artists.mjs [--add 40] [--dry]
// An act qualifies with 3+ different year-end hits; it is ranked by its best four songs (chart score + pageviews).
// Left out on purpose: duet/featuring credits, acts Wikidata gives two home countries (Bee Gees: UK or Australia?),
// and acts whose first year-end hit is in a year ending in 0 (their breakthrough decade is ambiguous).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseList, norm, EDGY } from './au_resolve.mjs';
import { groupCharts, artistKey, pageviewsOf } from './au_pick.mjs';
import { artists } from './au_wd.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'tools/au_lists/artists.txt');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ADD = +arg('--add', 40);
const ORIGIN = { USA: 'US', GBR: 'UK', AUS: 'Australia', CAN: 'Canada', IRL: 'Ireland', SWE: 'Sweden', JAM: 'Jamaica', BRB: 'Barbados', NZL: 'New Zealand',
  DEU: 'Germany', FRA: 'France', NLD: 'Netherlands', NOR: 'Norway', KOR: 'South Korea', COL: 'Colombia', ESP: 'Spain', ITA: 'Italy', BEL: 'Belgium', DNK: 'Denmark', PRI: 'Puerto Rico', ISL: 'Iceland' };
const DUO = /\s(&|and|x|vs\.?|with)\s|,/i;
const cs = (b) => Object.values(b).reduce((s, r) => s + Math.max(0.01, 1 - (r - 1) / 100), 0);

async function main() {
  const text = fs.readFileSync(F, 'utf8');
  const { rows } = parseList(text);
  const have = new Set(rows.map((r) => artistKey(r[0])));
  const by = new Map();
  for (const g of groupCharts()) {
    if (DUO.test(g.artist) || have.has(g.ak)) continue;
    if (!by.has(g.ak)) by.set(g.ak, []);
    by.get(g.ak).push(g);
  }
  const cand = [...by.values()].filter((l) => new Set(l.map((g) => g.tk)).size >= 3 && new Set(l.map((g) => g.artist)).size >= 1)
    .map((l) => ({ l: l.sort((a, b) => cs(b.best) - cs(a.best)), name: l[0].artist, link: l.find((g) => g.aLink)?.aLink || '' }))
    .map((c) => ({ ...c, pre: c.l.slice(0, 4).reduce((s, g) => s + cs(g.best), 0) }))
    .sort((a, b) => b.pre - a.pre).slice(0, ADD * 3);
  for (const c of cand) for (const g of c.l.slice(0, 6)) g.pv ??= await pageviewsOf(g);
  const fame = (g) => cs(g.best) + (g.pv > 0 ? Math.max(0, Math.log10(g.pv) - 2.5) / 2 : 0);
  const info = await artists(cand.map((c) => ({ name: c.name, link: c.link })));
  const out = [];
  for (const c of cand) {
    c.l.sort((a, b) => fame(b) - fame(a));
    c.score = c.l.slice(0, 4).reduce((s, g) => s + fame(g), 0);
    const i = info.get(c.name);
    const first = Math.min(...c.l.map((g) => g.first));
    if (!i || i.iso.length !== 1 || !ORIGIN[i.iso[0]] || first % 10 === 0) continue;
    const songs = []; for (const g of c.l) if (songs.length < 3 && !EDGY.test(g.title) && !songs.some((s) => norm(s) === norm(g.title))) songs.push(g.title);
    const top10 = c.l.filter((g) => Math.min(...Object.values(g.best)) <= 10).length;
    out.push({ c, line: `${c.name} | ${ORIGIN[i.iso[0]]} | ${Math.floor(first / 10) * 10}s | ${songs.join(' ; ')}${top10 >= 3 ? ' | d=1' : ''}`, score: c.score });
  }
  out.sort((a, b) => b.score - a.score);
  const add = out.slice(0, ADD);
  add.forEach((a) => console.log(`  + ${a.line}   (${a.score.toFixed(2)})`));
  if (process.argv.includes('--dry')) return;
  fs.writeFileSync(F, text.replace(/\s*$/, '\n') + '# added by tools/au_artists.mjs from the year-end charts (origin from Wikidata)\n' + add.map((a) => a.line).join('\n') + '\n');
  console.log(`added ${add.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
