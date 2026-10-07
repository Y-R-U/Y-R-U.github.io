import { register, collect, pick, shuffle } from '../../formats/registry.js?v=202610071327';
import { geo, countryIds, createMap, frame, message, revealCard, isKids, cname, theName, byLevel, refFor, supportsGeo, CONTINENTS, loadFlags } from './common.js?v=202610071327';
import { loadCities, geo as G } from '../data.js?v=202610071327';
import { CONTINENT_FILL } from '../style.js?v=202610071327';
import { LAT, LON, STEP, CODES as BAND_CODES } from '../bands.js?v=202610071327';

await loadCities();

const CODES = ['AF', 'AS', 'EU', 'NA', 'SA', 'OC'];
const GLOBE = { AF: '🌍', EU: '🌍', AS: '🌏', OC: '🌏', NA: '🌎', SA: '🌎' };
export const TIERS = ['dot', 'line', 'name'];
// Names that also belong to a well-known place on another continent (Natural Earth only lists the big one).
const AMBIGUOUS = new Set(['Tripoli', 'Córdoba', 'Cordoba', 'San José', 'Santiago', 'Alexandria', 'Birmingham', 'Victoria', 'Hamilton', 'Kingston',
  'Georgetown', 'George Town', 'Santa Cruz', 'León', 'Mérida', 'Valencia', 'Barcelona', 'Granada', 'Toledo', 'Cartagena', 'Trujillo', 'Guadalajara',
  'Salamanca', 'San Juan', 'Perth', 'London', 'Newcastle', 'Memphis', 'Athens', 'Durango', 'Monterrey', 'Santa Ana', 'La Paz', 'San Cristóbal']);

const rowOf = (kind, v) => Math.max(0, Math.min((kind === 'lat' ? 180 : 360) / STEP - 1, Math.floor((v + (kind === 'lat' ? 90 : 180)) / STEP)));
// The clue line is drawn at the centre of its band row, so the band data is exact for the line the player sees.
export const lineValue = (kind, v) => (kind === 'lat' ? -90 : -180) + (rowOf(kind, v) + 0.5) * STEP;
export function crossesOf(kind, v) {
  const m = (kind === 'lat' ? LAT : LON).charCodeAt(rowOf(kind, v)) - 48;
  return BAND_CODES.filter((c, i) => (m >> i) & 1);
}
// Parallel or meridian through the place: the one crossing more continents (>= 2 whenever possible); a coin toss on ties.
export function chooseLine(rng, lon, lat, own) {
  const cands = [['lat', lat], ['lon', lon]].map(([kind, v]) => {
    const s = new Set(crossesOf(kind, v)); s.add(own);
    return { kind, v: +lineValue(kind, v).toFixed(3), crosses: CODES.filter(c => s.has(c)) };
  });
  const best = Math.max(...cands.map(c => c.crosses.length));
  const top = cands.filter(c => c.crosses.length === best);
  return top.length > 1 ? top[rng() < 0.5 ? 0 : 1] : top[0];
}
export function linePoints({ kind, v }) {
  const pts = [];
  if (kind === 'lat') for (let lon = -180; lon <= 180; lon += 2) pts.push([lon, v]);
  else for (let lat = -60; lat <= 85; lat += 1) pts.push([v, lat]);
  return pts;
}

const clean = s => String(s).replace(/[‎‏‪-‮]/g, '').trim();
const inBox = (c, b, m = 0.3) => b && c.lon >= b[0] - m && c.lon <= b[2] + m && c.lat >= b[1] - m && c.lat <= b[3] + m;
// 1 = famous (big capital / megacity), 2 = well known, 3 = sizeable.
const fameOf = c => ((c.cap && c.pop >= 1e6) || (c.pop >= 5e6 && c.r <= 4) ? 1 : c.cap || (c.pop >= 1.5e6 && c.r <= 6) ? 2 : c.pop >= 1e6 && c.r <= 6 ? 3 : 0);
// Natural Earth population oddities (metro-area or planned-city figures) that would make them look famous.
const ODD = new Set(['Amaravati', 'Haora', 'Hechi', 'Irvine', 'Saidu', 'Benoni', 'Zhongli', 'Bekasi']);
const plainCountry = iso => { const c = geo.countries[iso]; return c && !c.cs && CODES.includes(c.c); };

