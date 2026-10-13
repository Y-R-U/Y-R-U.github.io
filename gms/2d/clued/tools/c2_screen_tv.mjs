// Lane SCREEN: TV 53 → ~200. extendTv(pack) appends c2_src/tv_more.mjs shows (start year, country, network, lead actors,
// each confirmed by Wikipedia and Wikidata) and adds network/stars to the old shows where both sources agree.
import { slug, leaks, rng, sample } from './c2_lib.mjs';
import { claims, wdYear, ibField, ibLinks, isoName } from './c2_screen_lib.mjs';
import { screenFacts, starsOf } from './c2_screen_movies.mjs';
import { SHOWS_MORE } from './c2_src/tv_more.mjs';
import { SHOWS } from './c2_src/tv.mjs';

const NAME_ISO = { 'United States': 'USA', 'United Kingdom': 'GBR', Australia: 'AUS', 'New Zealand': 'NZL', Canada: 'CAN', Japan: 'JPN', 'South Korea': 'KOR', Spain: 'ESP', Germany: 'DEU', France: 'FRA', Denmark: 'DNK', Sweden: 'SWE', Norway: 'NOR', Italy: 'ITA', Mexico: 'MEX', Colombia: 'COL', Turkey: 'TUR', India: 'IND', Russia: 'RUS', Israel: 'ISR', Netherlands: 'NLD', Ireland: 'IRL' };
const OLD_IDS = new Set(SHOWS.trim().split('\n').map(l => slug(l.split('|')[1])));
const NEW_FACTS = ['network', 'stars'];
const join2 = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
const the = c => /^(United States|United Kingdom|Netherlands)$/.test(c) ? 'the ' + c : c;
const ibYear = wt => { for (const f of ['first_aired', 'released', 'first_run', 'airdate']) { const m = /\b(19[3-9]\d|20[0-2]\d)\b/.exec(ibField(wt, f)); if (m) return +m[1]; } return null; };

export function stripTv(pack) {
  const gone = new Set(pack.items.filter(it => !OLD_IDS.has(it.id)).map(it => it.id));
  pack.items = pack.items.filter(it => !gone.has(it.id));
  pack.questions = pack.questions.filter(q => !/^(net|star)-/.test(q.id) && !(q.refs || []).some(r => gone.has(r.split('/')[1])));
  for (const it of pack.items) for (const k of NEW_FACTS) delete it.facts[k];
  for (const k of NEW_FACTS) delete pack.factsMeta[k];
  pack.sources = (pack.sources || []).filter(s => !/infobox/.test(s.name));
  return pack;
}

// Wikidata labels → the names viewers know; null = not a channel
const NET_NAME = { 'American Broadcasting Company': 'ABC (US)', ABC: 'ABC (Australia)', 'ABC Television': 'ABC (Australia)', 'Australian Broadcasting Corporation': 'ABC (Australia)', 'Fox Broadcasting Company': 'Fox', 'British Broadcasting Corporation': 'BBC', 'CTV Television Network': 'CTV', 'TX Network': 'TV Tokyo', 'Sky One (Germany)': 'Sky 1 (Germany)', 'broadcast syndication': null };
// Network named in the infobox AND listed as original broadcaster (P449) on Wikidata.
function networkOf(f) {
  const ib = [...f.ibq('network'), ...f.ibq('channel')];
  const wd = claims(f.ent, 'P449').map(v => v.id);
  const hit = ib.find(id => wd.includes(id));
  const lab = hit && f.labelOf(hit), name = lab && (lab in NET_NAME ? NET_NAME[lab] : lab);
  return name ? { id: hit, name, all: [...new Set([...ib, ...wd])] } : null;
}

