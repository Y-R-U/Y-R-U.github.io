// Lane SCREEN: movies 77 → ~400. extendMovies(pack) appends the films in c2_src/films_more.mjs and adds the new facts
// (country, stars, franchise, bestPicture) to every film; existing fields and questions are never changed.
// Used by tools/c2_screen_add.mjs (on the pack on disk) and tools/c2_build_movies.mjs (full rebuild).
import { fetchJSON, slug, leaks, rng, sample } from './c2_lib.mjs';
import { wpQids, wdEntities, claims, wdYear, label, wpLeads, leadFacts, wpInfobox, ibField, ibLinks, ibEntries, sitelinkCounts, QID_ISO, isoName, demonymIsos } from './c2_screen_lib.mjs';
import { FILMS_MORE } from './c2_src/films_more.mjs';

const BEST_PICTURE = 'Q102427';
// franchise of the films that were already in the pack
const OLD_FRANCHISE = {
  jaws: 'Jaws', rocky: 'Rocky', 'star-wars': 'Star Wars', 'the-empire-strikes-back': 'Star Wars', 'return-of-the-jedi': 'Star Wars',
  'star-wars-episode-i-the-phantom-menace': 'Star Wars', 'star-wars-the-force-awakens': 'Star Wars', 'star-wars-the-last-jedi': 'Star Wars',
  moonraker: 'James Bond', 'raiders-of-the-lost-ark': 'Indiana Jones', 'indiana-jones-and-the-temple-of-doom': 'Indiana Jones',
  'indiana-jones-and-the-last-crusade': 'Indiana Jones', ghostbusters: 'Ghostbusters', 'back-to-the-future': 'Back to the Future',
  'top-gun': 'Top Gun', 'top-gun-maverick': 'Top Gun', 'terminator-2-judgment-day': 'Terminator', 'jurassic-park': 'Jurassic Park',
  'the-lost-world-jurassic-park': 'Jurassic Park', 'jurassic-world': 'Jurassic Park', 'toy-story': 'Toy Story', 'toy-story-3': 'Toy Story',
  'mission-impossible-2': 'Mission: Impossible', 'harry-potter-and-the-philosopher-s-stone': 'Harry Potter', 'harry-potter-and-the-goblet-of-fire': 'Harry Potter',
  'harry-potter-and-the-order-of-the-phoenix': 'Harry Potter', 'harry-potter-and-the-half-blood-prince': 'Harry Potter',
  'harry-potter-and-the-deathly-hallows-part-2': 'Harry Potter', 'the-lord-of-the-rings-the-two-towers': 'The Lord of the Rings',
  'the-lord-of-the-rings-the-return-of-the-king': 'The Lord of the Rings', 'shrek-2': 'Shrek', 'pirates-of-the-caribbean-dead-man-s-chest': 'Pirates of the Caribbean',
  'pirates-of-the-caribbean-at-world-s-end': 'Pirates of the Caribbean', 'the-dark-knight': 'Batman', batman: 'Batman', avatar: 'Avatar',
  'avatar-the-way-of-water': 'Avatar', 'avatar-fire-and-ash': 'Avatar', 'the-avengers': 'Marvel Cinematic Universe', 'avengers-age-of-ultron': 'Marvel Cinematic Universe',
  'avengers-infinity-war': 'Marvel Cinematic Universe', 'avengers-endgame': 'Marvel Cinematic Universe', 'captain-america-civil-war': 'Marvel Cinematic Universe',
  'black-panther': 'Marvel Cinematic Universe', 'spider-man-no-way-home': 'Marvel Cinematic Universe', 'deadpool-and-wolverine': 'Marvel Cinematic Universe',
  frozen: 'Frozen', 'frozen-ii': 'Frozen', 'transformers-age-of-extinction': 'Transformers', 'inside-out-2': 'Inside Out', 'zootopia-2': 'Zootopia',
  'men-in-black': 'Men in Black', 'furious-7': 'Fast & Furious', 'the-godfather': 'The Godfather', superman: 'Superman', 'the-lion-king': 'The Lion King',
  'the-lion-king-2019': 'The Lion King',
};
const OLD_BP = new Set(['rocky', 'the-godfather', 'kramer-vs-kramer', 'rain-man', 'forrest-gump', 'titanic', 'the-lord-of-the-rings-the-return-of-the-king']);
// Wikipedia titles of the old films whose pack name is not their article title
const OLD_TITLE = { 'harry-potter-and-the-philosopher-s-stone': "Harry Potter and the Philosopher's Stone (film)", 'harry-potter-and-the-goblet-of-fire': 'Harry Potter and the Goblet of Fire (film)', 'harry-potter-and-the-order-of-the-phoenix': 'Harry Potter and the Order of the Phoenix (film)', 'harry-potter-and-the-half-blood-prince': 'Harry Potter and the Half-Blood Prince (film)', 'the-lion-king-2019': 'The Lion King (2019 film)', 'the-lion-king': 'The Lion King', aladdin: 'Aladdin (1992 Disney film)', superman: 'Superman (1978 film)', batman: 'Batman (1989 film)', ghost: 'Ghost (1990 film)', 'star-wars': 'Star Wars (film)', avatar: 'Avatar (2009 film)', frozen: 'Frozen (2013 film)', titanic: 'Titanic (1997 film)', 'top-gun': 'Top Gun', 'animal-house': 'National Lampoon\'s Animal House', grease: 'Grease (film)', jaws: 'Jaws (film)', rocky: 'Rocky', armageddon: 'Armageddon (1998 film)', 'independence-day': 'Independence Day (1996 film)', 'men-in-black': 'Men in Black (1997 film)', barbie: 'Barbie (film)', 'jurassic-park': 'Jurassic Park (film)', 'toy-story': 'Toy Story', 'the-dark-knight': 'The Dark Knight', 'the-avengers': 'The Avengers (2012 film)', 'black-panther': 'Black Panther (film)', moonraker: 'Moonraker (film)', ghostbusters: 'Ghostbusters', 'back-to-the-future': 'Back to the Future', 'forrest-gump': 'Forrest Gump', 'rain-man': 'Rain Man', 'the-godfather': 'The Godfather', 'fatal-attraction': 'Fatal Attraction', 'enter-the-dragon': 'Enter the Dragon', 'the-sixth-sense': 'The Sixth Sense', 'smokey-and-the-bandit': 'Smokey and the Bandit', 'kramer-vs-kramer': 'Kramer vs. Kramer', 'close-encounters-of-the-third-kind': 'Close Encounters of the Third Kind', 'furious-7': 'Furious 7', 'jurassic-world': 'Jurassic World', 'zootopia-2': 'Zootopia 2', 'inside-out-2': 'Inside Out 2', 'ne-zha-2': 'Ne Zha 2', 'avatar-fire-and-ash': 'Avatar: Fire and Ash', 'frozen-ii': 'Frozen II', 'the-super-mario-bros-movie': 'The Super Mario Bros. Movie', 'deadpool-and-wolverine': 'Deadpool & Wolverine', 'top-gun-maverick': 'Top Gun: Maverick' };

