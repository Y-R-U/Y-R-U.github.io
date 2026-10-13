#!/usr/bin/env node
// Grow the decade hit lists from tools/au_lists/charts.json (built by tools/au_charts.mjs).
//   node tools/au_pick.mjs [--per 27] [--dry]
// Every chart row is grouped into one song across US/UK/AU and across years, scored by its year-end positions
// (UK and AU count as much as the US: the players are Australian and British) plus Wikipedia pageviews of the
// song article (lasting fame), and each year is topped up to --per songs. Existing rows keep their hand options;
// every row gets its chart column rewritten: `us=1 uk=4 au=12 pv=8100 from=USA` (- = not on that chart).
// Pageviews and artist countries are cached in ~/.cache/clued-au/ (pv.json, wd.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm, dice, parseList } from './au_resolve.mjs';
import { artists } from './au_wd.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTS = path.join(ROOT, 'tools/au_lists');
const CACHE = path.join(os.homedir(), '.cache/clued-au');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PER = +arg('--per', 27);
const DRY = process.argv.includes('--dry');
const UA = 'CluedTriviaBuilder/1.0 (https://games.br8t.com/gms/2d/clued/)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = JSON.parse(fs.readFileSync(path.join(LISTS, 'charts.json'), 'utf8'));
const COUNTRIES = ['us', 'uk', 'au'];
const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

// --- song identity ---
const FEAT = /\s+(?:feat\.?|featuring|ft\.?|with|duet with|presents)\s+.*$/i;
export const leadOf = (a) => String(a).replace(FEAT, '').trim();
const artistKey = (a) => norm(leadOf(a)).replace(/^the /, '').split(/ and | x | vs /)[0].split(' ').filter(Boolean).slice(0, 2).join(' ');
const titleKey = (t) => { const s = norm(String(t).split(' / ')[0].replace(/\s*[([][^)\]]*[)\]]/g, '')); return s || norm(t); };
const sameTitle = (a, b) => a === b || (a.length >= 6 && b.length >= 6 && (a.startsWith(b) || b.startsWith(a))) || dice(a, b) >= 0.9;
const STOP = new Set(['the', 'and', 'band', 'with', 'featuring', 'feat', 'john', 'little', 'boys', 'girls', 'brothers', 'sisters', 'orchestra', 'group', 'lil', 'young', 'big', 'his', 'her']);
const tokens = (a) => new Set(norm(a).split(' ').filter((w) => w.length >= 4 && !STOP.has(w)));
const sameArtist = (a, b, ta, tb) => a === b || a.split(' ')[0] === b.split(' ')[0] || dice(a, b) >= 0.8 || (ta && tb && [...ta].some((w) => tb.has(w)));

const SRC_RANK = { us: 0, uk: 1, au: 2 };
// one song per row: first side of a double A-side, no remix tags; lead act only ("Saja Boys: A, B" -> "Saja Boys")
const cleanTitle = (t) => String(t).split(/ \/ |(?<=\w{4})\/(?=\w{4})/)[0].replace(/\s*\([^)]*(?:mix|edit|version)\)\s*$/i, '').trim();
const cleanArtist = (a) => leadOf(a).replace(/:\s.*$/, '').split(/(?<=[^/\s]{3})\/(?=[^/\s]{3})/)[0].trim();
function groupCharts() {
  const groups = [];
  const byTitle = new Map();
  for (const c of COUNTRIES) {
    for (const [y, rows] of Object.entries(C[c])) {
      for (const [rank, title, artist, tLink, aLink] of rows) {
        const tk = titleKey(title), ak = artistKey(artist);
        if (!tk || !ak) continue;
        const cands = byTitle.get(tk.slice(0, 4)) || [];
        const at = tokens(artist);
        let g = cands.find((x) => sameTitle(x.tk, tk) && sameArtist(x.ak, ak, x.at, at) && [...x.years].some((yy) => Math.abs(yy - y) <= 2));
        const wiki = !/^https:\/\/www\.(aria|officialcharts)/.test(C.src[c][y]);
        if (!g) {
          g = { tk, ak, at: new Set(), title, artist, tLink: '', aLink: '', years: new Set(), best: {}, first: +y, srcPri: 9 };
          groups.push(g);
          cands.push(g);
          byTitle.set(tk.slice(0, 4), cands);
        }
        g.years.add(+y);
        for (const w of at) g.at.add(w);
        g.first = Math.min(g.first, +y);
        if (!g.best[c] || rank < g.best[c]) g.best[c] = rank;
        // display names: a Wikipedia row (proper casing) beats ARIA/Official Charts; the US list beats UK beats AU
        const pri = (wiki ? 0 : 3) + SRC_RANK[c];
        if (pri < g.srcPri) { g.srcPri = pri; g.title = cleanTitle(title); g.artist = cleanArtist(artist); }
        if (tLink && !g.tLink) g.tLink = tLink;
        if (aLink && !g.aLink) g.aLink = aLink;
      }
    }
  }
  return groups;
}