export async function extendTv(pack, note = console.log) {
  const rows = SHOWS_MORE.trim().split('\n').map(l => {
    const [title, name, year, country, d, kids, clues, alt] = l.split('|');
    return { title, name, year: +year, country, d: +d, kids: kids === '1', clues: clues.split(';'), alt: alt ? alt.split(/[;/]/) : [] };
  });
  const oldRows = SHOWS.trim().split('\n').map(l => { const p = l.split('|'); return { title: p[0], id: slug(p[1]) }; });
  const facts = await screenFacts([...oldRows.map(r => r.title), ...rows.map(r => r.title)], { castProps: ['P161', 'P725'], kind: 'tv' });
  const extra = new Map();

  for (const r of oldRows) {
    const it = pack.items.find(i => i.id === r.id), f = facts[r.title];
    if (!it || !f) continue;
    const net = networkOf(f);
    if (net?.name) { it.facts.network = net.name; extra.set(it.id, { net }); }
    const st = starsOf(f);
    if (st.length) { it.facts.stars = st.map(s => s.name).join(', '); extra.set(it.id, { ...extra.get(it.id), st, cast: f.cast }); }
  }

  const ids = new Set(pack.items.map(i => i.id)), qids = new Set(oldRows.map(r => facts[r.title]?.qid).filter(Boolean));
  const added = [];
  for (const r of rows) {
    const f = facts[r.title];
    const drop = why => note(`DROPPED ${r.name}: ${why}`);
    if (!f) { drop('not found'); continue; }
    if (qids.has(f.qid)) { drop('already in the pack'); continue; }
    const ys = ['P580', 'P577', 'P571'].flatMap(p => claims(f.ent, p).map(wdYear)).filter(Boolean);
    if (!ys.includes(r.year)) { drop(`start year: mine ${r.year}, Wikidata ${ys.join(',') || '-'}`); continue; }
    const iy = ibYear(f.wt);
    if (iy !== r.year) { drop(`start year: mine ${r.year}, infobox ${iy ?? '-'}`); continue; }
    const iso = NAME_ISO[r.country];
    const wp = [...new Set([...f.lead.isos, ...f.ibIsos])];
    if (!iso || !f.p495.includes(iso) || !wp.includes(iso)) { drop(`country: mine ${r.country}, Wikidata ${f.p495.join(',') || '-'}, Wikipedia ${wp.join(',') || '-'}`); continue; }
    const others = wp.filter(i => i !== iso && f.p495.includes(i)).map(isoName).filter(Boolean);
    const id = slug(r.name);
    if (ids.has(id)) { drop(`id clash ${id}`); continue; }
    ids.add(id); qids.add(f.qid);
    const net = networkOf(f), st = starsOf(f);
    if (!net) note(`network not agreed: ${r.name} (infobox ${ibLinks(ibField(f.wt, 'network')).join(', ') || '-'})`);
    added.push({ r, f, id, net, st, country: others.length ? [r.country, ...others] : r.country });
  }

  for (const a of added) {
    const { r } = a;
    const h = r.clues.map(c => c + '.');
    const starNames = a.st.map(s => s.name);
    const cs = [].concat(a.country);
    const clues = [h[0], a.net && `It was first shown on ${a.net.name}.`, `It first aired in ${r.year}.`, `It was made in ${cs.map(the).join(' and ')}.`,
      starNames.length && `It starred ${join2(starNames.slice(0, 2))}.`, h[h.length - 1]].filter(Boolean).filter(c => !leaks(c, [r.name, ...r.alt]) || /^It (first aired|was made|starred)/.test(c));
    if (clues.length < 5) note(`few clues ${r.name}: ${clues.length}`);
    pack.items.push({
      id: a.id, name: r.name, alt: r.alt, group: `${Math.floor(r.year / 10) * 10}s`,
      facts: { year: r.year, country: a.country, decade: `${Math.floor(r.year / 10) * 10}s`, kids: r.kids || undefined, network: a.net?.name || undefined, stars: starNames.length ? starNames.join(', ') : undefined },
      blurb: `${r.name} (first shown ${r.year}, ${cs.join(' and ')}${a.net ? `, ${a.net.name}` : ''}). ${r.clues[r.clues.length - 1]}.`,
      clues, difficulty: r.d,
    });
    extra.set(a.id, { net: a.net, st: a.st, cast: a.f.cast, isNew: true });
  }
  note(`tv: ${pack.items.length - added.length} old + ${added.length} new (${rows.length - added.length} of ${rows.length} candidates dropped)`);
  questions(pack, extra);
  Object.assign(pack.factsMeta, {
    network: { type: 'text', label: 'First shown on' },
    stars: { type: 'text', label: 'Starring' },
  });
  if (!pack.sources.some(s => /infobox/.test(s.name))) pack.sources.push({ name: 'Wikipedia infobox + Wikidata (network, lead actors, country; both must agree)', url: 'https://en.wikipedia.org' });
  return pack;
}