const STOPS = ['star', 'wars', 'king', 'story', 'movie', 'part', 'the', 'and', 'kimetsu', 'yaiba', 'film'];
const dispName = t => t.includes('=') ? t.split('=')[1] : t.replace(/\s*\((\d{4} )?(American |Disney |[A-Z][a-z]+ )?film\)$/, '');
const decadeOf = y => `${Math.floor(y / 10) * 10}s`;
const fmtMoney = n => n >= 1e9 ? `$${(n / 1e9).toFixed(2)} billion` : `$${Math.round(n / 1e6)} million`;
const join2 = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cnText = v => [].concat(v).map(c => /^(United States|United Kingdom|Netherlands|Czech Republic|Philippines)$/.test(c) ? 'the ' + c : c).join(' and ');

// Country names in an infobox "country" value (plain text or links).
const COUNTRY_RE = new RegExp(`(?<![\\p{L}])(${['United States', 'United Kingdom', 'Hong Kong', 'New Zealand', 'South Korea', 'South Africa', 'West Germany', 'East Germany', 'Soviet Union', 'Czechoslovakia', 'Yugoslavia', 'Taiwan', 'Australia', 'Canada', 'France', 'Germany', 'Italy', 'Spain', 'Japan', 'China', 'India', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Ireland', 'Sweden', 'Denmark', 'Norway', 'Finland', 'Poland', 'Hungary', 'Austria', 'Switzerland', 'Belgium', 'Netherlands', 'Russia', 'Iran', 'Israel', 'Lebanon', 'Thailand', 'Indonesia', 'Czech Republic', 'Greece', 'Turkey', 'Egypt', 'Iceland', 'Romania', 'Luxembourg', 'Portugal', 'Malta', 'Morocco', 'Senegal', 'Nigeria', 'Kenya', 'Philippines', 'Singapore', 'Malaysia', 'Colombia', 'Peru', 'Cuba', 'Qatar', 'Cyprus', 'Bulgaria', 'Serbia', 'Croatia', 'Slovenia', 'Georgia'].join('|')})(?![\\p{L}])`, 'gu');
const NAME_ISO = { 'United States': 'USA', 'United Kingdom': 'GBR', 'Hong Kong': 'HKG', 'New Zealand': 'NZL', 'South Korea': 'KOR', 'South Africa': 'ZAF', 'West Germany': 'DEU', 'East Germany': 'DEU', 'Soviet Union': 'RUS', Czechoslovakia: 'CZE', Yugoslavia: 'SRB', Taiwan: 'TWN', Australia: 'AUS', Canada: 'CAN', France: 'FRA', Germany: 'DEU', Italy: 'ITA', Spain: 'ESP', Japan: 'JPN', China: 'CHN', India: 'IND', Mexico: 'MEX', Brazil: 'BRA', Argentina: 'ARG', Chile: 'CHL', Ireland: 'IRL', Sweden: 'SWE', Denmark: 'DNK', Norway: 'NOR', Finland: 'FIN', Poland: 'POL', Hungary: 'HUN', Austria: 'AUT', Switzerland: 'CHE', Belgium: 'BEL', Netherlands: 'NLD', Russia: 'RUS', Iran: 'IRN', Israel: 'ISR', Lebanon: 'LBN', Thailand: 'THA', Indonesia: 'IDN', 'Czech Republic': 'CZE', Greece: 'GRC', Turkey: 'TUR', Egypt: 'EGY', Iceland: 'ISL', Romania: 'ROU', Luxembourg: 'LUX', Portugal: 'PRT', Malta: 'MLT', Morocco: 'MAR', Senegal: 'SEN', Nigeria: 'NGA', Kenya: 'KEN', Philippines: 'PHL', Singapore: 'SGP', Malaysia: 'MYS', Colombia: 'COL', Peru: 'PER', Cuba: 'CUB', Qatar: 'QAT', Cyprus: 'CYP', Bulgaria: 'BGR', Serbia: 'SRB', Croatia: 'HRV', Slovenia: 'SVN', Georgia: 'GEO' };
export const infoboxIsos = v => [...new Set([...String(v).replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').matchAll(COUNTRY_RE)].map(m => NAME_ISO[m[1]]))];

// fn over items with n requests in flight → { item: result }
export async function pool(items, n, fn) {
  const out = {};
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const x = items[i++]; out[x] = await fn(x); } }));
  return out;
}

