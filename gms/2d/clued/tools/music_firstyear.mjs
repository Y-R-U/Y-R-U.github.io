#!/usr/bin/env node
// First-release year audit for the song packs (hits-*, one-hit-wonders). Year-end chart years carry re-releases and
// re-charts (Bohemian Rhapsody 1992), so the song's own first release by the SAME artist is looked up in two sources:
//   Wikidata: the song item's publication date (P577), plus earlier editions it points to (P629 edition of, P144 based
//             on, P155 follows) when they have the same title and performer;
//   MusicBrainz: the earliest first-release-date of the act's recordings with that title (no live/demo/remix takes).
// A song is corrected only when both sources say the same earlier year and Wikidata's performer is the item's artist;
// anything else is listed, not changed. Covers by a different act keep their own year.
//   node tools/music_firstyear.mjs [--write] [--only hits-1970s]
// Caches: ~/.cache/clued-au/firstyear/{wd,mb}.json. Output: tools/au_lists/firstyear.check.json (every song) and, with
// --write, tools/music_firstyear.json (adds agreed corrections, never removes one; "hand": true entries are not rewritten).
// au_resolve.mjs applies tools/music_firstyear.json on every build.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseList, norm } from './au_resolve.mjs';
import { groupCharts, titleKey, artistKey, sameTitle, sameArtist } from './au_pick.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTS = path.join(ROOT, 'tools/au_lists');
const CACHE = path.join(os.homedir(), '.cache/clued-au/firstyear');
fs.mkdirSync(CACHE, { recursive: true });
const UA = 'CluedTriviaBuilder/1.0 (https://games.br8t.com/gms/2d/clued/; support@br8t.com)';
const PACKS = ['hits-1960s', 'hits-1970s', 'hits-1980s', 'hits-1990s', 'hits-2000s', 'hits-2010s', 'hits-2020s', 'one-hit-wonders'];
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
const WD_F = path.join(CACHE, 'wd.json'), MB_F = path.join(CACHE, 'mb.json');
const wd = load(WD_F), mb = load(MB_F);
const rd = load(path.join(os.homedir(), '.cache/clued-au/redirects.json'));

async function getJSON(u, gap) {
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (r.ok) { await sleep(gap); return r.json(); }
      await sleep(2000 * (i + 1));
    } catch { await sleep(2000 * (i + 1)); }
  }
  throw new Error('fetch failed ' + u.slice(0, 140));
}

// --- Wikidata ---
const vals = (cl, p) => (cl[p] || []).filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue).map((c) => c.mainsnak.datavalue.value);
async function wdEntities(qs) {
  const todo = [...new Set(qs.filter((q) => q && !(q in wd && 'aka' in wd[q])))];
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels|aliases&languages=en|mul&ids=${chunk.join('|')}`, 200);
    for (const q of chunk) {
      const e = j.entities?.[q] || {}, cl = e.claims || {};
      const years = vals(cl, 'P577').filter((v) => v.precision >= 9).map((v) => +v.time.slice(1, 5)).filter(Boolean);
      wd[q] = {
        label: e.labels?.en?.value || e.labels?.mul?.value || '', aka: [...(e.aliases?.en || []), ...(e.aliases?.mul || [])].map((a) => a.value).slice(0, 8), p31: vals(cl, 'P31').map((v) => v.id), p175: vals(cl, 'P175').map((v) => v.id),
        years, rel: ['P629', 'P144', 'P155'].flatMap((p) => vals(cl, p).map((v) => v.id)),
      };
    }
    fs.writeFileSync(WD_F, JSON.stringify(wd));
  }
}
const labelOf = (q) => wd[q]?.label || '';
const namesOf = (q) => [labelOf(q), ...(wd[q]?.aka || [])].filter(Boolean);
const credits = (qs, artist) => qs.some((q) => namesOf(q).some((n) => actMatch(n, artist)));

// --- MusicBrainz (1 request per second) ---
const esc = (s) => String(s).replace(/["\\]/g, '\\$&');
const TAKE = /\b(live|demo|remix|mix|edit|instrumental|acoustic|karaoke|version|re-?record|rehearsal|session|alternate|take \d|mono|a cappella|unplugged|reprise|extended|dub|club|radio)\b/i;
async function mbFirst(artist, title) {
  const key = `${artist} — ${title}`;
  if (!(key in mb)) {
    const q = `recording:"${esc(title)}" AND artist:"${esc(artist)}"`;
    const j = await getJSON(`https://musicbrainz.org/ws/2/recording?fmt=json&limit=100&query=${encodeURIComponent(q)}`, 1100);
    mb[key] = (j.recordings || []).map((r) => ({
      t: r.title, d: r['first-release-date'] || '', dis: r.disambiguation || '', v: !!r.video,
      a: (r['artist-credit'] || []).map((c) => c.name + (c.joinphrase || '')).join(''),
    }));
    fs.writeFileSync(MB_F, JSON.stringify(mb));
  }
  return mb[key];
}