let CITY_POOL = null;
export function cityPool() {
  if (CITY_POOL) return CITY_POOL;
  const conts = new Map();
  for (const [iso, list] of Object.entries(G.cities.c)) for (const c of list) {
    const n = clean(c.n), k = geo.countries[iso]?.c;
    if (!conts.has(n)) conts.set(n, new Set());
    conts.get(n).add(k);
  }
  const out = [];
  for (const iso of countryIds({ set: 'un' })) {
    if (!plainCountry(iso)) continue;
    const C = geo.countries[iso];
    for (const c of G.cities.c[iso] || []) {
      const n = clean(c.n), fame = fameOf(c);
      if (!fame || AMBIGUOUS.has(n) || ODD.has(n) || conts.get(n).size > 1 || !inBox(c, C.mb)) continue;
      if (iso === 'IDN' && c.lon > 129) continue;   // Maluku/New Guinea: Asia politically, Oceania to most people
      if (new RegExp(`\\b${C.n}\\b`, 'i').test(n)) continue;   // "Kuwait City" names its country
      out.push({ iso, n, lon: c.lon, lat: c.lat, fame });
    }
  }
  return (CITY_POOL = out);
}

// Tier for a level: easy/kids = the dot, medium = a line through it, hard = the name only; mixed goes by fame.
export const tierFor = (level, fame) => (level ? TIERS[level - 1] : TIERS[3 - fame]);