// Second-source facts for a set of Wikipedia titles. Returns { [title]: { qid, ent, lead, ib, … } }.
export async function screenFacts(titles, { castProps = ['P161', 'P725'], kind = 'film' } = {}) {
  const q = await wpQids(titles);
  const ents = await wdEntities(Object.values(q).filter(Boolean), 'claims|labels');
  const leads = await wpLeads(titles);
  const out = {};
  const wts = await pool(titles.filter(t => ents[q[t]]), 4, wpInfobox);
  for (const t of titles) {
    const ent = ents[q[t]];
    out[t] = ent ? { qid: q[t], ent, lead: leadFacts(leads[t]), wt: wts[t] } : null;
  }
  // link targets → qids for directors / stars / networks in one pass
  const linkTitles = new Set();
  for (const f of Object.values(out)) if (f) for (const fld of ['director', 'starring', 'voices', 'network', 'channel']) ibLinks(ibField(f.wt, fld)).forEach(x => linkTitles.add(x));
  const lq = await wpQids([...linkTitles]);
  const people = new Set();
  for (const f of Object.values(out)) if (f) {
    f.lq = lq;
    f.ibqOf = text => ibLinks(text).map(x => lq[x]).filter(Boolean);
    f.ibq = fld => f.ibqOf(ibField(f.wt, fld));
    for (const p of ['P57', ...castProps, 'P449']) claims(f.ent, p).forEach(v => people.add(v.id));
    for (const fld of ['starring', 'voices']) f.ibq(fld).forEach(x => people.add(x));
  }
  const pe = await wdEntities([...people], 'labels');
  for (const f of Object.values(out)) if (f) {
    f.labelOf = id => label(pe[id]);
    f.years = claims(f.ent, kind === 'tv' ? 'P580' : 'P577').map(wdYear).filter(Boolean);
    f.cast = new Set(castProps.flatMap(p => claims(f.ent, p).map(v => v.id)));
    f.p495 = [...new Set(claims(f.ent, 'P495').map(v => QID_ISO[v.id]).filter(Boolean))];
    f.ibIsos = infoboxIsos(ibField(f.wt, 'country'));
  }
  return out;
}

