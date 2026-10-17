#!/usr/bin/env node
// Resolve curated song lists (tools/au_lists/*.txt) to iTunes previews and write data/music/<id>.json.
//   node tools/au_resolve.mjs [listName ...] [--refresh] [--report]
// List line formats (# comments, blank lines ignored; header lines "@key value"):
//   songs:   YEAR | Artist | Title [| us=1 uk=4 au=12 pv=8100 from=USA] [| q=search terms; am=artist regex; tm=title regex; d=1..3; alt=a/b; kids=0; nm=apple; note=...]
//            The optional chart column (tools/au_pick.mjs writes it) holds best year-end positions, monthly Wikipedia
//            views and the artist's country; it sets facts.charts / facts.artistCountry and the difficulty (unless d=).
//   artists: Artist | origin | decade | Song A ; Song B [| d=1..3; alt=a/b; am=artist regex]
// Every match is verified: artist + title fuzzy match, karaoke/cover/live/remix rejected, earliest release chosen,
// and the curated year compared with Apple's earliest release (|diff| > 1 is reported and the item dropped
// unless the line has note=keepyear with a reason).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTS = path.join(ROOT, 'tools/au_lists');
const OUT = path.join(ROOT, 'data/music');
// search cache lives outside the repo (it is ~20 MB)
const CACHE_F = process.env.AU_CACHE || path.join(os.homedir(), '.cache/clued-au/itunes.json');
fs.mkdirSync(path.dirname(CACHE_F), { recursive: true });
const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const only = args.filter((a) => !a.startsWith('--'));
const cache = fs.existsSync(CACHE_F) ? JSON.parse(fs.readFileSync(CACHE_F, 'utf8')) : {};
const saveCache = () => fs.writeFileSync(CACHE_F, JSON.stringify(cache));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function itunes(params) {
  const qs = new URLSearchParams({ media: 'music', entity: 'song', limit: '50', country: 'US', ...params }).toString();
  const key = qs;
  if (!REFRESH && cache[key]) return cache[key];
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = lastCall + 3300 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const r = await fetch('https://itunes.apple.com/search?' + qs);
      if (r.status === 403 || r.status === 429 || r.status >= 500) { await sleep(20000 * (attempt + 1)); continue; }
      const j = await r.json();
      cache[key] = (j.results || []).map((t) => pickFields(t));
      saveCache();
      return cache[key];
    } catch (e) { await sleep(5000); }
  }
  throw new Error('itunes failed: ' + qs);
}
const pickFields = (t) => ({
  trackId: t.trackId, artistName: t.artistName, trackName: t.trackName, collectionName: t.collectionName,
  previewUrl: t.previewUrl, artworkUrl100: t.artworkUrl100, trackViewUrl: t.trackViewUrl,
  releaseDate: t.releaseDate, trackTimeMillis: t.trackTimeMillis, kind: t.kind, collectionArtistName: t.collectionArtistName,
  trackExplicitness: t.trackExplicitness,
});

export const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’'`]/g, '').replace(/&/g, ' and ').replace(/\bfeat(uring)?\.?\b.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const stripExtras = (s) => String(s || '').replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, '');
const bigrams = (s) => { const b = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); b.set(g, (b.get(g) || 0) + 1); } return b; };
export function dice(a, b) {
  a = a.replace(/ /g, ''); b = b.replace(/ /g, '');
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b); let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}
const BAD = /karaoke|tribute|made famous|in the style of|originally performed|cover version|instrumental version|re-?recorded|taylor.?s version|sped up|slowed|lullaby|8-bit|music box|backing track|workout|remake|piano version|acoustic|demo\b|edit by|live at|live from|\blive\b|remix|\bmix\)|re-?record|rendition|as made popular|from the motion picture.*cover|a cappella|orchestral version|orchestral album|new studio recording|\bmix\b|symphonic|string quartet|re-?imagined|\bredux\b|unplugged|\bstripped\b|\bcover\b|originally by|christmas version|\b(19|20)\d\d version\b|\bversion 20\d\d\b|nightcore|\b8d\b|lo-?fi version|tiktok version|\bspanglish\b/i;
const BAD_ARTIST = /karaoke|tribute|the hit crew|starlite|party band|cover band|ameritz|vitamin string|piano tribute|lullaby|countdown singers|sound-alike|chart hits|the original hits|top hits|hit masters|orchestra of the|kidz bop|studio allstars|soundtrack wonder band/i;
const theRm = (s) => s.replace(/^the /, '');