const leadAct = (a) => String(a).replace(/\s+(?:feat\.?|featuring|ft\.?|with|duet with)\s+.*$/i, '').split(/\s(?:&|and|x|vs\.?)\s|,\s/i)[0].trim();
const actMatch = (credit, artist) => {
  const a = artistKey(credit), b = artistKey(artist);
  if (!a || !b) return false;
  const sq = (s) => norm(s).replace(/ /g, '');
  return sameArtist(a, b) || norm(credit).includes(norm(leadAct(artist))) || sq(credit).startsWith(sq(leadAct(artist))) || sq(artist).startsWith(sq(leadAct(credit)));
};
const cleanT = (t) => norm(String(t).replace(/\s*[([][^)\]]*[)\]]/g, '')) || norm(t);

function mbYear(recs, artist, title) {
  const want = cleanT(title);
  const ok = recs.filter((r) => r.d && !r.v && !TAKE.test(r.dis) && !TAKE.test(r.t.replace(/^[^(]*/, '')) && cleanT(r.t) === want && actMatch(r.a, artist));
  const ys = ok.map((r) => +r.d.slice(0, 4)).filter(Boolean).sort((a, b) => a - b);
  if (!ys.length) return null;
  return { year: ys[0], n: ys.filter((y) => y === ys[0]).length, recs: ok.length };
}

function wdYear(q, artist, title) {
  const e = wd[q];
  if (!e) return null;
  const perf = e.p175.map(labelOf);
  const same = credits(e.p175, artist);
  const out = { q, label: e.label, years: e.years, performers: perf, same, year: e.years.length ? Math.min(...e.years) : null };
  // earlier editions of the same song by the same act
  for (const r of e.rel) {
    const x = wd[r];
    if (!x || !x.years.length || cleanT(x.label) !== cleanT(title)) continue;
    if (!credits(x.p175, artist)) continue;
    const y = Math.min(...x.years);
    if (out.year == null || y < out.year) { out.year = y; out.via = r; }
  }
  return out;
}

async function main() {
  const groups = groupCharts();
  const rows = [];
  for (const pack of PACKS) {
    if (arg('--only') && arg('--only') !== pack) continue;
    const { rows: rs } = parseList(fs.readFileSync(path.join(LISTS, pack + '.txt'), 'utf8'));
    const items = load(path.join(ROOT, 'data/music', pack + '.json')).items || [];
    const check = load(path.join(LISTS, pack + '.check.json')).items || [];
    for (const r of rs) {
      const [y, artist, title] = r;
      const tk = titleKey(title), ak = artistKey(artist);
      const g = groups.find((x) => sameTitle(x.tk, tk) && sameArtist(x.ak, ak) && Math.abs(x.first - y) <= 3);
      const it = items.find((i) => cleanT(i.name) === cleanT(title) && actMatch(i.facts.artist, artist));
      if (!it) continue;   // dropped by au_resolve
      const ck = check.find((c) => c.id === it.id) || {};
      const ys = g ? [...g.years].sort((a, b) => a - b) : [];
      rows.push({ pack, key: `${artist} — ${title}`, artist, title, chartYear: +y, charted: !ys.length ? String(y) : ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`, year: it.facts.year, id: it.id, tLink: g?.tLink || '', q: g?.tLink ? rd[g.tLink]?.q || '' : '', apple: { artist: ck.appleArtist, title: ck.appleTitle, album: ck.album, year: ck.appleYear } });
    }
  }
  console.log(`${rows.length} songs`);
  await wdEntities(rows.map((r) => r.q));
  await wdEntities(rows.flatMap((r) => [...(wd[r.q]?.rel || []), ...(wd[r.q]?.p175 || [])]));
  await wdEntities(rows.flatMap((r) => (wd[r.q]?.rel || []).flatMap((x) => wd[x]?.p175 || [])));
  let i = 0;
  for (const r of rows) {
    if (++i % 100 === 0) console.log(`  mb ${i}/${rows.length}`);
    r.wd = r.q ? wdYear(r.q, r.artist, r.title) : null;
    r.mb = mbYear(await mbFirst(leadAct(r.artist), titleKey(r.title) === norm(r.title) ? r.title : r.title.replace(/\s*[([][^)\]]*[)\]]/g, '')), r.artist, r.title);
  }
  const fix = [], disagree = [], later = [], cover = [];
  for (const r of rows) {
    const w = r.wd?.same ? r.wd.year : null, m = r.mb?.year ?? null;
    // a preview by another act (a cover) while the item names this one, or the item names an act Wikidata does not credit
    if (r.apple.artist && !actMatch(r.apple.artist, r.artist)) cover.push({ ...pick(r), why: `preview is by ${r.apple.artist}` });
    if (r.wd && r.wd.performers.length && !r.wd.same) cover.push({ ...pick(r), why: `Wikidata credits ${r.wd.performers.join(', ')}` });
    const wEarly = w != null && w < r.year, mEarly = m != null && m < r.year;
    if (wEarly && mEarly && w === m) fix.push({ ...pick(r), year: w, why: `Wikidata ${r.wd.via || r.wd.q} ${w}; MusicBrainz ${m} (${r.mb.n}/${r.mb.recs} recordings)` });
    else if (wEarly || mEarly) disagree.push({ ...pick(r), wd: r.wd ? (r.wd.same ? w : `other act ${r.wd.year}`) : null, mb: m });
    else if (w != null && m != null && w === m && w > r.year) later.push({ ...pick(r), wd: w, mb: m });
  }
  fs.writeFileSync(path.join(LISTS, 'firstyear.check.json'), JSON.stringify({ fix, disagree, later, cover, songs: rows.map((r) => ({ key: r.key, pack: r.pack, year: r.year, wd: r.wd, mb: r.mb, apple: r.apple })) }, null, 1));
  console.log(`fix ${fix.length}, disagree ${disagree.length}, later ${later.length}, cover/credit ${cover.length}`);
  for (const f of fix) console.log(`  FIX ${f.was} → ${f.year}  ${f.key}  [${f.pack}]  ${f.why}`);
  if (args.includes('--write')) {
    const OV = path.join(ROOT, 'tools/music_firstyear.json');
    const old = load(OV).songs || {};
    const songs = { ...old };   // a rerun sees the corrected years, so earlier entries always stay (delete one by hand)
    for (const f of fix) if (!songs[f.key]?.hand) songs[f.key] = { year: f.year, was: f.was, charted: f.charted, why: f.why };
    const out = { about: 'First-release year by the same act (tools/music_firstyear.mjs --write adds agreed corrections and never removes one). au_resolve.mjs sets facts.year, decade, group and the blurb from it; blurb = a hand first sentence; "hand": true = never rewritten by the audit.', songs: Object.fromEntries(Object.entries(songs).sort(([a], [b]) => a.localeCompare(b))) };
    fs.writeFileSync(OV, JSON.stringify(out, null, 1) + '\n');
    console.log(`wrote ${Object.keys(songs).length} overrides`);
  }
}
function pick(r) { return { pack: r.pack, key: r.key, was: r.year, chartYear: r.chartYear, charted: r.charted, q: r.q }; }

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