// Year: the Wikipedia lead ("is a 1994 American film") AND a Wikidata publication date must both equal the hand year.
export const yearAgrees = (mine, lead, wd) => lead === mine && wd.includes(mine);
// Directors: the credited ones linked in the infobox, all listed on Wikidata; or, for duos linked as one article
// ("Coen brothers"), every Wikidata director's surname written in the infobox. null = no agreement.
export function agreedDirectors(wd, credited, raw, labelOf) {
  const surname = id => (labelOf(id) || '').split(' ').pop();
  if (credited.length && credited.length <= 3 && credited.every(d => wd.includes(d))) return credited;
  if (wd.length && wd.length <= 3 && wd.every(d => surname(d) && raw.includes(surname(d)))) return wd;
  return null;
}
// Agreed countries: lead demonyms + infobox country (Wikipedia) ∩ Wikidata P495. [] = no agreement.
export function agreedCountries(f) {
  const wp = [...new Set([...f.lead.isos, ...f.ibIsos])];
  const both = wp.filter(i => f.p495.includes(i));
  return both.length ? both.slice(0, 3) : [];
}
// Top-billed stars: the infobox "starring" (then "voices") order, linked or plain text, each confirmed in the Wikidata
// cast (P161/P725). The first-billed name must be confirmed, else no stars at all (never a list missing its lead).
const pn = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
export function starsOf(f, n = 3) {
  const byLabel = new Map([...f.cast].map(id => [pn(f.labelOf(id)), id]).filter(([k]) => k));
  const ids = ['starring', 'voices'].flatMap(fld => ibEntries(ibField(f.wt, fld)).map(e => e.link ? (f.lq[e.link] || byLabel.get(pn(e.link.replace(/\s*\(.*\)$/, '')))) : byLabel.get(pn(e.text)) || null));
  if (!ids.length || !ids[0] || !f.cast.has(ids[0])) return [];
  return [...new Set(ids.filter(id => id && f.cast.has(id)))].slice(0, n).map(id => ({ id, name: f.labelOf(id) })).filter(s => s.name);
}

async function allTimeGross() {
  const j = await fetchJSON('https://en.wikipedia.org/w/api.php?action=parse&page=List_of_highest-grossing_films&prop=text&section=1&format=json&formatversion=2');
  const { parseHtmlTable } = await import('./c2_lib.mjs');
  const rows = parseHtmlTable(j.parse.text).filter(r => /^\d+$/.test(r[0]?.text) || /^\d+$/.test(r[1]?.text));
  const out = {};
  for (const r of rows) {
    const cell = r.find(c => c.href && !/^\d/.test(c.text));
    const money = r.find(c => c.text.startsWith('$'));
    if (cell && money) out[decodeURIComponent(cell.href).replace(/_/g, ' ')] = +money.text.replace(/[^\d]/g, '');
  }
  const q = await wpQids(Object.keys(out));
  return Object.fromEntries(Object.entries(out).map(([t, v]) => [q[t], v]).filter(([k]) => k));
}