export function scoreTrack(t, want) {
  if (t.kind && t.kind !== 'song') return null;
  if (!t.previewUrl) return null;
  const tn = norm(stripExtras(t.trackName)), wt = norm(stripExtras(want.title));
  const titleOk = want.tm ? new RegExp(want.tm, 'i').test(t.trackName) : (tn === wt || dice(tn, wt) >= 0.88 || (tn.startsWith(wt) && wt.length >= 6));
  if (!titleOk) return null;
  const an = theRm(norm(t.artistName)), wa = theRm(norm(want.artist));
  const artistOk = want.am ? new RegExp(want.am, 'i').test(t.artistName) :
    (an === wa || an.startsWith(wa + ' ') || an.includes(' ' + wa) || an.startsWith(wa) || dice(an, wa) >= 0.82 ||
      wa.split(' and ').every((p) => an.includes(theRm(p.trim()))));
  if (!artistOk) return null;
  const extras = (t.trackName + ' ' + t.collectionName);
  if (!want.allowExtras && BAD.test(extras.replace(want.title, ''))) return null;
  if (BAD_ARTIST.test(t.artistName)) return null;
  return { t, year: +String(t.releaseDate || '9999').slice(0, 4), exact: tn === wt ? 1 : 0 };
}

const COMPILATION = /greatest|best of|hits|collection|essential|anthology|now that|ultimate|gold\b|classics|years|world of|decade|various|compilation|\d0s|the very best/i;
export function best(results, want, year) {
  const ok = results.map((t) => scoreTrack(t, want)).filter(Boolean);
  if (!ok.length) return null;
  const comp = (x) => (COMPILATION.test(x.t.collectionName) ? 1 : 0);
  // compilations carry bogus dates, so the verifying candidate must sit within a year of the curated one;
  // prefer an exact year, then an original album, then the earliest
  const near = year ? ok.filter((x) => Math.abs(x.year - year) <= 1) : ok;
  const pool = near.length ? near : ok;
  const rem = (x) => (/remaster/i.test(x.t.trackName + ' ' + x.t.collectionName) ? 1 : 0);
  pool.sort((a, b) => (year ? Math.abs(a.year - year) - Math.abs(b.year - year) : 0) || b.exact - a.exact || comp(a) - comp(b) || rem(a) - rem(b) || a.year - b.year);
  const r = pool[0];
  r.near = near.length > 0;
  r.originals = ok.filter((x) => !comp(x)).map((x) => x.year).sort()[0];
  return r;
}

const art = (u) => (u ? u.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/300x300bb.$2') : '');
export const slug = (s) => norm(s).replace(/ /g, '-').slice(0, 60);
const decade = (y) => `${Math.floor(y / 10) * 10}s`;

function parseOpts(s) {
  const o = {};
  for (const part of (s || '').split(';')) {
    const m = part.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/);
    if (m) o[m[1]] = m[2];
  }
  return o;
}

export function parseList(text) {
  const head = {}, rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('@')) { const [k, ...v] = line.slice(1).split(/\s+/); head[k] = v.join(' '); continue; }
    rows.push(line.split('|').map((x) => x.trim()));
  }
  return { head, rows };
}

const audioObj = (t, artist, title) => ({
  src: t.previewUrl,
  credit: `${artist}: 30-second preview courtesy of Apple Music`,
  license: 'Apple Music preview (streamed, not stored)',
  page: t.trackViewUrl,
  apple: { trackId: t.trackId, url: t.trackViewUrl, art: art(t.artworkUrl100), term: `${t.artistName} ${stripExtras(t.trackName)}` },
  dur: 30,
});