// chart score: 1 for a year-end #1, falling to 0.01 at #100, summed over countries
const chartScore = (b) => COUNTRIES.reduce((s, c) => s + (b[c] ? Math.max(0.01, 1 - (b[c] - 1) / 100) : 0), 0);

// --- Wikipedia pageviews (last 12 full months) ---
const PV_F = path.join(CACHE, 'pv.json');
const pv = fs.existsSync(PV_F) ? JSON.parse(fs.readFileSync(PV_F, 'utf8')) : {};
async function pageviews(title) {
  if (title in pv) return pv[title];
  const t = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/2025090100/2026083100`;
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (r.status === 404) { pv[title] = 0; break; }
      if (!r.ok) { await sleep(1500 * (i + 1)); continue; }
      const j = await r.json();
      const items = j.items || [];
      pv[title] = items.length ? Math.round(items.reduce((s, x) => s + x.views, 0) / items.length) : 0;
      break;
    } catch { await sleep(2000); }
  }
  await sleep(40);
  return pv[title] ?? 0;
}

// Wikipedia redirects resolve the link target (so pageviews count the real article, not the redirect)
const RD_F = path.join(CACHE, 'redirects.json');
const rd = fs.existsSync(RD_F) ? JSON.parse(fs.readFileSync(RD_F, 'utf8')) : {};
async function resolveTitles(titles) {
  const todo = [...new Set(titles.filter((t) => t && !(t in rd)))];
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(chunk.join('|'))}`;
    const j = await (await fetch(u, { headers: { 'user-agent': UA } })).json();
    const map = new Map(chunk.map((t) => [t, t]));
    for (const n of j.query?.normalized || []) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
    for (const r of j.query?.redirects || []) for (const [k, v] of map) if (v === r.from) map.set(k, r.to);
    const pages = Object.values(j.query?.pages || {});
    for (const [k, v] of map) {
      const p = pages.find((x) => x.title === v);
      rd[k] = p && !('missing' in p) ? { t: v, q: p.pageprops?.wikibase_item || '' } : { t: '', q: '' };
    }
    await sleep(200);
  }
  fs.writeFileSync(RD_F, JSON.stringify(rd));
}