// the films c2_build_movies makes itself (box-office lists); everything else in the pack came from FILMS_MORE
const BUILDER_IDS = new Set('jaws rocky star-wars grease moonraker the-empire-strikes-back raiders-of-the-lost-ark e-t-the-extra-terrestrial return-of-the-jedi ghostbusters back-to-the-future top-gun fatal-attraction rain-man indiana-jones-and-the-last-crusade ghost terminator-2-judgment-day aladdin jurassic-park the-lion-king toy-story independence-day titanic armageddon star-wars-episode-i-the-phantom-menace mission-impossible-2 harry-potter-and-the-philosopher-s-stone the-lord-of-the-rings-the-two-towers the-lord-of-the-rings-the-return-of-the-king shrek-2 harry-potter-and-the-goblet-of-fire pirates-of-the-caribbean-dead-man-s-chest pirates-of-the-caribbean-at-world-s-end the-dark-knight avatar toy-story-3 harry-potter-and-the-deathly-hallows-part-2 the-avengers frozen transformers-age-of-extinction star-wars-the-force-awakens captain-america-civil-war star-wars-the-last-jedi avengers-infinity-war avengers-endgame demon-slayer-kimetsu-no-yaiba-the-movie-mugen-train spider-man-no-way-home avatar-the-way-of-water barbie inside-out-2 ne-zha-2 superman the-godfather smokey-and-the-bandit animal-house close-encounters-of-the-third-kind kramer-vs-kramer enter-the-dragon batman indiana-jones-and-the-temple-of-doom forrest-gump the-sixth-sense the-lost-world-jurassic-park men-in-black harry-potter-and-the-order-of-the-phoenix harry-potter-and-the-half-blood-prince jurassic-world the-lion-king-2019 furious-7 frozen-ii avengers-age-of-ultron black-panther zootopia-2 top-gun-maverick avatar-fire-and-ash the-super-mario-bros-movie deadpool-and-wolverine'.split(' '));
// Undo a previous extendMovies (so the add script can rerun): new items, their questions, star- questions, new facts.
const NEW_FACTS = ['country', 'stars', 'franchise', 'bestPicture'];
export function stripMovies(pack) {
  const gone = new Set(pack.items.filter(it => !BUILDER_IDS.has(it.id)).map(it => it.id));
  pack.items = pack.items.filter(it => !gone.has(it.id));
  pack.questions = pack.questions.filter(q => !q.id.startsWith('star-') && !(q.refs || []).some(r => gone.has(r.split('/')[1])));
  for (const it of pack.items) for (const k of NEW_FACTS) delete it.facts[k];
  for (const k of NEW_FACTS) delete pack.factsMeta[k];
  pack.sources = (pack.sources || []).filter(s => !/lead sentence/.test(s.name));
  return pack;
}

