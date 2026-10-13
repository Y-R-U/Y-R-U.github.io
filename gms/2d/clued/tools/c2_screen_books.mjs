// Lane SCREEN: books 90 → ~250. extendBooks(pack) appends c2_src/books_more.mjs (same item shape and question templates as
// c2_build_books.mjs) and adds `country` to every book. Author must match Wikidata P50 and the Wikipedia lead/infobox, the
// year Wikidata P577 (±1) or the lead sentence, the country the book's (P495) or its author's (P27) on Wikidata.
import { fetchText, wpQids, wdEntities, claims, wdYear, label, slug, leaks, rng, sample } from './c2_lib.mjs';
import { QID_ISO, isoName, wpLeads, leadFacts, wpInfobox, ibField } from './c2_screen_lib.mjs';
import { pool } from './c2_screen_movies.mjs';
import { BOOKS_MORE, OLD_BOOK_COUNTRY } from './c2_src/books_more.mjs';
import { BOOKS } from './c2_src/books.mjs';

const OLD_IDS = new Set(BOOKS.trim().split('\n').map(l => slug(l.split('|')[1])));
const EXTRA = { Q174193: ['GBR', 'IRL'], Q161885: ['GBR'], Q179876: ['GBR'], Q28513: ['AUT', 'CZE', 'HUN'], Q15180: ['RUS'], Q34266: ['RUS'], Q31747: ['IRL'], Q70972: ['FRA'], Q172579: ['ITA'], Q41304: ['DEU'], Q43287: ['DEU'] };
const isosOf = qs => [...new Set(qs.flatMap(id => EXTRA[id] || [QID_ISO[id]]).filter(Boolean))];
const STOPS = ['the', 'and', 'adventures', 'story', 'book', 'tale', 'little', 'great', 'world', 'man', 'girl', 'boy', 'kid', 'diary', 'young', 'house', 'call'];
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const flat = s => s.toLowerCase().replace(/\r/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/_/g, '').replace(/—|--/g, '—').replace(/\s+/g, ' ');
function centuryOf(y) { const c = Math.floor((y - 1) / 100) + 1; return `${c}${c % 10 === 1 && c !== 11 ? 'st' : c % 10 === 2 && c !== 12 ? 'nd' : c % 10 === 3 && c !== 13 ? 'rd' : 'th'} century`; }

export function stripBooks(pack) {
  const gone = new Set(pack.items.filter(it => !OLD_IDS.has(it.id)).map(it => it.id));
  pack.items = pack.items.filter(it => !gone.has(it.id));
  pack.questions = pack.questions.filter(q => !(q.refs || []).some(r => gone.has(r.split('/')[1])));
  for (const it of pack.items) delete it.facts.country;
  delete pack.factsMeta.country;
  pack.sources = (pack.sources || []).filter(s => !/country/.test(s.name));
  return pack;
}

async function countryCheck(items, note) {
  // items: [{ name, title, iso }] → Set of names whose iso is confirmed
  const q = await wpQids(items.map(i => i.title));
  const ents = await wdEntities(Object.values(q).filter(Boolean));
  const aIds = [...new Set(Object.values(ents).flatMap(e => claims(e, 'P50').map(v => v.id)))];
  const auth = await wdEntities(aIds, 'claims|labels');
  const out = new Map();
  for (const i of items) {
    const e = ents[q[i.title]];
    if (!e) { out.set(i.name, { ok: false, why: 'not on Wikidata' }); continue; }
    const book = isosOf(claims(e, 'P495').map(v => v.id));
    const author = isosOf(claims(e, 'P50').flatMap(v => claims(auth[v.id], 'P27').map(c => c.id)));
    out.set(i.name, { ok: book.includes(i.iso) || author.includes(i.iso), why: `book ${book.join(',') || '-'}, author ${author.join(',') || '-'}`, e, auth });
  }
  return out;
}