function questions(pack, extra) {
  const items = pack.items;
  const have = new Set(pack.questions.map(q => q.id));
  const push = q => { if (!have.has(q.id)) { have.add(q.id); pack.questions.push(q); } };
  const cOf = id => [].concat(items.find(i => i.id === id)?.facts.country || []);
  const nets = [...new Map([...extra.entries()].filter(([, e]) => e.net?.name).map(([id, e]) => [e.net.id, [e.net.name, cOf(id)]])).entries()].map(([nid, [n, c]]) => [nid, n, c]);
  const stars = [...new Map([...extra.entries()].flatMap(([id, e]) => (e.st || []).map(s => [s.id, [s.name, cOf(id)]]))).entries()].map(([sid, [n, c]]) => [sid, n, c]);
  // same-country options first, so a British show is not up against an obviously foreign channel
  const pick3 = (r, list, cs) => { const near = list.filter(x => x[2].some(c => cs.includes(c))); return sample(r, near.length >= 3 ? near : list, 3); };
  for (const it of items) {
    const e = extra.get(it.id);
    const r = rng('tv+' + it.id);
    if (e?.isNew) {
      const wrong = sample(r, items.filter(x => x !== it && x.facts.kids === it.facts.kids), 3).map(x => x.name);
      push({ id: `which-${it.id}`, kind: 'mc', prompt: `Which TV show is this? ${it.clues[it.clues.length - 1]}`, answer: it.name, wrong, explain: it.blurb, difficulty: it.difficulty, refs: [`tv/${it.id}`] });
      const wy = sample(r, [-6, -4, -2, 2, 4, 6].map(k => it.facts.year + k).filter(y => y <= 2025), 3).map(String);
      push({ id: `year-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} first shown?`, answer: String(it.facts.year), wrong: wy, explain: it.blurb, difficulty: 3, refs: [`tv/${it.id}`] });
    }
    if (e?.net) {
      // never a channel the show has been on (infobox or Wikidata), nor a sister channel ("BBC One" / "BBC Two")
      const brand = n => n.split(/\s+/)[0].toLowerCase();
      const pool = nets.filter(([id, n]) => !e.net.all.includes(id) && brand(n) !== brand(e.net.name) && n !== e.net.name);
      const wrong = [...new Set(pick3(r, pool, cOf(it.id)).map(([, n]) => n))];
      if (wrong.length === 3) push({ id: `net-${it.id}`, kind: 'mc', prompt: `Which channel or service first showed ${it.name}?`, answer: e.net.name, wrong, explain: it.blurb, difficulty: Math.min(3, it.difficulty + 1), refs: [`tv/${it.id}`] });
    }
    if (e?.st?.length) {
      const own = new Set(e.st.map(s => s.name));
      const pool = stars.filter(([id, n]) => !e.cast.has(id) && !own.has(n));
      const wrong = pick3(r, pool, cOf(it.id)).map(([, n]) => n);
      if (wrong.length === 3) push({ id: `star-${it.id}`, kind: 'mc', prompt: `Who starred in ${it.name}?`, answer: e.st[0].name, wrong, explain: `${it.name} starred ${join2(e.st.map(s => s.name))}.`, difficulty: Math.min(3, it.difficulty + 1), refs: [`tv/${it.id}`] });
    }
  }
}
