// Hat-trick: one question, up to three rows of four (film / director / year from a movie-moment picture, song / artist /
// year from a clip, country / capital / continent from a flag; with no picture or clip the name is shown and the other
// rows asked). Tap one per row, lock in; each right row is a share of the points (js/formats/trio_score.js).
// Packs opt in through TRIO (or pack.trio, same shape): the rows, the facts behind them and the media to show.
import { register, poolItems, byDifficulty, collect, pick, shuffle, givesAway, weightedPick, looksAlike } from './registry.js?v=202610181234';
import { h, mediaBox, onKey } from '../ui/kit.js?v=202610181234';
import { injectCSS, baseCSS, once, hasImg, norm } from './fkit.js?v=202610181234';
import { basePoints } from '../core/scoring.js?v=202610181234';
import { preflight, urlsOf } from '../core/media.js?v=202610181234';
import { confetti } from '../ui/fx.js?v=202610181234';
import { trioScore, trioCap } from './trio_score.js?v=202610181234';
import { yearOptions, MAX_YEAR } from './years.js?v=202610181234';
import { isCredit, leadOf } from './cocredit.js?v=202610181234';

export { trioScore, trioCap };
// every row right: a flat bonus on top, after the streak (the server and P2P host award the same)
export const HAT_BONUS = 100;

/* Row kinds: 'name' (the item; only when a picture or clip stands in for it), 'fact' (facts[key]; split = how a value
   breaks into people, so co-credits never repeat across options; first = one billed name; fromOptions = the values of
   the name row's items), 'year'. era = the year fact distractors stay close to; spread = a fact every name-row option
   differs on (countries: one per continent, so no row narrows another). Rows marked optional drop out rather than fail.
   Candidates for later: paintings (artist + year), inventions (inventor + year), landmarks (country + built). */
const FILM = { era: 'year', media: 'img', rows: [
  { kind: 'name', label: 'Film', noun: 'the film' },
  { kind: 'fact', key: 'director', split: 'people', label: 'Director', noun: 'the director' },
  { kind: 'year', key: 'year', label: 'Year', noun: 'the year' },
  { kind: 'fact', key: 'stars', split: 'people', first: true, label: 'Starring', noun: 'a star', optional: true },
] };
const SONG = { era: 'year', media: 'audio', rows: [
  { kind: 'name', label: 'Song', noun: 'the song' },
  { kind: 'fact', key: 'artist', split: 'artist', label: 'Artist', noun: 'the artist' },
  { kind: 'year', key: 'year', label: 'Year', noun: 'the year' },
] };
const BOOK = { era: 'year', media: 'img', rows: [
  { kind: 'name', label: 'Book', noun: 'the book' },
  { kind: 'fact', key: 'author', split: 'people', label: 'Author', noun: 'the author' },
  { kind: 'year', key: 'year', label: 'Year', noun: 'the year' },
] };
const COUNTRY = { media: 'img', spread: 'continent', rows: [
  { kind: 'name', label: 'Country', noun: 'the country' },
  { kind: 'fact', key: 'capital', label: 'Capital', noun: 'the capital', optional: true },
  { kind: 'fact', key: 'continent', fromOptions: true, label: 'Continent', noun: 'the continent', optional: true },
] };
// Inventions span 2,000 years and paintings 500, so their people come from wider era bands (near).
const INVENTION = { era: 'year', media: 'img', near: [15, 40, 80], rows: [
  { kind: 'name', label: 'Invention', noun: 'the invention' },
  { kind: 'fact', key: 'inventor', split: 'people', label: 'Inventor', noun: 'the inventor' },
  { kind: 'year', key: 'year', label: 'Year', noun: 'the year' },
  { kind: 'fact', key: 'country', label: 'Country', noun: 'the country', optional: true },
] };
const PAINTING = { era: 'year', media: 'img', near: [15, 30, 60], rows: [
  { kind: 'name', label: 'Painting', noun: 'the painting' },
  { kind: 'fact', key: 'artist', label: 'Artist', noun: 'the artist' },
  { kind: 'year', key: 'year', label: 'Year', noun: 'the year' },
] };
const LANDMARK = { media: 'img', spread: 'continent', rows: [
  { kind: 'name', label: 'Landmark', noun: 'the landmark' },
  { kind: 'fact', key: 'country', label: 'Country', noun: 'the country' },
  { kind: 'fact', key: 'continent', fromOptions: true, label: 'Continent', noun: 'the continent', optional: true },
] };
// lane LEADERS: portrait → leader, the country they led, the year they came to power (leaders 3,000 years apart: wide bands)
const LEADER = { era: 'start', media: 'img', near: [15, 40, 80], rows: [
  { kind: 'name', label: 'Leader', noun: 'the leader' },
  { kind: 'fact', key: 'country', label: 'Country', noun: 'the country' },
  { kind: 'year', key: 'start', label: 'Came to power', noun: 'the year they came to power' },
] };
export const TRIO = {
  inventions: INVENTION, paintings: PAINTING, landmarks: LANDMARK, leaders: LEADER,
  'movie-moments': FILM, movies: FILM, books: BOOK, 'book-moments': BOOK, countries: COUNTRY, 'one-hit-wonders': SONG,
  ...Object.fromEntries(['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'].map(d => [`hits-${d}`, SONG])),
};
// genre views (movies~scifi) play as their base pack
const confOf = pack => pack?.trio || TRIO[pack?.id] || TRIO[String(pack?.id || '').split('~')[0]] || null;