export async function extendBooks(pack, note = console.log) {
  const rows = BOOKS_MORE.trim().split('\n').map(l => {
    const [title, name, author, year, genre, d, kids, iso, gut, first, clues, alt, summary] = l.split('|').map(s => s.trim());
    return { title, name, author, year: +year, genre, d: +d, kids: kids === '1', iso, gut: gut ? +gut : null, first, clues: clues.split(';').map(s => s.trim()), alt: alt ? alt.split(';') : [], summary };
  });
  for (const r of rows) {
    if (r.first && (r.year >= 1930 || !r.gut)) throw new Error(`first line not allowed on ${r.name}`);
    if (!r.summary || r.summary.split(/\s+/).length > 45) throw new Error(`summary missing or too long: ${r.name}`);
  }
  // country on the old books
  const oldTitles = BOOKS.trim().split('\n').map(l => { const p = l.split('|'); return { title: p[0], name: p[1], id: slug(p[1]) }; });
  const oc = await countryCheck(oldTitles.map(o => ({ ...o, iso: OLD_BOOK_COUNTRY[o.id] })), note);
  for (const o of oldTitles) {
    const it = pack.items.find(i => i.id === o.id), c = oc.get(o.name), iso = OLD_BOOK_COUNTRY[o.id];
    if (!it || !iso) continue;
    if (c?.ok) it.facts.country = isoName(iso); else note(`old book country not confirmed ${o.name}: mine ${iso}, ${c?.why}`);
  }

  const leads = await wpLeads(rows.map(r => r.title));
  const nc = await countryCheck(rows, note);
  const ibs = await pool(rows.map(r => r.title), 4, wpInfobox);
  const ids = new Set(pack.items.map(i => i.id));
  const ok = [];
  for (const r of rows) {
    const drop = why => note(`DROPPED ${r.name}: ${why}`);
    const c = nc.get(r.name);
    if (!c?.e) { drop('not on Wikidata'); continue; }
    const as = claims(c.e, 'P50').map(v => label(c.auth[v.id]) || '');
    const last = norm(r.author).split(/[ .]+/).filter(Boolean).pop(), stem = last.slice(0, 5);
    if (!as.some(a => norm(a).split(/[ .]+/).some(w => w.startsWith(stem)))) { drop(`author: mine ${r.author}, Wikidata ${as.join(', ') || '-'}`); continue; }
    const lf = leadFacts(leads[r.title]);
    const ib = ibs[r.title] || '';
    if (!norm(lf.text).includes(last) && !norm(ibField(ib, 'author')).includes(last)) { drop(`author ${r.author} not in the Wikipedia lead or infobox`); continue; }
    const ys = claims(c.e, 'P577').map(wdYear).filter(Boolean);
    const ibY = (/\b(1[5-9]\d\d|20[0-2]\d)\b/.exec(['release_date', 'published', 'pub_date'].map(k => ibField(ib, k)).join(' ')) || [])[1];
    const wdOk = ys.some(y => Math.abs(y - r.year) <= 1), wpOk = lf.year === r.year || +ibY === r.year;
    if (ys.length && !wdOk) { drop(`year: mine ${r.year}, Wikidata ${ys.join(',')}`); continue; }
    if (!wdOk && !wpOk) { drop(`year: mine ${r.year}, Wikidata ${ys.join(',') || '-'}, lead ${lf.year ?? '-'}, infobox ${ibY ?? '-'}`); continue; }
    if (!c.ok) { drop(`country: mine ${r.iso}, ${c.why}`); continue; }
    r.id = slug(r.name);
    if (ids.has(r.id)) { drop(`already in the pack (${r.id})`); continue; }
    ids.add(r.id);
    ok.push(r);
  }
  for (const r of ok.filter(r => r.first)) {
    let text = '';
    try { text = flat(await fetchText(`https://www.gutenberg.org/cache/epub/${r.gut}/pg${r.gut}.txt`)); } catch (e) { note(`gutenberg fetch failed #${r.gut} ${r.name}: ${e.message}`); }
    if (!text.includes(flat(r.first))) { note(`first line NOT found in Gutenberg #${r.gut} for ${r.name} -> dropped`); r.first = ''; }
    else r.firstSource = `https://www.gutenberg.org/ebooks/${r.gut}`;
  }
  const added = ok.map(r => {
    const names = [r.name, ...r.alt];
    const fl = r.first && `It opens: “${r.first.replace(/[;:,—]$/, '…')}”`;
    const auto = [`It comes from ${/^(United States|United Kingdom|Netherlands)$/.test(isoName(r.iso)) ? 'the ' : ''}${isoName(r.iso)}.`, `Genre: ${r.genre}.`, `It was first published in ${r.year}.`, fl, `It was written by ${r.author}.`].filter(Boolean);
    const h = r.clues.map(c => c + '.');
    const clues = [...h.slice(0, -1), ...auto, h[h.length - 1]].filter(c => !leaks(c, names, STOPS) || /^It was written by|^It was first published|^It comes from/.test(c));
    if (clues.length < 5) note(`few clues ${r.name}: ${clues.length}`);
    const it = {
      id: r.id, name: r.name, alt: r.alt, group: r.genre,
      facts: { author: r.author, year: r.year, genre: r.genre, century: centuryOf(r.year), kids: r.kids || undefined, country: isoName(r.iso) },
      blurb: `${r.name} (${r.year}) by ${r.author}. ${r.summary}`, summary: r.summary, clues, difficulty: r.d,
    };
    if (r.first) Object.assign(it, { firstLine: r.first.replace(/[;:,—]$/, '…'), firstLineSource: r.firstSource });
    return it;
  });
  pack.items.push(...added);
  note(`books: ${pack.items.length - added.length} old + ${added.length} new (${rows.length - added.length} of ${rows.length} candidates dropped)`);
  for (const it of added) questions(pack, it);
  pack.factsMeta.country = { type: 'cat', label: 'Country of origin', ask: 'Which country does the book {name} come from?', askReverse: 'Which of these books comes from {value}?', stmt: 'The book {name} comes from {value}.' };
  if (!pack.sources.some(s => /country/.test(s.name))) pack.sources.push({ name: 'Wikidata (country of origin of the book or citizenship of its author)', url: 'https://www.wikidata.org' });
  return pack;
}