export default register({
  id: 'continent', title: 'Which continent?', icon: '🌍', blurb: 'Name the continent a country or city is in', tags: ['map', 'kids'],
  options: [
    { key: 'what', label: 'Ask about', type: 'choice', values: ['mix', 'countries', 'cities'], labels: ['Mix', 'Countries', 'Cities'], default: 'mix', kidsDefault: 'countries' },
    { key: 'answers', label: 'Buttons', type: 'choice', values: [3, 6], default: 6 },
    { key: 'map', label: 'Show map', type: 'choice', values: ['yes', 'no'], labels: ['Yes', 'No (harder)'], default: 'yes' },
  ],
  supports: supportsGeo, packless: true,
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid, kids: kidsArg }) {
    const kids = !!(opts.kids || kidsArg), level = kids ? 1 : difficulty || 0;
    const n = kids ? 3 : +opts.answers === 3 ? 3 : 6;
    const what = opts.what || (kids ? 'countries' : 'mix');
    const showMap = kids || opts.map !== 'no';
    const countries = byLevel(countryIds().filter(plainCountry), level, undefined, 12);
    const maxFame = level === 1 ? 1 : level ? 2 : 3;
    const cities = cityPool().filter(c => c.fame <= maxFame);
    const buttons = c => (n === 6 ? CODES.slice() : shuffle(rng, [c, ...shuffle(rng, CODES.filter(x => x !== c)).slice(0, n - 1)]));
    return collect(count, () => {
      const city = what === 'cities' || (what === 'mix' && rng() < 0.5) ? pick(rng, cities) : null;
      const iso = city ? city.iso : pick(rng, countries), c = geo.countries[iso].c;
      const fame = city ? city.fame : geo.countries[iso].d || 2;
      const tier = showMap ? tierFor(level, fame) : 'name';
      const [lon, lat] = city ? [city.lon, city.lat] : geo.countries[iso].lp;
      const options = buttons(c);
      return {
        format: 'continent', id: city ? `continent:city:${iso}:${city.n}` : `continent:${iso}`,
        prompt: city ? `Which continent is the city of ${city.n} in?` : `Which continent is ${theName(iso)} in?`,
        options: options.map(code => ({ text: CONTINENTS[code], code })), answer: options.indexOf(c), answerText: CONTINENTS[c],
        explain: city ? `${city.n} is in ${cname(iso)}, in ${CONTINENTS[c]}.` : `${cap(theName(iso))} is in ${CONTINENTS[c]}.`,
        refs: city ? [] : refFor(packs, iso),
        data: {
          iso, kids, level, map: showMap, tier, city: city ? { n: city.n, lon, lat } : null,
          line: tier === 'line' ? chooseLine(rng, lon, lat, c) : null,
        },
      };
    }, avoid);
  },
  render(el, q, api) {
    const kids = isKids(q, api);
    const d = q.data, tier = d.tier || 'dot', city = d.city;
    const ui = frame(el, { prompt: q.prompt });
    let done = false, map = null;
    const subject = city ? city.n : cap(theName(d.iso));
    if (tier === 'line' && d.line) {
      const sub = document.createElement('small'); sub.className = 'gmq-sub';
      sub.textContent = `${subject} is somewhere on the dotted line`;
      ui.top.append(sub);
    }
    if (d.map) {
      // portraitZoom off: tall maps otherwise start zoomed on the Atlantic and the country can be off-screen (lane I)
      map = createMap(ui.mapEl, { region: 'world', target: 'none', interactive: false, dotFor: tier === 'dot' && !city ? [d.iso] : [], bigTargets: true, padding: 6, portraitZoom: false });
      if (tier === 'name') ui.mapEl.classList.add('faded');
      map.ready.then(() => {
        if (done) return;
        if (tier === 'dot') city ? map.addMarker({ id: 'city', lon: city.lon, lat: city.lat, kind: 'dot', cls: 'sel' }) : map.setState(d.iso, 'target pulse');
        else if (tier === 'line' && d.line) map.addPath(linePoints(d.line), { cls: 'clue' });
      });
    } else ui.mapEl.parentNode.style.display = 'none';
    const grid = document.createElement('div');
    grid.className = 'gmq-big' + (q.options.length === 3 ? ' n3' : '');
    const btns = q.options.map((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = CONTINENT_FILL[o.code];
      b.innerHTML = `<span aria-hidden="true">${GLOBE[o.code]}</span> ${o.text}`;
      b.addEventListener('click', () => finish(i));
      grid.append(b);
      return b;
    });
    ui.foot.append(grid);
    loadFlags();
    function showTruth() {
      ui.mapEl.classList.remove('faded');
      map.setStyle('continents');
      if (city) {
        map.addMarker({ id: 'city', lon: city.lon, lat: city.lat, kind: 'dot', cls: 'ok', label: city.n });
      } else {
        const [lon, lat] = geo.countries[d.iso].lp;
        map.setState(d.iso, 'target');
        map.addMarker({ id: 'city', lon, lat, kind: 'dot', cls: 'ok', label: cname(d.iso) });
      }
    }
    function finish(i) {
      if (done) return;
      done = true;
      const correct = i === q.answer;
      btns.forEach((b, k) => { b.disabled = true; if (k === q.answer) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); });
      if (map) map.ready.then(showTruth);
      const msg = correct ? (kids ? `Yes! ${subject} is in ${q.answerText}! 🎉` : `Correct, ${q.answerText}.`)
        : kids ? `Good try! ${subject} is in ${q.answerText}.` : `${subject} is in ${q.answerText}.`;
      message(ui.foot, msg, correct);
      if (kids) ui.foot.append(revealCard(d.iso, true));
      if (i != null) api.answer({ correct, given: i });
    }
    return {
      map, destroy: () => map?.destroy(),
      timeout() { finish(null); },
      choose(x) { finish(x === 'correct' ? q.answer : (q.answer + 1) % q.options.length); },
      eliminate(k = 2) {
        const wrong = btns.map((b, i) => i).filter(i => i !== q.answer && !btns[i].disabled);
        for (const i of shuffle(Math.random, wrong).slice(0, Math.min(k, wrong.length - 1))) { btns[i].disabled = true; btns[i].classList.add('bad'); }
      },
    };
  },
});

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
