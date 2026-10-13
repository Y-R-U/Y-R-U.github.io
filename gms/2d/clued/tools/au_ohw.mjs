#!/usr/bin/env node
// Grow tools/au_lists/one-hit-wonders.txt from Wikipedia's one-hit-wonder lists (US Billboard top 40, UK singles chart),
// keeping only songs that also made a year-end chart in tools/au_lists/charts.json and are still widely known.
//   node tools/au_ohw.mjs [--add 30] [--dry]
// Guard: an act with two different songs on the same country's year-end charts is not a one-hit wonder there, and an act
// on only one country's list must have no other song on any year-end chart (US, UK or Australia).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseList } from './au_resolve.mjs';
import { groupCharts, titleKey, artistKey, sameTitle, sameArtist, fmtChart, leadOf, pageviewsOf } from './au_pick.mjs';
import { artists } from './au_wd.mjs';
import { wiki as wikiCached, tables, clean as wclean } from './au_charts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'tools/au_lists/one-hit-wonders.txt');
const UA = 'CluedTriviaBuilder/1.0 (https://games.br8t.com/gms/2d/clued/)';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ADD = +arg('--add', 30);
const clean = (s) => String(s).replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>|\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:\S+\s([^\]]*)\]/g, '$1').replace(/'''?/g, '').trim();

async function wiki(title) {
  const u = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  return (await fetch(u, { headers: { 'user-agent': UA } })).text();
}

async function lists() {
  const out = [];
  const us = await wiki('List of one-hit wonders in the United States');
  for (const ln of us.split('\n')) {
    const m = ln.match(/^\*\s*(.+?)\s+[–—-]\s+"(.+?)"\s*\((\d{4})\)/);
    if (m) out.push({ c: 'us', artist: clean(m[1]), title: clean(m[2]), year: +m[3] });
  }
  const uk = await wiki('List of one-hit wonders on the UK singles chart');
  const body = uk.split(/\n==[^=]/)[2] || '';
  for (const row of body.split('\n|-')) {
    const cells = row.split('\n|').map((x) => x.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const y = +(cells[1].match(/(\d{4})/)?.[1] || 0);
    if (y) out.push({ c: 'uk', artist: clean(cells[0]), title: clean(cells[2]).replace(/^"|"$/g, ''), year: y });
  }
  return out.filter((x) => x.year >= 1960);
}

// every act with a UK top-10 single, 1960-2025 (Wikipedia "List of UK top-ten singles in YEAR"): artistKey -> Set(titleKey)
async function ukTop10() {
  const out = new Map();
  for (let y = 1960; y <= 2025; y++) {
    const wt = await wikiCached(`List of UK top-ten singles in ${y}`);
    for (const t of tables(wt)) {
      const si = t.head.findIndex((h) => /^single$/i.test(h)), ai = t.head.findIndex((h) => /^artist/i.test(h));
      if (si < 0 || ai < 0) continue;
      for (const r of t.rows) {
        const title = wclean(r[si] || '').replace(/["‡♦†]/g, '').trim(), credit = wclean(r[ai] || '');
        if (!title || !credit) continue;
        for (const a of credit.split(/\s+(?:featuring|feat\.?|ft\.?|with|and|&|vs\.?|x)\s+|,\s*/i)) {
          const k = artistKey(a);
          if (!k) continue;
          if (!out.has(k)) out.set(k, new Set());
          out.get(k).add(titleKey(title));
        }
      }
    }
  }
  return out;
}

async function main() {
  const groups = groupCharts();
  const uk10 = await ukTop10();
  console.log(`${uk10.size} acts with a UK top-10 single`);
  const ohw = await lists();
  console.log(`${ohw.length} listed one-hit wonders since 1960`);
  const text = fs.readFileSync(F, 'utf8');
  const { rows } = parseList(text);
  const have = rows.map(([y, a, t]) => ({ y: +y, a, t, tk: titleKey(t), ak: artistKey(a) }));
  const findG = (title, artist, year) => groups.find((g) => sameTitle(g.tk, titleKey(title)) && sameArtist(g.ak, artistKey(artist)) && Math.abs(g.first - year) <= 2);
  const songsOn = (ak, c) => new Set(groups.filter((g) => g.ak === ak && g.best[c]).map((g) => g.tk)).size;
  const cand = [];
  for (const o of ohw) {
    if (have.some((h) => sameArtist(h.ak, artistKey(o.artist)) && sameTitle(h.tk, titleKey(o.title)))) continue;
    const g = findG(o.title, o.artist, o.year);
    if (!g || cand.some((x) => x.g === g)) continue;
    if (songsOn(g.ak, o.c) > 1) continue;
    // listed in one country only: no other song by the act on any year-end chart (Oasis is no one-hit wonder in Britain)
    const both = ohw.some((x) => x.c !== o.c && sameArtist(artistKey(x.artist), g.ak) && sameTitle(titleKey(x.title), g.tk));
    if (!both && new Set(groups.filter((x) => x.ak === g.ak).map((x) => x.tk)).size > 1) continue;
    // and never more than this one song in the UK top 10 (Aaron's players are British and Australian)
    const t10 = uk10.get(g.ak);
    if (t10 && [...t10].some((tk) => !sameTitle(tk, g.tk))) continue;
    const best = Math.min(...Object.values(g.best));
    if (best > 40) continue;
    cand.push({ o, g });
  }
  for (const x of cand) x.g.pv = await pageviewsOf(x.g);
  const ok = cand.filter((x) => x.g.pv >= 2500).map((x) => ({ ...x, score: Object.values(x.g.best).reduce((s, r) => s + 1 - (r - 1) / 100, 0) + Math.log10(x.g.pv) - 3 }))
    .sort((a, b) => b.score - a.score).slice(0, ADD);
  console.log(`${cand.length} candidates on a year-end chart, adding ${ok.length}`);
  // chart column for every row (old rows too)
  const all = [...have.map((h) => ({ ...h, g: findG(h.t, h.a, h.y), opts: rows.find((r) => r[1] === h.a && r[2] === h.t).slice(3).filter((c) => !/^(us|uk|au|pv|from)=/.test(c)).join(' | ') })),
    ...ok.map(({ o, g }) => ({ y: g.first, a: g.artist, t: g.title, g, opts: g.srcPri >= 3 ? 'nm=apple' : '', src: o.c }))];
  for (const r of all) if (r.g && r.g.pv == null) r.g.pv = await pageviewsOf(r.g);
  const info = await artists(all.map((r) => ({ name: leadOf(r.a), link: r.g?.aLink || '' })));
  const lines = all.sort((a, b) => a.y - b.y).map((r) => {
    const i = info.get(leadOf(r.a));
    const ch = fmtChart({ best: r.g?.best || {}, pv: r.g?.pv ?? 0, from: i?.iso?.join('/') || '' });
    return [r.y, r.a, r.t, ch, r.opts].filter((x, k) => k < 4 || x).join(' | ');
  });
  ok.forEach(({ o, g }) => console.log(`  + ${g.first} ${g.artist} — ${g.title}  (${o.c} list; ${fmtChart({ best: g.best, pv: g.pv })})`));
  if (process.argv.includes('--dry')) return;
  const heads = text.split('\n').filter((l) => /^[@#]/.test(l.trim())).map((h) => (h.startsWith('@sources')
    ? '@sources ' + JSON.stringify([
      { name: 'Acts with a single US Billboard Hot 100 top-40 hit, or a single UK top-40 hit (Wikipedia one-hit-wonder lists); each song also made a year-end chart', url: 'https://en.wikipedia.org/wiki/List_of_one-hit_wonders_in_the_United_States' },
      { name: 'One-hit wonders on the UK singles chart', url: 'https://en.wikipedia.org/wiki/List_of_one-hit_wonders_on_the_UK_singles_chart' },
    ]) : h)).filter((h) => !h.startsWith('# chart'));
  heads.push('# chart column: best year-end position us/uk/au, pv = monthly Wikipedia views, from = artist country (see tools/au_pick.mjs)');
  fs.writeFileSync(F, heads.join('\n') + '\n' + lines.join('\n') + '\n');
  console.log(`wrote ${lines.length} rows`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