// same templates as c2_build_books questions()
function questions(pack, it) {
  const r = rng('books+' + it.id);
  const items = pack.items;
  const allAuthors = [...new Set(items.map(i => i.facts.author))];
  const near = allAuthors.filter(a => a !== it.facts.author);
  const close = near.filter(a => items.some(x => x.facts.author === a && Math.abs(x.facts.year - it.facts.year) <= 60));
  const qs = [];
  qs.push({ id: `author-${it.id}`, kind: 'mc', prompt: `Who wrote ${it.name}?`, answer: it.facts.author, wrong: sample(r, close.length >= 3 ? close : near, 3), explain: it.blurb, difficulty: it.difficulty, refs: [`books/${it.id}`] });
  const plotWrong = sample(r, items.filter(x => x !== it && Math.abs(x.difficulty - it.difficulty) <= 1 && x.facts.kids === it.facts.kids), 3).map(x => x.name);
  const plot = { id: `plot-${it.id}`, kind: 'mc', prompt: `Which book is this? ${it.summary.replace(new RegExp(it.name, 'g'), 'the book')}`, answer: it.name, wrong: plotWrong, explain: it.blurb, difficulty: it.difficulty, refs: [`books/${it.id}`] };
  if (!leaks(it.summary, [it.name], STOPS)) qs.push(plot);
  if (it.firstLine) {
    const fw = sample(r, items.filter(x => x !== it && x.facts.year < 1930), 3).map(x => x.name);
    qs.push({ id: `first-${it.id}`, kind: 'mc', prompt: `Which book begins: “${it.firstLine}”`, answer: it.name, wrong: fw, explain: it.blurb, difficulty: Math.min(3, it.difficulty + 1), refs: [`books/${it.id}`] });
  }
  if (it.difficulty >= 2) {
    const wy = sample(r, [-30, -20, -10, 10, 20, 30].map(d => it.facts.year + d).filter(y => y <= 2025), 3).map(String);
    qs.push({ id: `year-${it.id}`, kind: 'mc', prompt: `Roughly when was ${it.name} first published?`, answer: String(it.facts.year), wrong: wy, explain: it.blurb, difficulty: 3, refs: [`books/${it.id}`] });
  }
  pack.questions.push(...qs);
}