export async function extendMovies(pack, note = console.log) {
  const rows = FILMS_MORE.trim().split('\n').map(l => {
    const [t, year, kids, d, franchise, bp, emoji, plot] = l.split('|');
    return { title: t.split('=')[0], name: dispName(t), year: +year, kids: kids === '1', d: +d, franchise: franchise || null, bp: bp === '1', emoji, plot };
  });
  const old = pack.items;
  const oldTitles = old.map(it => OLD_TITLE[it.id] || it.name);
  const facts = await screenFacts([...oldTitles, ...rows.map(r => r.title)]);
  const bpSet = async () => { const { sparql } = await import('./c2_lib.mjs'); return new Set((await sparql(`SELECT ?f WHERE { ?f wdt:P166 wd:${BEST_PICTURE} }`)).map(b => b.f.split('/').pop())); };
  const bpWinners = await bpSet();
  const gross = await allTimeGross();
  const fame = await sitelinkCounts(Object.values(facts).filter(Boolean).map(f => f.qid));
  const bpOf = (f, hand, name) => {
    const wd = bpWinners.has(f.qid);
    if (wd !== hand) { note(`best picture disagrees ${name}: hand ${hand}, wikidata ${wd} -> fact left out`); return undefined; }
    return wd;
  };

  // 1. new facts on the old films (old fields untouched)
  const oldQids = new Set();
  old.forEach((it, k) => {
    const f = facts[oldTitles[k]];
    if (!f) { note(`old film not found on Wikipedia/Wikidata: ${it.name} (${oldTitles[k]})`); return; }
    oldQids.add(f.qid);
    if (!f.years.includes(it.facts.year)) { note(`old film year check ${it.name}: pack ${it.facts.year}, wikidata ${f.years.join(',')} -> no new facts`); return; }
    const c = agreedCountries(f);
    if (c.length) it.facts.country = c.length === 1 ? isoName(c[0]) : c.map(isoName);
    else note(`old film country not agreed ${it.name}: wikipedia ${[...f.lead.isos, ...f.ibIsos].join(',') || '-'}, wikidata ${f.p495.join(',') || '-'}`);
    const st = starsOf(f);
    if (st.length) { it.facts.stars = st.map(s => s.name).join(', '); it.starIds = st.map(s => s.id); it.castIds = [...f.cast]; }
    if (OLD_FRANCHISE[it.id]) it.facts.franchise = OLD_FRANCHISE[it.id];
    const bp = bpOf(f, OLD_BP.has(it.id), it.name);
    if (bp !== undefined) it.facts.bestPicture = bp;
  });

  // 2. new films, each fact confirmed by Wikipedia and Wikidata
  const names = new Set(old.map(it => it.name.toLowerCase()));
  const ids = new Set(old.map(it => it.id));
  const added = [];
  for (const r of rows) {
    const f = facts[r.title];
    const drop = why => note(`DROPPED ${r.name}: ${why}`);
    if (!f) { drop('not found'); continue; }
    if (oldQids.has(f.qid) || added.some(a => a.qid === f.qid)) { drop('already in the pack'); continue; }
    if (!yearAgrees(r.year, f.lead.year, f.years)) { drop(`year: mine ${r.year}, Wikipedia lead ${f.lead.year ?? '-'}, Wikidata ${f.years.join(',') || '-'}`); continue; }
    const wdDir = claims(f.ent, 'P57').map(v => v.id), rawDir = ibField(f.wt, 'director');
    const dirIds = agreedDirectors(wdDir, f.ibqOf(rawDir.split(/uncredited|sequence director|co-director|additional/i)[0]), rawDir, f.labelOf);
    if (!dirIds) { drop(`director: Wikidata ${wdDir.map(f.labelOf).join(', ') || '-'} vs infobox ${ibLinks(rawDir).join(', ') || '-'}`); continue; }
    const director = dirIds.map(f.labelOf);
    if (director.some(x => !x)) { drop('director without a label'); continue; }
    const dirAll = wdDir.map(f.labelOf).filter(Boolean);
    const cs = agreedCountries(f);
    if (!cs.length) { drop(`country: Wikipedia ${[...f.lead.isos, ...f.ibIsos].join(',') || '-'}, Wikidata ${f.p495.join(',') || '-'}`); continue; }
    const bp = bpOf(f, r.bp, r.name);
    let name = r.name;
    if (names.has(name.toLowerCase())) name = `${name} (${r.year})`;
    let id = slug(name);
    if (ids.has(id)) { drop(`id clash ${id}`); continue; }
    names.add(name.toLowerCase()); ids.add(id);
    const st = starsOf(f);
    if (!st.length) note(`no confirmed stars: ${name}`);
    added.push({ r, f, name, id, qid: f.qid, director: director.join(' and '), dirAll, country: cs.map(isoName), stars: st, bp, gross: gross[f.qid] });
  }

  for (const a of added) {
    const { r, f } = a;
    const country = a.country.length === 1 ? a.country[0] : a.country;
    const starNames = a.stars.map(s => s.name);
    const decade = decadeOf(r.year);
    const auto = [
      a.gross && `It took about ${fmtMoney(a.gross)} at the worldwide box office.`,
      `It comes from ${cnText(country)}.`,
      `It was released in ${r.year}.`,
      a.bp && 'It won the Oscar for Best Picture.',
      `It was directed by ${a.director}.`,
      starNames.length && `It stars ${join2(starNames.slice(0, 2))}.`,
      starNames[2] && `Its cast also includes ${starNames[2]}.`,
      r.kids && 'It is a family film.',
      r.franchise && `It is part of the ${r.franchise} franchise.`,
    ].filter(Boolean);
    const clues = [...auto, r.plot + '.'].filter(c => !leaks(c, [a.name], STOPS) || /^It was directed by|^It was released in|^It stars |^Its cast /.test(c));
    if (clues.length < 5) note(`few clues ${a.name}: ${clues.length}`);
    if (leaks(r.plot, [a.name], STOPS)) note(`plot names the film (kept out of clues): ${a.name}`);
    pack.items.push({
      id: a.id, name: a.name, alt: alts(a.name, r.title), group: decade,
      facts: {
        year: r.year, boxOfficeUSD: a.gross || undefined, director: a.director, decade, topOfYear: r.year >= 1975 ? false : undefined,
        kids: r.kids || undefined, country, stars: starNames.length ? starNames.join(', ') : undefined, franchise: r.franchise || undefined, bestPicture: a.bp,
      },
      emoji: r.emoji || undefined,
      blurb: `${a.name} (${r.year}), directed by ${a.director}. ${r.plot}.${a.gross ? ` Worldwide gross about ${fmtMoney(a.gross)}.` : ''}`,
      clues, difficulty: fameDifficulty(r.d, fame[a.qid]), starIds: a.stars.map(s => s.id), castIds: [...f.cast], dirAll: a.dirAll,
    });
  }
  note(`movies: ${pack.items.length - added.length} old + ${added.length} new (${rows.length - added.length} of ${rows.length} candidates dropped)`);
  for (const a of added) note(`fame ${a.id}: ${fame[a.qid] ?? '-'} wikipedias, difficulty ${a.r.d} -> ${fameDifficulty(a.r.d, fame[a.qid])}`);
  addQuestions(pack, new Set(added.map(a => a.id)));
  addMeta(pack);
  for (const it of pack.items) { delete it.starIds; delete it.castIds; delete it.dirAll; }
  return pack;
}