export const NEAR = [8, 15];                          // fact distractors: from an item within this many years (conf.near)
const NAME_NEAR = [5, 10, 15, 25, Infinity];
const CLIP_LEN = 10;

const SPLITS = {
  people: /\s*,\s*|\s+and\s+|\s*&\s*/i,
  artist: /\s*,\s*|\s+and\s+|\s*&\s*|\s+(?:featuring|feat\.?|ft\.?|with|x|vs\.?)\s+/i,
};
const rawOf = (it, key) => { const v = it?.facts?.[key]; return v == null || v === '' ? null : Array.isArray(v) ? v.map(String) : String(v); };
// The identities behind a value (people, or one value per continent of "Asia,Europe"), compared case-blind.
export function idsOf(it, row) {
  const v = rawOf(it, row.key);
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (row.split) return v.split(SPLITS[row.split] || SPLITS.people).map(s => s.trim()).filter(Boolean);
  return row.key === 'continent' ? v.split(',').map(s => s.trim()) : [v];
}
const peopleText = ps => (ps.length <= 2 ? ps.join(' & ') : `${ps[0]} & others`);
// What an option shows: artists as credited ("Simon & Garfunkel"), people lists shortened, a single picked name as is.
function textOf(it, row, ids) {
  if (row.first) return ids[0];
  if (row.split === 'people' && isCredit(row.key)) return leadOf(ids);
  if (row.split === 'people') return peopleText(ids);
  return rawOf(it, row.key);
}
const listText = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const yearOf = (it, key) => { const v = Number(it?.facts?.[key]); return key && it?.facts?.[key] != null && Number.isFinite(v) ? v : null; };
export const yearText = y => (y < 0 ? `${-y} BC` : String(y));
const hasClip = it => !!it?.media?.audio?.some(a => a.src);
const hasMedia = (it, conf) => (conf.media === 'audio' ? hasClip(it) : conf.media === 'img' ? hasImg(it) : false);

// Inside the pack's own years first (a 1980s pack never offers 1993); the level's spacing always holds (years.js).
function yearRow(rng, y, level, lo, hi) {
  for (let k = 0; k < 6; k++) { const r = yearOptions(rng, y, 4, { level, lo, hi }); if (r) return r; }
  return yearOptions(rng, y, 4, { level }) || yearOptions(rng, y, 4, { level, hi: Math.max(y + 30, MAX_YEAR) });
}

function pickImage(rng, item, difficulty) {
  const imgs = item.media.img.filter(m => m?.src);
  const want = difficulty || 0;
  const exact = imgs.filter(m => (m.difficulty || 2) === want);
  const easier = imgs.filter(m => (m.difficulty || 2) <= Math.max(1, want));
  return pick(rng, want && exact.length ? exact : want && easier.length ? easier : imgs);
}

