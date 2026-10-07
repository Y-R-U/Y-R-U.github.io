#!/usr/bin/env node
// Resolve curated song lists (tools/au_lists/*.txt) to iTunes previews and write data/music/<id>.json.
//   node tools/au_resolve.mjs [listName ...] [--refresh] [--report]
// List line formats (# comments, blank lines ignored; header lines "@key value"):
//   songs:   YEAR | Artist | Title [| q=search terms; am=artist regex; tm=title regex; d=1..3; alt=a/b; note=...]
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
const BAD = /karaoke|tribute|made famous|in the style of|originally performed|cover version|instrumental version|re-?recorded|taylor.?s version|sped up|slowed|lullaby|8-bit|music box|backing track|workout|remake|piano version|acoustic|demo\b|edit by|live at|live from|\blive\b|remix|\bmix\)|re-?record|rendition|as made popular|from the motion picture.*cover|a cappella|orchestral version|orchestral album|new studio recording|\bmix\b|symphonic|string quartet/i;
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
  pool.sort((a, b) => (year ? Math.abs(a.year - year) - Math.abs(b.year - year) : 0) || b.exact - a.exact || comp(a) - comp(b) || a.year - b.year);
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

async function resolveSong(want, year) {
  const terms = want.q || `${want.artist} ${stripExtras(want.title)}`;
  let res = await itunes({ term: terms });
  let b = best(res, want, year);
  if (!b && !want.q) { res = await itunes({ term: stripExtras(want.title), attribute: 'songTerm' }); b = best(res, want, year); }
  if (!b || (year && !b.near)) { const r2 = await itunes({ term: terms, country: 'GB' }); const b2 = best(r2, want, year); if (b2 && (!b || b2.near)) b = b2; }
  return b;
}

// act of the credited lead artist (tools/au_lists/acts.json); songs{} can override one "Artist — Title" (null = leave out)
const ACTS = JSON.parse(fs.readFileSync(path.join(LISTS, 'acts.json'), 'utf8'));
const actOf = (artist, title) => { const k = `${artist} — ${title}`; return k in ACTS.songs ? ACTS.songs[k] : ACTS.artists[artist]; };

async function buildSongs(head, rows, report) {
  const items = [], dropped = [], offby = [];
  for (const [y, artist, title, optStr] of rows) {
    const o = parseOpts(optStr), year = +y;
    const want = { title, artist, q: o.q, am: o.am, tm: o.tm, allowExtras: o.extras === '1' };
    const b = await resolveSong(want, year);
    if (!b) { dropped.push(`NO MATCH  ${year} ${artist} — ${title}`); continue; }
    if (!b.near && head.kind !== 'themes' && !(o.note || '').startsWith('keepyear')) {
      dropped.push(`YEAR ${year} vs apple ${b.year}  ${artist} — ${title}  [${b.t.collectionName}]`);
      continue;
    }
    if (head.kind !== 'themes' && (b.year !== year || (b.originals && b.originals < year - 1))) offby.push(`${year} apple ${b.year} (earliest original ${b.originals ?? '-'})  ${artist} — ${title}  [${b.t.collectionName}]`);
    const theme = head.kind === 'themes';
    const id = slug(theme ? o.film : `${title} ${artist}`);
    if (!id || items.some((i) => i.id === id)) continue;
    items.push({
      id, name: theme ? o.film : title, alt: o.alt ? o.alt.split('/') : undefined,
      group: theme ? (o.type || 'film') : decade(year),
      facts: theme ? { composer: o.composer || artist, year, decade: decade(year), track: title, type: o.type || 'film' }
        : { artist, year, decade: decade(year), ...(actOf(artist, title) ? { act: actOf(artist, title) } : {}) },
      blurb: o.blurb || (theme ? `"${title}" from ${o.film} (${year}), by ${o.composer || artist}.` : `"${title}" by ${artist}, released in ${year}.`),
      media: { audio: [audioObj(b.t, artist)] },
      difficulty: +(o.d || head.difficulty || 2),
      _check: { appleYear: b.year, album: b.t.collectionName, appleArtist: b.t.artistName, appleTitle: b.t.trackName },
    });
    if (report) console.log(`ok  ${year} (apple ${b.year})  ${artist} — ${title}  →  ${b.t.artistName} — ${b.t.trackName} [${b.t.collectionName}]`);
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
      audio.push(a); titles.push(title);
      if (report) console.log(`ok  ${artist} — ${title}  →  ${b.t.artistName} — ${b.t.trackName} [${b.t.collectionName}, ${b.year}]`);
    }
    if (!audio.length) continue;
    items.push({
      id: slug(artist), name: artist, alt: o.alt ? o.alt.split('/') : undefined,
      group: dec,
      facts: { origin, decade: dec, songs: titles.join(' · ') },
      blurb: `${artist} (${origin}), breakthrough in the ${dec}. Known for ${titles.map((t) => `"${t}"`).join(' and ')}.`,
      media: { audio },
      difficulty: +(o.d || 2),
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
      factsMeta, items: items.map(({ _check, ...it }) => it), questions: [],
      sources: JSON.parse(head.sources || '[]').concat([{ name: 'Apple iTunes Search API (previews, artwork, links)', url: 'https://performance-partners.apple.com/search-api' }]),
      built: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(path.join(OUT, head.id + '.json'), JSON.stringify(pack, null, 1));
    fs.writeFileSync(path.join(ROOT, 'tools/au_lists', head.id + '.check.json'), JSON.stringify({ dropped, offby, items: items.map((i) => ({ id: i.id, ...i._check, year: i.facts?.year })) }, null, 1));
    console.log(`  wrote ${items.length} items (${dropped.length} dropped)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