// Apple spells some acts differently
const ALIAS = { Pink: 'P!nk', Huntrix: 'HUNTR/X', 'Little Stevie Wonder': 'Stevie Wonder' };
async function resolveSong(want, year) {
  if (ALIAS[want.artist] && !want.am) want = { ...want, am: '^' + ALIAS[want.artist].replace(/[.*+?^${}()|[\]\\/!]/g, '\\$&') + '|^' + want.artist };
  const terms = want.q || `${ALIAS[want.artist] || want.artist} ${stripExtras(want.title)}`;
  let res = await itunes({ term: terms });
  let b = best(res, want, year);
  if (!b && !want.q) { res = await itunes({ term: stripExtras(want.title), attribute: 'songTerm' }); b = best(res, want, year); }
  if (b) b.cc = 'US';
  if (!b || (year && !b.near)) { const r2 = await itunes({ term: terms, country: 'GB' }); const b2 = best(r2, want, year); if (b2 && (!b || b2.near)) { b = b2; b.cc = 'GB'; } }
  // Australian-only hits (Kent/ARIA charts) are often missing from the US and UK stores
  if (want.au && (!b || (year && !b.near))) { const r3 = await itunes({ term: terms, country: 'AU' }); const b3 = best(r3, want, year); if (b3 && (!b || b3.near)) { b = b3; b.cc = 'AU'; } }
  // duet credits ("Elton John and Dua Lipa") rarely match as a search term: search the first act, and accept a track
  // whose artist starts with it
  const first = String(want.artist).split(/\s(?:&|and|x|vs\.?)\s|,\s/i)[0];
  if (!b && !want.q && !want.am && first !== want.artist) {
    const w2 = { ...want, am: '^' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
    for (const cc of ['US', 'GB']) { const r = await itunes({ term: `${first} ${stripExtras(want.title)}`, country: cc }); const b4 = best(r, w2, year); if (b4) { b = b4; b.cc = cc; break; } }
  }
  return b;
}

// act of the credited lead artist (tools/au_lists/acts.json); songs{} can override one "Artist — Title" (null = leave out)
const ACTS = JSON.parse(fs.readFileSync(path.join(LISTS, 'acts.json'), 'utf8'));
const actOf = (artist, title) => { const k = `${artist} — ${title}`; return k in ACTS.songs ? ACTS.songs[k] : ACTS.artists[artist]; };
// first release by the same act (tools/music_firstyear.mjs): a year-end chart year can be a re-release or re-chart
// (Bohemian Rhapsody 1992), so "Artist — Title" -> { year, charted } replaces it; covers by another act keep their own year
const FIRST = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/music_firstyear.json'), 'utf8')).songs || {}; } catch { return {}; } })();
export const firstYearOf = (artist, title) => FIRST[`${artist} — ${title}`] || null;

// chart column: "us=1 uk=- au=12 pv=8100 from=GBR/AUS"
export function parseChart(s) {
  const out = { charts: {}, pv: 0, from: [] };
  for (const m of String(s || '').matchAll(/(\w+)=(\S+)/g)) {
    if (['us', 'uk', 'au'].includes(m[1]) && /^\d+$/.test(m[2])) out.charts[m[1]] = +m[2];
    else if (m[1] === 'pv') out.pv = +m[2] || 0;
    else if (m[1] === 'from') out.from = m[2].split('/').filter((c) => /^[A-Z]{3}$/.test(c));
  }
  return out;
}
const isChartCol = (s) => /^(us|uk|au|pv|from)=/.test(String(s || '').trim());
// year-end top 10 anywhere = 1, top 40 = 2, else 3; lasting fame (pageviews ranked within the pack; no article = middle)
// moves it a step: top 15 % easier, a top-10 hit in the bottom 45 % or a #21-40 hit in the bottom 30 % harder
export function fameDifficulty(charts, pv, pvRank) {
  const best = Math.min(...Object.values(charts), 999);
  let d = best <= 10 ? 1 : best <= 40 ? 2 : 3;
  if (pvRank >= 0.85) d = Math.max(1, d - 1);
  else if (pvRank < 0.45 && d === 1) d = 2;
  else if (pvRank < 0.3 && d === 2 && best > 20) d = 3;
  return d;
}
// kids mode only ever sees difficulty-1 items (js/core/spec.js kidsOk), so explicit or edgy songs never go below 2
export const EDGY = /\bsex|f\*+k|fuck|sh\*t|\bshit|bitch|\bwhore|\bhoe\b|\bnaked|\bbooty|\bdrunk|cocaine|\bweed\b|\bp\.?i\.?m\.?p\b|talk dirty|\bkill(ing)? (you|him|her)|\bwap\b/i;
const COUNTRY_NAME = { US: 'the US', UK: 'the UK', AU: 'Australia' };
const chartLine = (c) => Object.entries(c).map(([k, v]) => `${COUNTRY_NAME[k.toUpperCase()]} #${v}`).join(', ');

// pairs: [{ id: trackId, cc: store }] -> Map(trackId -> explicit?). A 'cleaned' track is a radio edit of an explicit song:
// fine for adults, still not a kids' song.
async function explicitness(pairs) {
  const by = {};
  for (const p of pairs) (by[p.cc || 'US'] ||= []).push(p.id);
  const out = new Map();
  for (const [cc, list] of Object.entries(by)) {
    for (let i = 0; i < list.length; i += 150) {
      const ids = list.slice(i, i + 150).join(',');
      const key = `lookup:${cc}:${ids}`;
      if (!cache[key]) {
        await sleep(Math.max(0, lastCall + 3300 - Date.now())); lastCall = Date.now();
        const r = await fetch(`https://itunes.apple.com/lookup?id=${ids}&country=${cc}&entity=song`);
        const j = await r.json();
        cache[key] = (j.results || []).map((t) => ({ trackId: t.trackId, e: t.trackExplicitness, c: t.collectionExplicitness }));
        saveCache();
      }
      for (const t of cache[key]) out.set(t.trackId, t.e === 'explicit' || t.e === 'cleaned');
    }
  }
  return out;
}

async function buildSongs(head, rows, report) {
  const items = [], dropped = [], offby = [];
  const pvs = rows.map((r) => (isChartCol(r[3]) ? parseChart(r[3]).pv : 0)).filter((x) => x > 0).sort((a, b) => a - b);
  const pvRank = (v) => (v > 0 && pvs.length ? pvs.filter((x) => x <= v).length / pvs.length : 0.5);
  for (const row of rows) {
    const [y, artist0, title0] = row;
    const chartCol = isChartCol(row[3]) ? row[3] : '';
    const o = parseOpts(chartCol ? row[4] : row[3]), chartYear = +y;
    let year = chartYear;
    const ch = chartCol ? parseChart(chartCol) : null;
    const want = { title: title0, artist: artist0, q: o.q, am: o.am, tm: o.tm, allowExtras: o.extras === '1', au: !!ch?.charts.au && !ch.charts.us };
    const b = await resolveSong(want, chartYear);
    if (!b) { dropped.push(`NO MATCH  ${year} ${artist0} — ${title0}`); continue; }
    const keep = (o.note || '').startsWith('keepyear');
    // an album track that charted as a single 2-3 years later: the original album's year, within the same decade
    if (ch && !b.near && !keep && b.year < chartYear && b.year >= chartYear - 3 && decade(b.year) === decade(chartYear) && !COMPILATION.test(b.t.collectionName)) { b.near = true; year = b.year; }
    if (!b.near && head.kind !== 'themes' && !keep) {
      dropped.push(`YEAR ${year} vs apple ${b.year}  ${artist0} — ${title0}  [${b.t.collectionName}]`);
      continue;
    }
    // a year-end chart counts a December single in the next year: an original (non-compilation) album a year
    // earlier is the release year
    if (ch && !keep && b.near && b.year === chartYear - 1 && decade(b.year) === decade(chartYear) && !COMPILATION.test(b.t.collectionName)) year = b.year;
    const first = head.kind !== 'themes' && !keep ? firstYearOf(artist0, title0) : null;
    if (first) year = first.year;
    const fromApple = o.nm === 'apple';
    const title = fromApple ? stripExtras(b.t.trackName).trim() : title0;
    const artist = fromApple ? b.t.artistName.replace(/\s*[,&]\s.*$|\s+(feat\.?|featuring|ft\.?|with)\s.*$/i, '').trim() : artist0;
    if (head.kind !== 'themes' && !first && (b.year !== year || (b.originals && b.originals < year - 1))) offby.push(`${year} apple ${b.year} (earliest original ${b.originals ?? '-'})  ${artist} — ${title}  [${b.t.collectionName}]`);
    const theme = head.kind === 'themes';
    const id = slug(theme ? o.film : `${title} ${artist}`);
    if (!id || items.some((i) => i.id === id)) continue;
    const facts = theme ? { composer: o.composer || artist, year, decade: decade(year), track: title, type: o.type || 'film' }
      : { artist, year, decade: decade(year), ...(actOf(artist, title) ? { act: actOf(artist, title) } : {}) };
    // item-level data, not facts: no format may word a question from them (the shared schema also rejects objects
    // in facts); LOCAL reads them for "charted in" / "made in" rounds
    const data = {};
    if (ch && Object.keys(ch.charts).length) data.charts = ch.charts;
    if (ch?.from.length) { data.artistCountry = ch.from[0]; if (ch.from.length > 1) data.artistCountries = ch.from; }
    const short = stripExtras(title).trim();
    const alt = o.alt ? o.alt.split('/') : (!theme && short !== title && short.length >= 3 ? [short] : undefined);
    const hasCharts = ch && Object.keys(ch.charts).length;
    // first.blurb (a hand sentence) words a re-recording or remix credited to a team-up ("Elvis vs JXL") truthfully
    const tail = !hasCharts ? '' : first?.blurb ? ` Year-end charts ${first.charted || chartYear}: ${chartLine(ch.charts)}.` : first ? `; year-end charts ${first.charted || chartYear}: ${chartLine(ch.charts)}.` : ` Year-end charts: ${chartLine(ch.charts)}.`;
    items.push({
      id, name: theme ? o.film : title, alt,
      group: theme ? (o.type || 'film') : decade(year),
      facts, ...data,
      blurb: o.blurb || (theme ? `"${title}" from ${o.film} (${year}), by ${o.composer || artist}.` : (first?.blurb ? first.blurb + tail : `"${title}" by ${artist}, released in ${year}${first && hasCharts ? '' : '.'}${tail}`)),
      media: { audio: [audioObj(b.t, artist)] },
      difficulty: +(o.d || (ch && Object.keys(ch.charts).length ? fameDifficulty(ch.charts, ch.pv, pvRank(ch.pv)) : 0) || head.difficulty || 2),
      _cc: b.cc, _pv: ch?.pv || 0, _noKids: o.kids === '0' || EDGY.test(title),
      _check: { ...(first ? { chartYear, firstYear: first.year } : {}), appleYear: b.year, album: b.t.collectionName, appleArtist: b.t.artistName, appleTitle: b.t.trackName, store: b.cc },
    });
    if (report) console.log(`ok  ${year} (apple ${b.year})  ${artist} — ${title}  →  ${b.t.artistName} — ${b.t.trackName} [${b.t.collectionName}]`);
  }
  // two songs with one title in a pack (covers, "I Like It") can't be told apart in a "name this song" question:
  // keep the better-known one
  const bestRank = (it) => Math.min(...Object.values(it.charts || {}), 999);
  for (const it of [...items]) {
    if (!items.includes(it)) continue;
    const twin = items.find((x) => x !== it && norm(x.name) === norm(it.name));
    if (!twin) continue;
    const lose = ((twin._pv || 0) - (it._pv || 0) || it.facts.year - twin.facts.year || it.difficulty - twin.difficulty) > 0 ? it : twin;   // a shared article (a cover) keeps the original
    items.splice(items.indexOf(lose), 1);
    dropped.push(`SAME TITLE  ${lose.facts.year} ${lose.facts.artist} — ${lose.name} (kept the ${(lose === it ? twin : it).facts.artist} song)`);
  }
  // explicit (Apple) or edgy titles never reach kids mode
  const ex = await explicitness(items.filter((it) => it.media.audio[0].apple).map((it) => ({ id: it.media.audio[0].apple.trackId, cc: it._cc })));
  for (const it of items) {
    if (ex.get(it.media.audio[0].apple.trackId)) it.explicit = true;
    if ((it.explicit || it._noKids) && it.difficulty < 2) { it._check.kidsFloor = it.difficulty; it.difficulty = 2; }
    if (it._noKids) it.kids = false;
    if (it.explicit) it.kids = false;
  }
  return { items, dropped, offby };
}

async function buildArtists(head, rows, report) {
  const items = [], dropped = [];
  for (const [artist, origin, dec, songs, optStr] of rows) {
    const o = parseOpts(optStr);
    const audio = [], titles = [];
    for (const title of songs.split(';').map((s) => s.trim()).filter(Boolean)) {
      const b = await resolveSong({ title, artist, am: o.am });
      if (!b) { dropped.push(`NO MATCH  ${artist} — ${title}`); continue; }
      const a = audioObj(b.t, artist);
      a.title = title;
      a._cc = b.cc;
      audio.push(a); titles.push(title);
      if (report) console.log(`ok  ${artist} — ${title}  →  ${b.t.artistName} — ${b.t.trackName} [${b.t.collectionName}, ${b.year}]`);
    }
    if (!audio.length) continue;
    // explicit previews go when the act has a clean one; an all-explicit act never reaches kids mode
    const ex = await explicitness(audio.map((a) => ({ id: a.apple.trackId, cc: a._cc })));
    const clean = audio.filter((a) => !ex.get(a.apple.trackId));
    const keepAudio = (clean.length ? clean : audio).map(({ _cc, ...a }) => a);
    const dropT = new Set(audio.filter((a) => !keepAudio.some((k) => k.apple.trackId === a.apple.trackId)).map((a) => a.title));
    if (dropT.size) dropped.push(`EXPLICIT preview left out  ${artist} — ${[...dropT].join(' ; ')}`);
    titles.splice(0, titles.length, ...titles.filter((t) => !dropT.has(t)));
    audio.splice(0, audio.length, ...keepAudio);
    const allExplicit = !clean.length;
    items.push({
      id: slug(artist), name: artist, alt: o.alt ? o.alt.split('/') : undefined,
      group: dec,
      facts: { origin, decade: dec, songs: titles.join(' · ') },
      blurb: `${artist} (${origin}), breakthrough in the ${dec}. Known for ${titles.map((t) => `"${t}"`).join(' and ')}.`,
      media: { audio },
      difficulty: allExplicit ? Math.max(2, +(o.d || 2)) : +(o.d || 2),
      ...(allExplicit ? { explicit: true, kids: false } : {}),
    });
  }
  return { items, dropped };
}

const FACTS_SONGS = {
  artist: { type: 'cat', label: 'Artist', ask: 'Who recorded {name}?', askReverse: 'Which of these songs is by {value}?', stmt: '{name} is by {value}.' },
  year: { type: 'year', label: 'Released', higherLabel: 'Newer', askHigh: 'Which of these songs came out most recently?', askLow: 'Which of these songs came out first?', askNumber: 'In what year did {name} come out?' },
  decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} come out?', askReverse: 'Which of these songs came out in the {value}?', stmt: '{name} came out in the {value}.' },
  act: { type: 'cat', label: 'Act', values: ['Male solo artist', 'Female solo artist', 'Group or duo', 'Duet or team-up'], ask: 'Who recorded {name}: a solo singer, a group or a team-up?', askReverse: 'Which of these hits is by {aValue}?', stmt: '{name} is by {aValue}.' },
};
const FACTS_THEMES = {
  // composer holds the writer for scores and the performer for songs, so the wording covers both
  composer: { type: 'cat', label: 'Composer / artist', noun: 'composer or performer', ask: 'Who wrote or performed the music from {name}?', askReverse: 'Which of these has music by {value}?', stmt: 'The music from {name} is by {value}.' },
  year: { type: 'year', label: 'Film or show year', noun: 'year', higherLabel: 'Newer', askHigh: 'Which of these came out most recently?', askLow: 'Which of these came out first?', askNumber: 'In what year did {name} come out?' },
  decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} come out?', askReverse: 'Which of these came out in the {value}?', stmt: '{name} came out in the {value}.' },
  track: { type: 'text', label: 'Track', noun: 'theme or song' },
  // values stay 'film' / 'tv' (listen.js reads them); no question is worded from them
  type: { type: 'cat', label: 'Film or TV', ask: false, stmt: false, display: { film: 'Film', tv: 'TV' } },
};
const FACTS_ARTISTS = {
  origin: { type: 'cat', label: 'From', noun: 'home country', ask: 'Where is {name} from?', askReverse: 'Which of these acts is from {value}?', stmt: '{name} is from {value}.' },
  decade: { type: 'cat', label: 'Breakthrough decade', ask: 'In which decade did {name} break through?', askReverse: 'Which of these acts broke through in the {value}?', stmt: '{name} broke through in the {value}.' },
  songs: { type: 'text', label: 'Known for' },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(LISTS).filter((f) => f.endsWith('.txt') && (!only.length || only.includes(f.replace(/\.txt$/, ''))));
  const report = args.includes('--report');
  for (const f of files) {
    const { head, rows } = parseList(fs.readFileSync(path.join(LISTS, f), 'utf8'));
    const kind = head.kind || 'songs';
    console.log(`\n== ${f}: ${rows.length} rows (${kind})`);
    const { items, dropped, offby = [] } = kind === 'artists' ? await buildArtists(head, rows, report) : await buildSongs(head, rows, report);
    dropped.forEach((d) => console.log('  DROP ' + d));
    offby.forEach((d) => console.log('  CHECK ' + d));
    const factsMeta = kind === 'artists' ? FACTS_ARTISTS : kind === 'themes' ? structuredClone(FACTS_THEMES) : structuredClone(FACTS_SONGS);
    if (head.yearLabel) factsMeta.year.label = head.yearLabel;

    const pack = {
      id: head.id, title: head.title, theme: 'music', icon: head.icon || '🎵', kids: head.kids === 'true', version: 1, ask: head.ask || undefined,
      notice: '30-second previews stream from Apple Music.',
      factsMeta, items: items.map(({ _check, _cc, _pv, _noKids, ...it }) => it), questions: [],
      sources: JSON.parse(head.sources || '[]').concat([{ name: 'Apple iTunes Search API (previews, artwork, links)', url: 'https://performance-partners.apple.com/search-api' }]),
      built: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(path.join(OUT, head.id + '.json'), JSON.stringify(pack, null, 1));
    fs.writeFileSync(path.join(ROOT, 'tools/au_lists', head.id + '.check.json'), JSON.stringify({ dropped, offby, items: items.map((i) => ({ id: i.id, ...i._check, year: i.facts?.year, d: i.difficulty, ...(i.explicit ? { explicit: true } : {}) })) }, null, 1));
    console.log(`  wrote ${items.length} items (${dropped.length} dropped)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