function clipOf(rng, item, meta) {
  const a0 = pick(rng, item.media.audio.filter(a => a.src));
  const a = { ...a0 };
  const len = a.dur && a.dur < CLIP_LEN && !a.apple ? a.dur : CLIP_LEN;
  const dur = a.dur || 30, start = Math.max(0, Math.min(dur - len, Math.round((0.15 + rng() * 0.45) * (dur - len) * 10) / 10));
  return { a, start, len, meta };
}

function make(rng, pack, conf, difficulty) {
  const era = conf.era;
  const all = poolItems([pack], it => !era || yearOf(it, era) != null);
  if (all.length < 4) return null;
  // items with their picture/clip come first; a pack without any plays the text variant
  const withMedia = conf.media ? all.filter(c => hasMedia(c.item, conf)) : [];
  const pool = withMedia.length >= 4 ? withMedia : all;
  // a thin level (ten hard hits) is still asked most of the time; the rest borrows from the nearest level
  const lvOf = c => c.item.difficulty || 2, band = byDifficulty(pool, difficulty, 4, lvOf);
  const t = pick(rng, band.length >= 20 || rng() < 0.65 ? band : byDifficulty(pool, difficulty, 20, lvOf));
  if (!t) return null;
  const media = withMedia.length >= 4 && hasMedia(t.item, conf) ? conf.media : null;
  const y = era ? yearOf(t.item, era) : 0;
  const dist = c => (era ? Math.abs(yearOf(c.item, era) - y) : 0);
  const tdiff = t.item.difficulty || 2;
  const byFame = list => list.map(c => [c, Math.abs((c.item.difficulty || 2) - tdiff)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  const rowsConf = conf.rows.filter(r => r.kind !== 'name' || media);
  const factRows = conf.rows.filter(r => r.kind === 'fact' && r.split);
  // everyone credited on the target: never a wrong option anywhere
  const targetAll = new Set(factRows.flatMap(r => idsOf(t.item, { ...r, first: false })).map(norm));
  const spreadRow = conf.spread ? { key: conf.spread } : null;
  const spreadOf = c => (spreadRow ? idsOf(c.item, spreadRow) : []);
  const rows = [];
  const optionItems = [t];

  if (rowsConf.some(r => r.kind === 'name')) {
    // sequels and look-alikes (registry looksAlike: one series, or pictures close in colour) by level, as mc does:
    // easy none among the options, medium (and any) one pair, hard offers the target's own series first
    const cap = { 1: 0, 2: 1, 0: 1 }[difficulty];
    const alike = (a, b) => looksAlike(a.item, b.item) || (!!a.item.facts?.franchise && a.item.facts.franchise === b.item.facts?.franchise);
    const pairsWith = c => optionItems.filter(o => alike(o, c)).length;
    // names that hint at each other ("Toy Story 2") may only meet as an allowed same-series pair
    const clash = (a, b) => norm(a.item.name) === norm(b.item.name) || ((givesAway(a.item.name, b.item.name) || givesAway(b.item.name, a.item.name)) && !alike(a, b));
    const seenSpread = new Set(spreadOf(t).map(norm));
    let pairs = 0;
    const take = (list, capped = cap !== undefined) => {
      for (const c of list) {
        if (optionItems.length >= 4) return;
        if (c.item === t.item || (spreadRow && spreadOf(c).length !== 1) || optionItems.some(o => o.item === c.item || clash(o, c))) continue;
        const p = capped ? pairsWith(c) : 0;
        if (capped && pairs + p > cap) continue;
        if (spreadRow && seenSpread.has(norm(spreadOf(c)[0]))) continue;
        if (spreadRow) seenSpread.add(norm(spreadOf(c)[0]));
        optionItems.push(c); pairs += p;
      }
    };
    if (cap === undefined) take(byFame(shuffle(rng, all.filter(c => alike(t, c) && dist(c) <= 25))).slice(0, 3));
    // sparse packs (inventions, paintings) widen through their own bands before giving up on the era
    for (const band of [...NAME_NEAR.filter(isFinite), ...(conf.near || []).filter(b => b > 25), Infinity]) {
      take(byFame(shuffle(rng, all.filter(c => dist(c) <= band))));
      if (optionItems.length >= 4) break;
    }
    if (optionItems.length < 4) return null;
  }
  const others = optionItems.slice(1);

  const taken = new Set();
  for (const row of rowsConf) {
    if (row.kind === 'name') {
      const opts = shuffle(rng, optionItems);
      rows.push({ row, options: opts.map(c => c.item.name), answer: opts.indexOf(t) });
    } else if (row.kind === 'year') {
      const ys = all.map(c => yearOf(c.item, row.key)).filter(v => v != null);
      const yo = yearRow(rng, yearOf(t.item, row.key), difficulty || 2, Math.min(...ys), Math.min(Math.max(...ys), MAX_YEAR));
      if (!yo) return null;
      rows.push({ row, options: yo.years.map(yearText), answer: yo.answer });
    } else {
      if (row.optional && rows.length >= 3) continue;   // three rows at most: optional extras only fill a gap
      const fact = makeFactRow(rng, row, t, all, others, { taken, targetAll, dist, byFame, spreadRow, spreadOf, near: conf.near || NEAR });
      if (!fact) { if (row.optional) continue; return null; }
      rows.push(fact);
    }
  }

  // no row may hint at its own answer, nor at another row's: the prompt and every other row's options are checked
  const nouns = () => rows.map(r => r.row.noun || r.row.label.toLowerCase());
  const promptOf = () => (media ? `Name ${listText(nouns())}` : `${t.item.name}: name ${listText(nouns())}`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], ans = r.options[r.answer], wrong = r.options.filter((_, j) => j !== r.answer);
    const leaks = givesAway(ans, promptOf(), wrong) || rows.some(s => s !== r && s.options.some(o => givesAway(ans, o, wrong)));
    if (!leaks) continue;
    if (!r.row.optional) return null;
    rows.splice(i, 1); i = -1;
  }
  if (rows.length < 2) return null;
  const flat = rows.flatMap(r => r.options.map(norm));
  if (new Set(flat).size !== flat.length) return null;

  const answer = rows.map(r => r.answer);
  const answerText = rows.map(r => r.options[r.answer]).join(' · ');
  const q = {
    format: 'trio', id: `trio:${t.ref}`, prompt: promptOf(),
    rows: rows.map(r => ({ label: r.row.label, kind: r.row.kind, options: r.options })),
    answer, answerText, explain: t.item.blurb, refs: [t.ref, ...others.map(c => c.ref)], pack: pack.id,
    data: { layout: media === 'img' ? 'pic' : media === 'audio' ? 'audio' : 'text' },
  };
  if (media === 'img') q.media = { img: [pickImage(rng, t.item, difficulty)] };
  if (media === 'audio') {
    const fy = era ? yearOf(t.item, era) : '';
    const c = clipOf(rng, t.item, { title: t.item.name, artist: rawOf(t.item, 'artist') || '', year: fy == null ? '' : String(fy) });
    q.media = { audio: [c.a] };
    Object.assign(q.data, c);
  }
  return q;
}

function makeFactRow(rng, row, t, all, others, { taken, targetAll, dist, byFame, spreadRow, spreadOf, near }) {
  const ids = idsOf(t.item, row);
  const right = row.first ? ids.filter(x => !taken.has(norm(x))).slice(0, 1) : ids;
  if (!right.length) return null;
  const rightText = row.first ? right[0] : textOf(t.item, row, right);
  // a shared credit names its best-known person only (cocredit.js); the others stay banned as wrong options
  if (!rightText) return null;
  let wrong = [];
  if (row.fromOptions) {
    // continent: the values of the name row's own options (each differs), else any three other values
    if (right.length !== 1) return null;
    wrong = others.length >= 3 ? others.map(c => idsOf(c.item, row)[0]) : shuffle(rng, [...new Set(all.flatMap(c => idsOf(c.item, row)))].filter(v => !ids.some(x => norm(x) === norm(v)))).slice(0, 3);
    if (wrong.length < 3 || wrong.some(v => !v)) return null;
  } else {
    // the other options' own values never appear here, so one row never pairs up with another
    const banned = new Set([...targetAll, ...ids, ...others.flatMap(c => idsOf(c.item, { ...row, first: false }))].map(norm));
    const used = new Set(right.map(norm));
    const usedSpread = new Set(spreadRow ? spreadOf(t).map(norm) : []);
    const wantSpread = spreadRow && others.length >= 3 ? others.map(c => norm(spreadOf(c)[0])) : null;
    for (const band of near) {
      for (const c of byFame(shuffle(rng, all.filter(c => c.item !== t.item && !others.includes(c) && dist(c) <= band)))) {
        if (wrong.length >= 3) break;
        const cid = idsOf(c.item, row);
        const ps = row.first ? cid.slice(0, 1) : cid;
        if (!ps.length || ps.some(p => banned.has(norm(p)) || used.has(norm(p)))) continue;
        // capitals follow the name row's continents, one each, so the capitals can't point at a continent
        if (wantSpread) { const s = norm(spreadOf(c)[0]); if (spreadOf(c).length !== 1 || !wantSpread.includes(s) || usedSpread.has(s)) continue; usedSpread.add(s); }
        const text = textOf(c.item, row, ps);
        if (!text || wrong.includes(text) || norm(text) === norm(rightText)) continue;
        ps.forEach(p => used.add(norm(p)));
        wrong.push(text);
      }
      if (wrong.length >= 3) break;
    }
    if (wrong.length < 3) return null;
  }
  right.forEach(p => taken.add(norm(p)));
  const opts = shuffle(rng, [rightText, ...wrong]);
  return { row, options: opts, answer: opts.indexOf(rightText) };
}

const packId = info => info.id || String(info.path || '').replace(/^.*\//, '').replace(/\.json$/, '');
const audioMod = () => import('./trio_audio.js?v=202610181234');

export default register({
  id: 'trio', title: 'Hat-trick', icon: '🎩', blurb: 'Three questions in one: name it, who, when', tags: ['slow'], noKids: true,
  answerOnBoard: true, revealInline: true, timeAdd: 10000,
  supports(info) {
    return confOf({ id: packId(info) }) || info.trio ? true : 'Needs films, songs, books or countries';
  },
  generate({ rng, packs, count, difficulty = 0, kids = false, avoid }) {
    if (kids) return [];
    const usable = packs.filter(p => confOf(p) && (p.items || []).length >= 4);
    if (!usable.length) return [];
    return collect(count, () => {
      const p = weightedPick(rng, usable, x => Math.sqrt(x.items.length));
      return make(rng, p, confOf(p), difficulty);
    }, avoid, count * 20);
  },
  async prepare(questions) {
    if (questions.some(q => q.format === 'trio' && q.data?.a?.apple)) await (await audioMod()).prepare(questions);
    return questions;
  },
  // rooms: fetch the picture or decode the clip during the lead-in
  preload(q) {
    if (q?.data?.a) return audioMod().then(m => m.loadClip(q));
    return preflight(urlsOf([q]));
  },
  render,
});

const CSS = `
.tr{gap:8px;justify-content:flex-start}
.tr .q-media{flex:1 1 0;min-height:96px}
.tr-body{display:flex;flex-direction:column;gap:7px;flex:none}
.tr .q-prompt{font-size:clamp(18px,5vw,24px)}
.tr.text .tr-body{flex:1;justify-content:center;gap:12px}
.tr.text .q-prompt{font-size:clamp(21px,5.8vw,30px)}
.tr.audio .q-media{flex:0 0 auto;height:min(26vh,190px)}
.tr-row{display:flex;flex-direction:column;gap:4px}
.tr-lbl{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.tr-lbl .tk{font-size:14px;letter-spacing:0}
.tr-lbl .tk.ok{color:var(--good)}.tr-lbl .tk.bad{color:var(--bad)}.tr-lbl .tk.none{color:var(--ink-2)}
.tr-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.tr-opts.year{grid-template-columns:repeat(4,1fr)}
.tr-chip{position:relative;min-height:40px;padding:4px 8px;border:2px solid var(--ink);border-radius:12px;background:#fff;box-shadow:0 2px 0 var(--ink);font:inherit;font-weight:800;font-size:14px;line-height:1.12;color:var(--ink);text-align:center;cursor:pointer;overflow-wrap:anywhere;hyphens:auto}
.tr-chip[aria-pressed=true]{background:var(--grape);color:#fff;transform:translateY(2px);box-shadow:0 0 0 var(--ink)}
.tr-chip:disabled{cursor:default}
.tr-chip.ok{background:var(--good);color:#fff;transform:none}
.tr-chip.bad{background:var(--bad);color:#fff;transform:none}
.tr-chip.miss{border-style:dashed;border-color:var(--good);background:#e9f7ee;color:#1d5a35}
.tr-chip.dim{opacity:.4}
.tr-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}
.tr-top{font-weight:900;color:var(--ink-2);font-size:14px}
.tr-top.hat{color:var(--good);font-size:17px}
.tr-lock{min-height:44px;min-width:150px;padding:6px 16px}
.tr.text .tr-chip{min-height:48px;font-size:16px}
.play.revealed .tr.pic .q-media{flex:0 0 auto;height:22vh;min-height:80px}
.play.revealed .tr.audio .q-media{height:auto;min-height:0;flex:none;padding:8px}
.play.revealed .tr-foot{display:none}
@media (orientation:landscape) and (max-height:520px){
 .tr.pic,.tr.audio{flex-direction:row;align-items:stretch;gap:12px}
 .tr.pic .q-media,.tr.audio .q-media{flex:1 1 42%;min-height:0;height:auto}
 .tr.pic .tr-body,.tr.audio .tr-body{flex:1 1 58%;justify-content:center;gap:5px;min-width:0}
 .tr .q-prompt{font-size:clamp(15px,2.6vw,20px)}
 .tr-row{flex-direction:row;align-items:center;gap:6px}
 .tr-lbl{flex:0 0 62px;font-size:10px;flex-wrap:wrap;gap:2px}
 .tr-opts{flex:1;grid-template-columns:repeat(4,1fr);gap:5px}
 .tr-chip{min-height:36px;padding:3px 5px;font-size:12px}
 .tr.text .tr-body{max-width:760px;margin:0 auto;width:100%}
 .tr.text .tr-chip{min-height:42px;font-size:14px}
 .tr-lock{min-height:38px;padding:4px 14px}
 .play.revealed .tr.pic .q-media,.play.revealed .tr.audio .q-media{height:auto;flex:1 1 42%;margin-bottom:calc(var(--rv-h,0px) + 10px)}
 .play.revealed.rv-inline .stage>.f-stage.tr.pic,.play.revealed.rv-inline .stage>.f-stage.tr.audio{flex:1}
 .stage:has(> .tr.pic)>.reveal,.stage:has(> .tr.audio)>.reveal{width:calc(42% - 14px)}
}
@media (min-width:900px) and (min-height:560px){
 .tr.pic,.tr.audio{flex-direction:row;align-items:center;gap:24px;max-width:1040px}
 .tr.pic .q-media{flex:1 1 52%;height:min(58vh,500px)}
 .tr.audio .q-media{flex:1 1 40%;height:min(46vh,380px)}
 .tr.pic .tr-body,.tr.audio .tr-body{flex:1 1 48%;gap:10px}
 .tr-chip{min-height:48px;font-size:16px}
 .play.revealed .tr.pic .q-media{height:min(46vh,400px)}
}
`;

function render(el, q, api) {
  injectCSS('f-trio-css', CSS); baseCSS();
  el.innerHTML = '';
  const answer = once(api);
  const rows = (Array.isArray(q.rows) ? q.rows : []).filter(r => r && Array.isArray(r.options) && r.options.length >= 2).slice(0, 3);
  const n = rows.length;
  const sel = rows.map(() => -1);
  let done = false, cur = 0, au = null, dead = false;
  const audio = q.data?.layout === 'audio' && !!q.data?.a;
  const pic = !audio && q.media?.img?.length ? mediaBox(q.media) : null;
  const slot = audio ? h('figure.q-media') : null;
  const top = h('span.tr-top');
  const lock = h('button.btn.primary.tr-lock', { type: 'button', dataset: { act: 'lock' }, onclick: () => finish() });
  const ticks = [];
  const chips = rows.map((r, ri) => r.options.map((o, i) => h('button.tr-chip', { type: 'button', 'aria-pressed': 'false', dataset: { r: String(ri), i: String(i) }, onclick: () => tap(ri, i) }, String(o))));
  const rowEls = rows.map((r, ri) => {
    const tk = h('span.tk');
    ticks.push(tk);
    return h('div.tr-row', { dataset: { row: String(ri) } }, h('div.tr-lbl', {}, String(r.label || ''), tk),
      h('div.tr-opts', { class: `${r.kind === 'year' ? 'year' : ''} n${r.options.length}` }, ...chips[ri]));
  });
  const body = h('div.tr-body', {}, h('h2.q-prompt', {}, q.prompt || ''), ...rowEls, h('div.tr-foot', {}, top, lock));
  el.append(h('div.f-stage.tr', { class: audio ? 'audio' : pic ? 'pic' : 'text' }, pic || slot, body));
  if (audio) audioMod().then(m => { if (dead) return; au = m.audioBox(q, api, { injectCSS }); slot.replaceWith(au.el); if (done) au.stop(); }).catch(() => {});
  const picked = () => sel.filter(x => x >= 0).length;
  const draw = () => {
    const k = picked();
    top.textContent = `${k} of ${n} picked`;
    lock.disabled = k < n;
    lock.textContent = k < n ? `Pick ${n - k} more` : 'Lock in ✓';
  };
  draw();
  function tap(ri, i) {
    if (done) return;
    sel[ri] = sel[ri] === i ? -1 : i;
    chips[ri].forEach((b, j) => b.setAttribute('aria-pressed', String(sel[ri] === j)));
    const next = sel.findIndex(x => x < 0);
    cur = next < 0 ? ri : next;
    api.sfx?.('tap');
    api.draft?.(sel.slice());
    draw();
  }
  const right = Array.isArray(q.answer) ? q.answer : [];
  function mark() {
    rows.forEach((r, ri) => {
      const a = right[ri];
      chips[ri].forEach((b, i) => {
        b.disabled = true; b.removeAttribute('aria-pressed');
        b.classList.add(i === a ? (sel[ri] === i ? 'ok' : 'miss') : sel[ri] === i ? 'bad' : 'dim');
      });
      // a row left unpicked is shown, never marked wrong
      ticks[ri].textContent = sel[ri] === a ? '✓' : sel[ri] < 0 ? '–' : '✗';
      ticks[ri].className = `tk ${sel[ri] === a ? 'ok' : sel[ri] < 0 ? 'none' : 'bad'}`;
    });
  }
  function finish(timeout) {
    if (done || (!timeout && picked() < n)) return;
    done = true;
    mark();
    if (au) { au.stop(); api.reveal(au.revealNode()); }
    const s = trioScore(sel, right);
    const hat = s.correct && n === 3;
    top.classList.toggle('hat', hat);
    top.textContent = hat ? 'Hat-trick! 🎩' : `${s.hits} of ${n} right`;
    // a timeout scores what was picked as if locked at the deadline (minimum speed points)
    const given = sel.slice();
    let res;
    if (s.correct) {
      if (hat) try { confetti({ count: 90, duration: 2000 }); } catch (e) {}
      res = { correct: true, given, hat: HAT_BONUS, title: hat ? 'Hat-trick! 🎩' : `All ${n} right!`, detail: { hits: s.hits, of: n } };
    } else {
      let rem = 0, full = 0;
      try { rem = timeout ? 0 : api.timer.remaining(); full = api.timer.full || api.timer.limit || 0; } catch (e) {}
      const base = basePoints({ timed: !!api.timed && full > 0 && (timeout || rem > 0), remaining: rem, limit: full });
      const points = Math.round(base * s.frac);
      res = { correct: false, partial: points > 0, points, given, title: s.hits ? `${s.hits} of ${n} right` : undefined, detail: { hits: s.hits, of: n } };
    }
    if (timeout) return res;
    answer(res);
  }
  const offKey = onKey(e => {
    if (done) return;
    const k = parseInt(e.key, 10);
    if (k >= 1 && k <= (rows[cur]?.options.length || 0)) { tap(cur, k - 1); return true; }
    if (e.key === 'Enter' && picked() === n) { finish(); return true; }
  });
  return {
    destroy() { dead = true; offKey(); au?.destroy(); },
    timeoutAnswer() { return finish(true) || null; },
    choose(x) {
      const want = Array.isArray(x) ? x : rows.map((r, ri) => (x === 'correct' ? right[ri] : (right[ri] + 1) % r.options.length));
      want.forEach((i, ri) => { if (ri < n && sel[ri] !== i) tap(ri, i); });
      finish();
    },
  };
}