function alts(name, title) {
  const a = [];
  if (name.includes(':')) a.push(name.split(':').pop().trim());
  if (/ \(\d{4}\)$/.test(name)) a.push(name.replace(/ \(\d{4}\)$/, ''));
  const t = title.replace(/\s*\([^)]*film\)$/, '');
  if (t !== name && !a.includes(t)) a.push(t);
  const extra = { 'Se7en': ['Seven'], 'Zootopia': ['Zootropolis'], 'Borat': ['Borat: Cultural Learnings of America for Make Benefit Glorious Nation of Kazakhstan'], 'Dilwale Dulhania Le Jayenge': ['DDLJ'], 'Léon: The Professional': ['Leon', 'Léon'], 'The Lord of the Rings: The Fellowship of the Ring': ['Fellowship of the Ring'], 'Star Wars: Episode II – Attack of the Clones': ['Attack of the Clones'], 'Star Wars: Episode III – Revenge of the Sith': ['Revenge of the Sith'], 'Dr. Strangelove': ['Dr Strangelove'], 'Mrs. Doubtfire': ['Mrs Doubtfire'], 'Ringu': ['Ring', 'The Ring'], 'Spirited Away': ['Sen to Chihiro'], 'Godzilla': ['Gojira'] };
  return [...new Set([...a, ...(extra[name] || [])])].filter(x => x !== name);
}