// --- existing lists ---
function readLists() {
  const out = {};
  for (const d of DECADES) {
    const f = path.join(LISTS, `hits-${d}.txt`);
    const text = fs.readFileSync(f, 'utf8');
    const heads = text.split('\n').filter((l) => /^[@#]/.test(l.trim()));
    const { rows } = parseList(text);
    out[d] = { heads, rows: rows.map(([y, artist, title, a, b]) => {
      const chartCol = a && /^(us|uk|au|pv|from)=/.test(a) ? a : '';
      return { year: +y, artist, title, opts: chartCol ? (b || '') : (a || ''), old: true };
    }) };
  }
  return out;
}

const fmtChart = (s) => [...COUNTRIES.map((c) => `${c}=${s.best[c] || '-'}`), `pv=${s.pv ?? 0}`, s.from ? `from=${s.from}` : ''].filter(Boolean).join(' ');

async function main() {
  const groups = groupCharts();
  console.log(`${groups.length} distinct chart songs`);
  const lists = readLists();
  const taken = new Set();
  // match existing rows to chart songs
  for (const d of DECADES) {
    for (const r of lists[d].rows) {
      const tk = titleKey(r.title), ak = artistKey(r.artist);
      const g = groups.find((x) => !taken.has(x) && sameTitle(x.tk, tk) && sameArtist(x.ak, ak, x.at, tokens(r.artist)) && Math.abs(x.first - r.year) <= 3)
        || groups.find((x) => !taken.has(x) && sameTitle(x.tk, tk) && Math.abs(x.first - r.year) <= 2 && x.ak.split(' ')[0].slice(0, 4) === ak.split(' ')[0].slice(0, 4));
      if (g) { taken.add(g); r.g = g; } else r.g = null;
    }
  }
  const unmatched = DECADES.flatMap((d) => lists[d].rows.filter((r) => !r.g).map((r) => `${r.year} ${r.artist} — ${r.title}`));
  console.log(`existing rows: ${DECADES.reduce((s, d) => s + lists[d].rows.length, 0)}, not on any year-end chart: ${unmatched.length}`);
  unmatched.forEach((u) => console.log('  (no chart) ' + u));

  // candidates per year, top by chart score; pageviews for the shortlist only
  const free = groups.filter((g) => !taken.has(g));
  const byYear = new Map();
  for (const g of free) { g.cs = chartScore(g.best); if (!byYear.has(g.first)) byYear.set(g.first, []); byYear.get(g.first).push(g); }
  const shortlist = [];
  for (const [, list] of byYear) shortlist.push(...list.sort((a, b) => b.cs - a.cs).slice(0, 45));
  const all = [...shortlist, ...[...taken]];
  await resolveTitles(all.map((g) => g.tLink).filter(Boolean));
  let n = 0, next = 0;
  const worker = async () => {
    while (next < all.length) {
      const g = all[next++];
      const t = g.tLink && rd[g.tLink]?.t;
      g.pv = t ? await pageviews(t) : 0;
      g.songQ = t ? rd[g.tLink].q : '';
      if (++n % 500 === 0) { fs.writeFileSync(PV_F, JSON.stringify(pv)); console.log(`  pageviews ${n}/${all.length}`); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  fs.writeFileSync(PV_F, JSON.stringify(pv));

  // final score: charts + lasting fame (log pageviews; 30k/month ≈ +1)
  const fame = (g) => (g.pv > 0 ? Math.max(0, Math.log10(g.pv) - 2.5) / 2 : 0);
  for (const g of all) g.score = (g.cs || chartScore(g.best)) + fame(g);
  const report = [];
  for (const d of DECADES) {
    const y0 = +d.slice(0, 4);
    const rows = lists[d].rows;
    for (let y = y0; y < y0 + 10 && y <= 2025; y++) {
      const have = rows.filter((r) => r.year === y).length;
      // a re-entry of a song already listed (reissues, Christmas songs, TikTok revivals) is not a new hit
      const reentry = (g) => DECADES.some((dd) => lists[dd].rows.some((r) => sameTitle(titleKey(r.title), g.tk) && sameArtist(artistKey(r.artist), g.ak, tokens(r.artist), g.at)))
        || groups.some((x) => x !== g && x.first < g.first - 2 && sameTitle(x.tk, g.tk) && sameArtist(x.ak, g.ak, x.at, g.at));
      const pool = (byYear.get(y) || []).filter((g) => !taken.has(g) && g.score > 0 && !reentry(g)).sort((a, b) => b.score - a.score);
      const add = [];
      for (const g of pool) { if (add.length >= PER - have) break; if (!add.some((x) => sameTitle(x.tk, g.tk) && sameArtist(x.ak, g.ak, x.at, g.at))) add.push(g); }
      for (const g of add) { taken.add(g); rows.push({ year: y, artist: g.artist, title: g.title, opts: g.srcPri >= 3 ? 'nm=apple' : '', g, old: false }); }
      report.push(`${y}: had ${have}, +${add.length}`);
    }
  }
  console.log(report.join('  '));
  if (DRY) {
    for (const d of DECADES) console.log(d, lists[d].rows.length);
    for (const r of lists['1990s'].rows.filter((r) => !r.old).slice(0, 60)) console.log(`  ${r.year} | ${r.artist} | ${r.title} | ${r.g ? fmtChart(r.g) : ''}  score=${r.g.score.toFixed(2)}`);
    return;
  }
  await writeLists(lists);
}

const SOURCES = (d) => {
  const y0 = d.slice(0, 4);
  return JSON.stringify([
    { name: `Billboard Year-End Hot 100 singles (${d})`, url: `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${y0}` },
    { name: 'UK year-end best-selling singles (Music Week / Official Charts Company)', url: +y0 >= 2000 ? 'https://www.officialcharts.com/charts/end-of-year-singles-chart/' : `https://en.wikipedia.org/wiki/${y0}_in_British_music` },
    { name: +y0 >= 1990 ? 'ARIA year-end singles chart' : 'Kent Music Report / ARIA year-end top 25 singles (Australia)', url: +y0 >= 1990 ? `https://www.aria.com.au/charts/${y0}/singles-chart` : `https://en.wikipedia.org/wiki/List_of_top_25_singles_for_${y0}_in_Australia` },
    { name: 'Wikipedia pageviews (lasting fame) and Wikidata (artist country)', url: 'https://www.wikidata.org/' },
  ]);
};
const DUO = /\s(&|and|x|vs\.?|with)\s|,/i;
const ACT = { m: 'Male solo artist', f: 'Female solo artist' };

async function writeLists(lists) {
  const rows = DECADES.flatMap((d) => lists[d].rows);
  const who = rows.map((r) => ({ name: leadOf(r.artist), link: r.g?.aLink || '' }));
  const uniq = [...new Map(who.map((w) => [w.name + '|' + w.link, w])).values()];
  const info = new Map();
  for (let i = 0; i < uniq.length; i += 200) {
    const m = await artists(uniq.slice(i, i + 200));
    for (const w of uniq.slice(i, i + 200)) info.set(w.name + '|' + w.link, m.get(w.name));
  }
  const actsF = path.join(LISTS, 'acts.json');
  const acts = JSON.parse(fs.readFileSync(actsF, 'utf8'));
  let newActs = 0, noCountry = [];
  for (const r of rows) {
    const i = info.get(leadOf(r.artist) + '|' + (r.g?.aLink || ''));
    r.from = i?.iso?.length ? i.iso.join('/') : '';
    if (!r.from) noCountry.push(`${r.year} ${r.artist} — ${r.title}`);
    if (!r.old && i && !(r.artist in acts.artists) && !DUO.test(r.artist)) {
      const act = i.kind === 'group' ? 'Group or duo' : i.kind === 'human' ? ACT[i.sex] : null;
      if (act) { acts.artists[r.artist] = act; newActs++; }
    }
  }
  acts.artists = Object.fromEntries(Object.entries(acts.artists).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(actsF, JSON.stringify(acts, null, 1) + '\n');
  for (const d of DECADES) {
    const L = lists[d];
    const heads = L.heads.map((h) => (h.startsWith('@sources') ? `@sources ${SOURCES(d)}` : h)).filter((h) => !h.startsWith('# chart'));
    heads.push('# chart column: best year-end position us/uk/au (- = not on that year-end chart), pv = monthly Wikipedia views of the song, from = artist country (Wikidata ISO3)');
    const out = L.rows.sort((a, b) => a.year - b.year || (b.old - a.old) || ((b.g?.score || 0) - (a.g?.score || 0)))
      .map((r) => { const ch = fmtChart({ best: r.g?.best || {}, pv: r.g?.pv ?? 0, from: r.from }); return [r.year, r.artist, r.title, ch, r.opts].filter((x, k) => k < 4 || x).join(' | '); });
    fs.writeFileSync(path.join(LISTS, `hits-${d}.txt`), heads.join('\n') + '\n' + out.join('\n') + '\n');
    console.log(`wrote hits-${d}.txt: ${out.length} rows`);
  }
  console.log(`new acts ${newActs}; no artist country for ${noCountry.length}`);
  noCountry.forEach((x) => console.log('  (no country) ' + x));
}

async function pageviewsOf(g) {
  if (!g.tLink) return 0;
  await resolveTitles([g.tLink]);
  const t = rd[g.tLink]?.t;
  const v = t ? await pageviews(t) : 0;
  fs.writeFileSync(PV_F, JSON.stringify(pv));
  return v;
}

export { main as pick, pageviewsOf, fmtChart, groupCharts, titleKey, artistKey, sameTitle, sameArtist, readLists, DECADES, COUNTRIES };
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
