#!/usr/bin/env node
// Hat-trick (js/formats/trio.js): scoring (JS, the P2P host, sanitize), and every generated question re-derived from the
// raw pack data: rows, right answers, distractor rules (era, credits, continents), year spacing, giveaways. Falsified:
// a broken question must fail the validator. Usage: node tools/trio_test.mjs [--verbose]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
const VERBOSE = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const shown = new Map();
const ok = (c, msg) => {
  if (c) { pass++; return true; }
  fail++;
  const k = msg.replace(/\s*\(.*$/, '').replace(/ trio:.*$/, '');
  shown.set(k, (shown.get(k) || 0) + 1);
  if (shown.get(k) <= 3 || VERBOSE) console.log('FAIL', msg);
  return false;
};

const { rngFrom } = await imp('js/core/rng.js');
const reg = await imp('js/formats/registry.js');
const T = await imp('js/formats/trio.js');
const { trioScore, trioCap } = await imp('js/formats/trio_score.js');
const Y = await imp('js/formats/years.js');
const CC = await imp('js/formats/cocredit.js');
const P2P = await imp('js/net/p2p_room.js');
const { cleanQuestion } = await imp('js/net/sanitize.js');
const fmt = T.default;
const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const loadPack = id => JSON.parse(readFileSync(join(ROOT, 'data', index.packs[id].path), 'utf8'));
const norm = s => String(s ?? '').trim().toLowerCase();

/* ---------- scoring ---------- */
const S = (g, a) => { const s = trioScore(g, a); return `${s.hits}/${+s.frac.toFixed(3)}/${s.correct}`; };
ok(S([2, 0, 3], [2, 0, 3]) === '3/1/true', 'all three right');
ok(S([2, 0, 1], [2, 0, 3]) === '2/0.667/false', 'two of three');
ok(S([2, 1, 1], [2, 0, 3]) === '1/0.333/false', 'one of three');
ok(S([0, 1, 1], [2, 0, 3]) === '0/0/false', 'none');
ok(S(null, [2, 0, 3]) === '0/0/false', 'timeout');
ok(S([2, 0], [2, 0, 3]) === '2/0.667/false', 'a missing row is wrong');
ok(S([2, 0, 3, 1], [2, 0, 3]) === '0/0/false', 'more rows than asked scores nothing');
ok(S(['2', 0, 3.5], [2, 0, 3]) === '1/0.333/false', 'strings and fractions never match');
ok(S([1, 0], [1, 1]) === '1/0.5/false', 'two-row question: half each');
ok(trioCap([2, 0, 3], [2, 0, 1]) === 333 && trioCap([2, 0, 3], [2, 0, 3]) === 500, 'cap = 500 × share');

// P2P host: the same rule as server/scoring.go trioPoints (its own speed × share), whatever the client claims
{
  let now = 1e6;
  const q = { format: 'trio', answer: [1, 2, 0], rows: [{ options: ['a', 'b', 'c', 'd'] }, { options: ['a', 'b', 'c', 'd'] }, { options: ['1', '2', '3', '4'] }] };
  const room = new P2P.P2PRoom({ questions: [q, q], answerSec: 15, now: () => now });
  ok(room.limitFor(q) === 25000 && room.limitFor({ format: 'mc' }) === 15000, 'P2P: trio answer time = host time + 10 s');
  const a = room.addPlayer('Ann').player, b = room.addPlayer('Bob').player;
  room.start(); now = room.qStart;
  const ra = room.answer(a, { q: 0, given: [1, 0, 3], correct: true, points: 500, ms: 0 }).answer;
  const rb = room.answer(b, { q: 0, given: [1, 2, 0], correct: false, points: 0, ms: 0 }).answer;
  ok(!ra.correct && ra.points === 167, `P2P: 1 of 3 claimed as 500 scores 167 (${ra.points})`);
  ok(rb.correct && rb.points === 600 && rb.hat === 100, `P2P: hat-trick at once scores 500 + 100 bonus (${rb.points})`);
  ok(a.streak === 0 && b.streak === 1, 'P2P: only a hat-trick keeps the streak');
  // drafts: picks never locked in are scored at the deadline with minimum speed points; nothing picked scores nothing
  room.reveal(); room.advance();
  now = room.qStart;
  const c = room.addPlayer('Cy').player;
  ok(!room.draft(a, { q: 1, given: [1, 2, 3] }).error && !room.draft(a, { q: 1, given: [1, 2, 0] }).error, 'P2P: drafts accepted, newest wins');
  ok(!room.draft(b, { q: 1, given: [1, 0, 3] }).error, 'P2P: a partial draft');
  ok(room.draft(c, { q: 0, given: [1, 2, 0] }).error === 'not_open', 'P2P: a draft for another question is refused');
  now = room.qDeadline + 10000;
  room.reveal();
  const da = a.answers[1], db = b.answers[1];
  ok(da?.correct && da.points === 100 + 100 && da.ms === room.limitFor(q), `P2P: an unlocked hat-trick scores minimum speed + bonus (${JSON.stringify(da)})`);
  ok(db && !db.correct && db.points === 33, `P2P: an unlocked 1 of 3 scores a third of minimum speed (${JSON.stringify(db)})`);
  ok(!c.answers[1], 'P2P: no picks, no answer');
}
{
  const pq = { format: 'pickall', answer: [0, 2], options: [...'abcdef'].map(text => ({ text })), data: { need: 2 } };
  let now = 1e6;
  const room = new P2P.P2PRoom({ questions: [pq], answerSec: 15, now: () => now });
  const a = room.addPlayer('Ann').player, b = room.addPlayer('Bob').player;
  room.start(); now = room.qStart;
  ok(room.answer(a, { q: 0, given: [0, 1], correct: true, points: 500, ms: 0 }).answer.points === 250, 'P2P pick-all: half right claimed as 500 scores 250');
  room.draft(b, { q: 0, given: [2] });
  now = room.qDeadline + 5000; room.reveal();
  ok(b.answers[0]?.points === 50 && !b.answers[0].correct, `P2P pick-all: an unlocked 1 of 2 scores 50 (${JSON.stringify(b.answers[0])})`);
}

// sanitize
{
  const good = { format: 'trio', id: 'x', prompt: 'Name <b>it</b>', rows: [{ label: 'Film', kind: 'name', options: ['A', 'B', 'C', 'D'] }, { label: 'Year', kind: 'year', options: ['1', '2', '3', '4'] }], answer: [0, 3] };
  const c = cleanQuestion(good);
  ok(c && c.rows.length === 2 && !c.prompt.includes('<') && c.answer.join() === '0,3', 'sanitize keeps a trio, strips markup');
  ok(cleanQuestion({ ...good, answer: [0, 4] }) === null, 'sanitize: answer out of range → dropped');
  ok(cleanQuestion({ ...good, answer: [0] }) === null, 'sanitize: answer per row');
  ok(cleanQuestion({ ...good, rows: [good.rows[0]] }) === null, 'sanitize: needs 2 rows');
  ok(cleanQuestion({ ...good, rows: [good.rows[0], { label: 'x', options: 'nope' }] }) === null, 'sanitize: rows need options');
  const hid = { ...good }; delete hid.answer;
  ok(!!cleanQuestion(hid), 'sanitize: a question without its answer still plays');
}

ok(reg.supportsPack(fmt, { id: 'movies', ...index.packs.movies }) === true, 'movies supported');
ok(reg.supportsPack(fmt, { id: 'movies', ...index.packs.movies }, { kids: true }) === 'Not in kids mode', 'never in kids mode');
ok(typeof reg.supportsPack(fmt, { id: 'snakes', ...index.packs.snakes }) === 'string', 'other packs are not');

/* ---------- generation, re-derived ---------- */
const SPLIT = {
  people: /\s*,\s*|\s+and\s+|\s*&\s*/i,
  artist: /\s*,\s*|\s+and\s+|\s*&\s*|\s+(?:featuring|feat\.?|ft\.?|with|x|vs\.?)\s+/i,
};
const conf = T.TRIO;
const BAD_TO_FLAG = new Map();
function validate(q, pack, d, tag) {
  const c = conf[pack.id];
  const before = fail;
  const byRef = new Map(pack.items.map(it => [`${pack.id}/${it.id}`, it]));
  const t = byRef.get(q.refs[0]);
  if (!ok(!!t && q.format === 'trio' && JSON.parse(JSON.stringify(q)), `shape ${tag} ${q.id}`)) return false;
  ok(q.rows.length >= 2 && q.rows.length <= 3 && q.answer.length === q.rows.length, `2–3 rows, one answer each ${tag} ${q.id}`);
  const all = q.rows.flatMap(r => r.options.map(norm));
  ok(new Set(all).size === all.length, `options distinct across rows ${tag} ${q.id}`);
  const media = q.data.layout;
  ok(media === 'text' || (media === 'pic' && q.media?.img?.[0]?.src && t.media.img.some(m => m.src === q.media.img[0].src)) || (media === 'audio' && q.data.a?.src && t.media.audio.some(a => a.src === q.data.a.src)), `media is the item's own ${tag} ${q.id}`);
  ok(media !== 'text' || q.prompt.startsWith(`${t.name}:`), `text variant names the item ${tag} ${q.id}`);
  const y = c.era ? Number(t.facts[c.era]) : 0;
  const nameRow = q.rows.findIndex(r => r.kind === 'name');
  const optItems = nameRow >= 0 ? q.rows[nameRow].options.map(n => pack.items.find(it => it.name === n)) : [];
  q.rows.forEach((r, ri) => {
    const a = q.answer[ri];
    ok(r.options.length === 4 && Number.isInteger(a) && a >= 0 && a < 4, `4 options, valid answer ${tag} ${q.id} ${r.label}`);
    const right = r.options[a];
    const rc = c.rows.find(x => x.label === r.label);
    if (r.kind === 'name') {
      ok(right === t.name, `name row answer is the item ${tag} ${q.id}`);
      ok(media !== 'text', `name row only with a picture or clip ${tag} ${q.id}`);
      ok(optItems.every(Boolean), `name options are pack items ${tag} ${q.id}`);
      // within 25 years (or the pack's widest band) unless the pack has too few items that close: then the nearest
      if (c.era) {
        const bound = Math.max(25, (c.near || [0]).at(-1)), close = pack.items.filter(it => it.facts[c.era] != null && Math.abs(it.facts[c.era] - y) <= bound).length;
        // an option from further away only when every closer unused item was ruled out: a look-alike / same-series
        // item past the level's cap, or a name that hints at a chosen one
        const near = it => it.facts[c.era] != null && Math.abs(it.facts[c.era] - y) <= bound;
        const blocked = it => optItems.some(o => reg.looksAlike(o, it) || reg.givesAway(o.name, it.name) || reg.givesAway(it.name, o.name) || (o.facts.franchise && o.facts.franchise === it.facts.franchise));
        const spare = pack.items.filter(it => near(it) && !optItems.includes(it) && !blocked(it));
        ok(close < 4 || optItems.every(near) || !spare.length, `name options from a near era (${optItems.map(it => it.facts[c.era])} vs ${spare.map(it => it.name).slice(0, 3)}) ${tag} ${q.id}`);
      }
      if (c.spread) ok(new Set(optItems.map(it => it.facts[c.spread])).size === 4, `name options differ on ${c.spread} ${tag} ${q.id}`);
    } else if (r.kind === 'year') {
      const ys = r.options.map(Number);
      ok(String(t.facts[rc.key]) === right, `year row answer is the item's year ${tag} ${q.id}`);
      const gaps = ys.slice(1).map((v, i) => v - ys[i]);
      const span = pack.items.map(it => it.facts[rc.key]);
      const roomy = Math.max(...span) - Math.min(...span) >= 30;
      const [want, most] = Y.stepsFor(d || 2);
      ok(gaps.every(g => g >= want), `years ascending, ≥ ${want} apart (${gaps}) ${tag} ${q.id}`);
      if (!roomy && Math.max(...span) - Math.min(...span) >= 3 * most) ok(ys[0] >= Math.min(...span) && ys[3] <= Math.max(...span), `a decade pack's years stay inside it (${ys}) ${tag} ${q.id}`);
      ok(gaps.every(g => g <= most), `years not spread wider than the rule (${gaps}) ${tag} ${q.id}`);
    } else {
      const sp = rc.split ? SPLIT[rc.split] : null;
      const ids = v => (v == null ? [] : rc.split ? String(v).split(sp).map(s => s.trim()) : rc.key === 'continent' ? String(v).split(',') : [String(v)]).map(norm);
      const tIds = ids(t.facts[rc.key]);
      const asCredited = rc.split === 'artist';
      const keyOf = o => (asCredited ? null : norm(o).replace(/ & others$/, '').split(' & ')[0]);
      const has = (it, o) => (asCredited ? norm(it.facts[rc.key]) === norm(o) : ids(it.facts[rc.key]).includes(keyOf(o)));
      const rightIds = asCredited ? [norm(right)] : rc.split === 'people' && !rc.first ? right.replace(/ & others$/, '').split(' & ').map(norm) : [norm(right)];
      ok(asCredited ? norm(t.facts[rc.key]) === norm(right) : rightIds.every(x => tIds.includes(x)), `${r.label} answer is the item's (${right}) ${tag} ${q.id}`);
      // shared credits: the best-known person alone, and every option one person
      if (CC.isCredit(rc.key) && !rc.first) ok(right === CC.leadOf(t.facts[rc.key]) && r.options.every(o => !/ & /.test(o)), `${r.label} names the best-known co-credit only (${right}) ${tag} ${q.id}`);
      const credits = new Set(c.rows.filter(x => x.kind === 'fact' && x.split).flatMap(x => (x.split ? String(t.facts[x.key] ?? '').split(SPLIT[x.split]) : [])).map(norm).filter(Boolean));
      r.options.forEach((o, i) => {
        if (i === a) return;
        if (rc.fromOptions) { ok(o === optItems.find(it => norm(it.facts[rc.key]) === norm(o))?.facts[rc.key] || optItems.length < 4, `${r.label} options are the name row's ${tag} ${q.id}`); return; }
        const src = pack.items.filter(it => it !== t && has(it, o));
        ok(src.length > 0, `${r.label} wrong option comes from a pack item (${o}) ${tag} ${q.id}`);
        ok(!(asCredited ? ids(o) : norm(o).split(' & ')).some(x => credits.has(norm(x)) || tIds.includes(norm(x))), `${r.label} wrong option is never credited on the item (${o}) ${tag} ${q.id}`);
        if (c.era) ok(src.some(it => Math.abs(it.facts[c.era] - y) <= (c.near || T.NEAR).at(-1)), `${r.label} wrong option is from the same era (${o}) ${tag} ${q.id}`);
        if (nameRow >= 0 && rc.split) ok(!optItems.filter(it => it !== t).some(it => has(it, o)), `${r.label} never pairs with another name option ${tag} ${q.id}`);
        if (c.spread && nameRow >= 0) ok(src.some(it => optItems.filter(it => it !== t).some(x => x.facts[c.spread] === it.facts[c.spread])), `${r.label} follows the name row's ${c.spread}s ${tag} ${q.id}`);
      });
      if (c.era && !rc.fromOptions) {
        // giveaway: every option is someone with work from the item's era, so no option stands alone
        const era = r.options.filter(o => pack.items.some(it => Math.abs(it.facts[c.era] - y) <= (c.near || T.NEAR).at(-1) && has(it, o)));
        ok(era.length === 4, `${r.label}: all four options from the item's era ${tag} ${q.id}`);
      }
    }
    // no row's answer is hinted at by the prompt or by another row
    const wrong = r.options.filter((_, i) => i !== a);
    ok(!reg.givesAway(right, q.prompt, wrong), `prompt doesn't give ${r.label} away ${tag} ${q.id}`);
    ok(!q.rows.some((s, si) => si !== ri && s.options.some(o => reg.givesAway(right, o, wrong))), `no other row gives ${r.label} away ${tag} ${q.id}`);
  });
  ok(q.answerText === q.rows.map((r, i) => r.options[q.answer[i]]).join(' · '), `answerText ${tag} ${q.id}`);
  return fail === before;
}

let total = 0;
const counts = {};
for (const id of Object.keys(conf)) {
  if (!index.packs[id]) continue;
  const pack = loadPack(id);
  counts[id] = {};
  for (const d of [0, 1, 2, 3]) {
    const gen = s => fmt.generate({ rng: rngFrom(`trio:${id}:${d}:${s}`), packs: [pack], count: 40, difficulty: d });
    const a = gen(1);
    ok(JSON.stringify(a) === JSON.stringify(gen(1)), `${id}/${d} deterministic`);
    const small = pack.items.length < 60;   // book-moments: 37 pictured books so far
    ok(a.length >= (small ? 12 : d === 0 ? 30 : 10), `${id}/${d} makes enough (${a.length})`);
    counts[id][d] = a.length;
    for (const q of [...a, ...gen(2)]) { validate(q, pack, d, `${id}/${d}`); total++; }
    if (d && !small) {
      const lv = a.map(q => pack.items.find(it => `${id}/${it.id}` === q.refs[0])?.difficulty || 2);
      const avail = pack.items.filter(it => (it.difficulty || 2) === d).length;
      ok(lv.filter(x => x === d).length >= Math.min(a.length, avail) * 0.5, `${id}/${d} mostly level-${d} items (${lv.filter(x => x === d).length}/${a.length})`);
    }
    ok(fmt.generate({ rng: rngFrom('k'), packs: [pack], count: 10, difficulty: 1, kids: true }).length === 0, `${id}: nothing in kids mode`);
  }
}
// variants per subject
const L = (id, d = 0) => fmt.generate({ rng: rngFrom('v' + id), packs: [loadPack(id)], count: 30, difficulty: d });
ok(L('movie-moments').every(q => q.data.layout === 'pic' && q.rows.map(r => r.label).join() === 'Film,Director,Year'), 'movie moments: picture + Film / Director / Year');
ok(L('movies').every(q => q.data.layout === 'text' && q.rows[0].label === 'Director' && q.rows[1].label === 'Year') && L('movies').some(q => q.rows[2]?.label === 'Starring'), 'movies: title shown, Director / Year (/ Starring)');
ok(L('hits-1980s').every(q => q.data.layout === 'audio' && q.data.len === 10 && q.rows.map(r => r.label).join() === 'Song,Artist,Year'), 'hits: clip + Song / Artist / Year');
ok(L('books').every(q => q.data.layout === 'text' && q.rows.map(r => r.label).join() === 'Author,Year'), 'books: title shown, Author / Year');
ok(L('countries').filter(q => q.data.layout === 'pic').every(q => q.rows[0].label === 'Country' && q.media.img[0].src.includes('Flag')), 'countries: the flag + Country / Capital / Continent');
ok(L('inventions').every(q => q.data.layout === 'pic' && q.rows.map(r => r.label).join() === 'Invention,Inventor,Year'), 'inventions: picture + Invention / Inventor / Year');
ok(L('paintings').every(q => q.data.layout === 'pic' && q.rows.map(r => r.label).join() === 'Painting,Artist,Year'), 'paintings: picture + Painting / Artist / Year');
ok(L('landmarks').every(q => q.data.layout === 'pic' && /^Landmark,Country(,Continent)?$/.test(q.rows.map(r => r.label).join())), 'landmarks: picture + Landmark / Country / Continent');
{
  const inv = loadPack('inventions');
  inv.items.forEach(it => { delete it.media; });
  const qs = fmt.generate({ rng: rngFrom('inv-text'), packs: [inv], count: 20, difficulty: 0 });
  ok(qs.length >= 12 && qs.every(q => q.data.layout === 'text' && /^Inventor,Year(,Country)?$/.test(q.rows.map(r => r.label).join())) && qs.some(q => q.rows.length === 3), 'inventions without pictures: Inventor / Year (/ Country)');
  qs.forEach(q => validate(q, inv, 0, 'inventions-text'));
}
// a pack whose items gain pictures switches to the picture variant by itself (books → Book / Author / Year)
{
  const bk = loadPack('books');
  bk.items.forEach((it, i) => { if (i % 2 === 0) it.media = { img: [{ src: `media/x/${i}.webp`, w: 640, h: 427 }] }; });
  const qs = fmt.generate({ rng: rngFrom('bm'), packs: [bk], count: 20, difficulty: 0 });
  ok(qs.length >= 15 && qs.every(q => q.data.layout === 'pic' && q.rows.map(r => r.label).join() === 'Book,Author,Year'), 'books with pictures: Book / Author / Year');
  qs.forEach(q => validate(q, bk, 0, 'books+pics'));
  ok(qs.every(q => bk.items.find(it => `books/${it.id}` === q.refs[0]).media?.img), 'only pictured books are asked from a picture');
}
// songs without a clip fall back to the title shown, Artist + Year
{
  const hp = loadPack('hits-1990s');
  hp.items.forEach(it => { delete it.media; });
  const qs = fmt.generate({ rng: rngFrom('nc'), packs: [hp], count: 15, difficulty: 0 });
  ok(qs.length >= 10 && qs.every(q => q.data.layout === 'text' && !q.data.a && q.rows.map(r => r.label).join() === 'Artist,Year'), 'songs without clips: Artist / Year');
}
// year spacing by level (years.js): hard 1–2, medium/any 2–3, easy 4–6, kids 10–12; also the mc year questions
{
  const r = rngFrom('years');
  for (const [d, lo, hi, kids] of [[1, 4, 6], [2, 2, 3], [0, 2, 3], [3, 1, 2], [2, 10, 12, true]]) for (let i = 0; i < 200; i++) {
    const y = 1950 + Math.floor(r() * 60);
    const o = Y.yearOptions(r, y, 4, { level: d, kids });
    const gaps = o.years.slice(1).map((v, j) => v - o.years[j]);
    ok(o.years[o.answer] === y && gaps.every(x => x >= lo && x <= hi), `year options level ${d}${kids ? ' kids' : ''}: ${lo}–${hi} apart (${gaps})`);
  }
  const pos = new Set(); for (let i = 0; i < 60; i++) pos.add(Y.yearOptions(r, 1990, 4).answer);
  ok(pos.size === 4, 'the right year lands in every position');
  ok(Y.yearOptions(r, 2025, 4, { level: 1 }).years.every(v => v <= 2026), 'never a year after 2026');
  // pack mc questions with a year answer ("In which year was Jaws released?")
  const mcF = reg.getFormat('mc') || (await imp('js/formats/mc.js')).default;
  const made = {};
  for (const id of ['movies', 'history', 'books']) {
    const pack = loadPack(id);
    for (const [d, kids] of [[0], [1], [2], [3], [1, true]]) {
      const qs = mcF.generate({ rng: rngFrom(`mcy:${id}:${d}`), packs: [{ ...pack, items: [] }], count: 80, opts: { answers: 4, source: 'questions' }, difficulty: d, kids });
      const yq = qs.filter(q => /\b(year|when)\b/i.test(q.prompt) && q.options.every(o => /^\d{3,4}$/.test(o.text)));
      made[id] = (made[id] || 0) + yq.length;
      const [lo, hi] = Y.stepsFor(d || 2, !!kids);
      for (const q of yq) {
        const ys = q.options.map(o => +o.text), gaps = ys.slice(1).map((v, j) => v - ys[j]);
        ok(gaps.every(g => g >= lo && g <= hi) && q.options[q.answer].text === q.answerText, `mc year question ${id}/${d}${kids ? ' kids' : ''}: ${lo}–${hi} apart (${ys}) ${q.id}`);
        const src = pack.questions.find(x => `mc:${id}/q:${x.id}` === q.id);
        ok(src && String(src.answer) === q.answerText, `mc year answer unchanged ${q.id}`);
      }
    }
  }
  ok(Object.values(made).every(n => n >= 20), `mc year questions checked ${JSON.stringify(made)}`);
}
// co-credits in the regular mc questions: "Who directed Aladdin?" offers Ron Clements, never John Musker as a wrong option
{
  const mcF = reg.getFormat('mc') || (await imp('js/formats/mc.js')).default;
  let seen = 0;
  for (const id of ['movie-moments', 'books', 'inventions']) {
    if (!index.packs[id]) continue;
    const pack = loadPack(id);
    // movie-moments asks only films whose director is in the directors pack (factsMeta.levelled); lift that here so every
    // co-credited film goes through the picture question's credit rules
    if (pack.factsMeta?.director?.levelled) pack.factsMeta = { ...pack.factsMeta, director: { ...pack.factsMeta.director, levelled: false } };
    const qs = mcF.generate({ rng: rngFrom('cc' + id), packs: [{ ...pack, questions: [] }], count: 400, opts: { answers: 4, source: 'facts' }, difficulty: 0 });
    for (const q of qs.filter(q => /^mc:(cat|img):(director|author|inventor):/.test(q.id))) {
      const key = q.id.split(':')[2], t = pack.items.find(it => `${id}/${it.id}` === q.refs[0]);
      const ps = CC.people(t.facts[key]).map(norm);
      if (ps.length > 1) seen++;
      ok(q.answerText === CC.leadOf(t.facts[key]), `mc ${key}: the answer is the best-known credit (${q.answerText}) ${q.id}`);
      ok(q.options.every((o, i) => i === q.answer || !ps.includes(norm(o.text))), `mc ${key}: no co-credit as a wrong option ${q.id}`);
      ok(q.options.every(o => CC.people(o.text).length === 1 || /^the /i.test(o.text)), `mc ${key}: one person per option (${q.options.map(o => o.text)}) ${q.id}`);
    }
    for (const q of qs.filter(q => /^mc:rev:(director|author):/.test(q.id))) {
      const key = q.id.split(':')[2], who = norm(q.prompt.replace(/^.*by (.+)\?$/, '$1'));
      const hits = q.options.filter(o => CC.people(pack.items.find(it => it.name === o.text)?.facts[key]).map(norm).includes(who));
      ok(hits.length === 1 && hits[0].text === q.answerText, `mc rev ${key}: exactly one option credits ${who} ${q.id}`);
    }
  }
  ok(seen >= 5, `mc co-credit questions checked (${seen})`);
  ok(CC.leadOf('Ron Clements, John Musker') === 'Ron Clements' && CC.leadOf('Clyde Geronimi, Wilfred Jackson, Hamilton Luske') === 'Clyde Geronimi' && CC.leadOf('Jane Austen') === 'Jane Austen', 'leadOf picks the most-credited, ties to the first listed');
}
// sequels / look-alikes in the name row (registry looksAlike, as mc): easy none, medium and any one pair at most,
// hard offers the target's own series first (Harry Potter, the MCU…)
{
  const pairsOf = (items) => { let n = 0; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (reg.looksAlike(items[i], items[j]) || (items[i].facts?.franchise && items[i].facts.franchise === items[j].facts?.franchise)) n++; return n; };
  const most = {};
  for (const id of ['movie-moments', 'book-moments', 'books']) {
    if (!index.packs[id]) continue;
    const pack = loadPack(id);
    // books (no pictures) has no name row; give it pictures so the rule is checked on a pack with long series
    if (id === 'books') pack.items.forEach((it, i) => { it.media = { img: [{ src: `media/x/${i}.webp`, w: 640, h: 427 }] }; });
    for (const d of [0, 1, 2, 3]) {
      const qs = fmt.generate({ rng: rngFrom(`series:${id}:${d}`), packs: [pack], count: 120, difficulty: d });
      let max = 0;
      for (const q of qs) {
        const items = q.rows[0].options.map(n => pack.items.find(it => it.name === n));
        const p = pairsOf(items);
        max = Math.max(max, p);
        if (d === 1) ok(p === 0, `easy: no two name options from one series or look-alike (${q.rows[0].options}) ${q.id}`);
        if (d === 2 || d === 0) ok(p <= 1, `medium/any: at most one same-series pair (${q.rows[0].options}) ${q.id}`);
      }
      most[`${id}/${d}`] = max;
    }
  }
  ok(Math.max(most['books/3'] || 0, most['movie-moments/3'] || 0) >= 3, `hard: several from one series appear (${JSON.stringify(most)})`);
  // movies (text variant) has no name row, so it is untouched; a hard Harry Potter question can offer the series
  const bk = loadPack('books');
  bk.items.forEach((it, i) => { it.media = { img: [{ src: `media/x/${i}.webp`, w: 640, h: 427 }] }; if (/harry potter/i.test(it.name)) it.difficulty = 3; });
  const hp = fmt.generate({ rng: rngFrom('hp'), packs: [{ ...bk, items: bk.items.filter(it => /harry potter/i.test(it.name) || (it.difficulty || 2) === 3) }], count: 60, difficulty: 3 })
    .filter(q => /harry potter/i.test(q.answerText));
  ok(hp.some(q => q.rows[0].options.filter(o => /harry potter/i.test(o)).length >= 3), `hard Harry Potter: 3+ of the series offered (${hp.map(q => q.rows[0].options.filter(o => /harry potter/i.test(o)).length)})`);
}
// falsify: the validator must catch broken questions
{
  const pack = loadPack('movie-moments');
  const q = fmt.generate({ rng: rngFrom('f'), packs: [pack], count: 1, difficulty: 0 })[0];
  const snap = [pass, fail];
  const broken = [
    x => { x.answer[0] = (x.answer[0] + 1) % 4; },
    x => { x.rows[2].options[x.answer[2]] = String(+x.rows[2].options[x.answer[2]] + 1); },
    x => { const d = x.rows[1]; d.options[(x.answer[1] + 1) % 4] = pack.items.find(it => `movie-moments/${it.id}` === x.refs[0]).facts.director; },
    x => { x.rows[1].options[(x.answer[1] + 1) % 4] = 'Victor Fleming'; },
  ];
  const quiet = console.log; console.log = () => {};
  const caught = broken.map(f => { const b = JSON.parse(JSON.stringify(q)); f(b); const before = fail; validate(b, pack, 0, 'falsify'); return fail > before; });
  console.log = quiet;
  [pass, fail] = snap;
  shown.clear();
  ok(caught.every(Boolean), `validator catches every planted fault (${caught})`);
}

console.log('questions checked:', total, JSON.stringify(counts));
console.log(`trio_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