// Same templates as c2_build_movies for the new films (year, director, emoji), plus "who starred" for every film.
// hand rating, nudged by fame (Wikipedias with an article): 3 → 2 at 60+, 2 → 1 at 95+, 1 → 2 under 20
export const fameDifficulty = (d, n) => (n == null ? d : d === 3 && n >= 60 ? 2 : d === 2 && n >= 95 ? 1 : d === 1 && n < 20 ? 2 : d);
const base = it => it.name.replace(/ \(\d{4}\)$/, '');
function addQuestions(pack, newIds) {
  const items = pack.items;
  const have = new Set(pack.questions.map(q => q.id));
  const push = q => { if (!have.has(q.id)) { have.add(q.id); pack.questions.push(q); } };
  const dirs = [...new Set(items.map(x => x.facts.director).filter(Boolean))];
  for (const it of items) {
    const r = rng('movies+' + it.id);
    if (newIds.has(it.id)) {
      const wrongY = sample(r, [-3, -2, -1, 1, 2, 3].map(d => it.facts.year + d).filter(y => y <= 2025), 3).map(String);
      push({ id: `year-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} released?`, answer: String(it.facts.year), wrong: wrongY, explain: it.blurb, difficulty: Math.min(3, it.difficulty + 1), refs: [`movies/${it.id}`] });
      const others = dirs.filter(d => d !== it.facts.director && !it.facts.director.includes(d) && !d.includes(it.facts.director) && !(it.dirAll || []).some(x => d.includes(x)));
      push({ id: `dir-${it.id}`, kind: 'mc', prompt: `Who directed ${base(it)} (${it.facts.year})?`, answer: it.facts.director, wrong: sample(r, others, 3), explain: it.blurb, difficulty: Math.min(3, it.difficulty + 1), refs: [`movies/${it.id}`] });
      if (it.emoji) {
        const wrongE = sample(r, items.filter(x => x !== it && x.emoji && Math.abs(x.difficulty - it.difficulty) <= 1), 3).map(x => x.name);
        push({ id: `emoji-${it.id}`, kind: 'mc', prompt: `Which film is this? ${it.emoji}`, answer: it.name, wrong: wrongE, explain: it.blurb, difficulty: it.difficulty, refs: [`movies/${it.id}`] });
      }
    }
    if (it.starIds?.length) {
      // wrong options: lead actors of other films who are not in this film's Wikidata cast at all
      const pool = [...new Map(items.filter(x => x !== it && x.starIds?.length).flatMap(x => x.starIds.map((sid, k) => [sid, x.facts.stars.split(', ')[k]]))).entries()]
        .filter(([sid, n]) => !it.castIds.includes(sid) && !it.facts.stars.split(', ').includes(n));
      const wrong = sample(r, pool, 3).map(([, n]) => n);
      const star = it.facts.stars.split(', ')[0];
      if (wrong.length === 3) push({ id: `star-${it.id}`, kind: 'mc', prompt: `Who starred in ${base(it)} (${it.facts.year})?`, answer: star, wrong, explain: `${it.name} stars ${join2(it.facts.stars.split(', '))}.`, difficulty: Math.min(3, it.difficulty + 1), refs: [`movies/${it.id}`] });
    }
  }
}

function addMeta(pack) {
  Object.assign(pack.factsMeta, {
    country: { type: 'cat', label: 'Country of origin', ask: 'Which country does the film {name} come from?', askReverse: 'Which of these films comes from {value}?', stmt: 'The film {name} comes from {value}.' },
    stars: { type: 'text', label: 'Starring' },
    franchise: { type: 'cat', label: 'Franchise', ask: 'Which film franchise is {name} part of?', askReverse: 'Which of these films is part of the {value} franchise?', stmt: '{name} is part of the {value} franchise.' },
    bestPicture: { type: 'bool', label: 'Best Picture Oscar', yes: 'Won Best Picture', no: 'Did not win Best Picture', askBool: 'Which of these films won the Oscar for Best Picture?', stmt: '{name} won the Oscar for Best Picture.' },
  });
  const src = pack.sources || (pack.sources = []);
  if (!src.some(s => /lead sentence/.test(s.name))) src.push({ name: 'Wikipedia (lead sentence and infobox: year, director, stars, country; cross-checked with Wikidata)', url: 'https://en.wikipedia.org' });
}
