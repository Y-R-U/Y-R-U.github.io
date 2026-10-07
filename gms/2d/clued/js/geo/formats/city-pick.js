import { register, collect, pick, shuffle } from '../../formats/registry.js?v=202610071242';
import { loadCities, geo as G } from '../data.js?v=202610071242';
import { haversineKm } from '../proj.js?v=202610071242';
import {
  geo, countryIds, regionMembers, REGIONS, STATE_VIEWS, createMap, frame, message, isKids, cname, regionForCountry,
  REGION_CHOICES, REGION_LABELS, refFor, supportsGeo, byLevel,
} from './common.js?v=202610071242';

await loadCities();

const LEVEL_RANK = { 1: 4, 2: 6, 3: 10, 0: 8 };
const inBox = (c, b, m = 0.3) => c.lon >= b[0] - m && c.lon <= b[2] + m && c.lat >= b[1] - m && c.lat <= b[3] + m;

// Four well-spread cities, the answer drawn from the better-known ones.
function pickCities(rng, list, spacingKm, level) {
  const rank = LEVEL_RANK[level] ?? 8;
  const known = list.filter(c => c.r <= rank || c.pop >= 1e6);
  if (known.length < 2) return null;
  for (let tries = 0; tries < 6; tries++) {
    const target = pick(rng, known.slice(0, level === 1 ? 6 : 12));
    const set = [target];
    for (const c of shuffle(rng, list.filter(c => c.r <= rank + 2))) {
      if (set.length >= 4) break;
      if (set.some(o => o.n === c.n || haversineKm([o.lon, o.lat], [c.lon, c.lat]) < spacingKm)) continue;
      set.push(c);
    }
    if (set.length === 4) return { target, set };
  }
  return null;
}

function countryQ(rng, iso, level) {
  const c = geo.countries[iso];
  const view = regionForCountry(iso, { states: true });
  const box = STATE_VIEWS[iso]?.frame && !STATE_VIEWS[iso].insets ? STATE_VIEWS[iso].frame : c.mb;
  const list = (G.cities.c[iso] || []).filter(x => STATE_VIEWS[iso]?.insets ? true : inBox(x, box));
  const diag = haversineKm([box[0], box[1]], [box[2], box[3]]);
  const r = pickCities(rng, list, Math.max(35, diag * 0.12), level);
  if (!r) return null;
  return build(r, { kind: 'country', view, focus: iso, where: c.n, refs: [] });
}

function stateQ(rng, iso, sid, level) {
  const s = geo.states[iso]?.s[sid]; if (!s) return null;
  const list = G.cities.s[sid] || [];
  const r = pickCities(rng, list, Math.max(15, Math.sqrt(s.a) * 0.18), level);
  if (!r) return null;
  return build(r, { kind: 'state', view: iso, focus: sid, where: `${s.n}, ${cname(iso)}` });
}

function build({ target, set }, { kind, view, focus, where, refs = [] }) {
  const cities = set.map(c => ({ n: c.n, lon: c.lon, lat: c.lat }));
  const order = cities.slice().sort((a, b) => a.lon - b.lon);
  return {
    format: 'city-pick', id: `city-pick:${focus}:${target.n}`, prompt: `Where is ${target.n}?`, answer: order.findIndex(c => c.n === target.n),
    answerText: target.n, refs, explain: `${target.n} is in ${where}.`,
    data: { kind, view, focus, where, cities: order },
  };
}

export function cityPickCandidates(level = 0) {
  const countries = countryIds().filter(iso => pickCities(() => 0.5, G.cities.c[iso] || [], 35, level));
  const states = [];
  for (const [iso, S] of Object.entries(geo.states)) for (const sid of Object.keys(S.s)) if ((G.cities.s[sid] || []).length >= 4) states.push([iso, sid]);
  return { countries, states };
}

export default register({
  id: 'city-pick', title: 'Where is this city?', icon: '📍', blurb: 'Four dots on an outline: which one is the city?', tags: ['map'],
  options: [
    { key: 'scope', label: 'Outlines', type: 'choice', values: ['countries', 'states', 'mix'], labels: ['Countries', 'States & provinces', 'Mix'], default: 'countries' },
    { key: 'region', label: 'Where', type: 'choice', values: REGION_CHOICES, labels: REGION_LABELS, default: 'world' },
  ],
  supports: supportsGeo, packless: true,
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid, kids: kidsArg }) {
    const kids = !!(opts.kids || kidsArg), level = kids ? 1 : difficulty || 0;
    const region = REGIONS[opts.region] ? opts.region : 'world';
    const members = region === 'world' ? countryIds() : regionMembers(region);
    const isos = byLevel(members.filter(iso => (G.cities.c[iso] || []).length >= 4), level, undefined, 6);
    const states = Object.entries(geo.states).filter(([iso]) => members.includes(iso))
      .flatMap(([iso, S]) => Object.keys(S.s).filter(sid => (G.cities.s[sid] || []).length >= 4).map(sid => [iso, sid]));
    const scope = opts.scope || 'countries';
    return collect(count, () => {
      const useState = states.length && (scope === 'states' || (scope === 'mix' && rng() < 0.4));
      const q = useState ? stateQ(rng, ...pick(rng, states), level) : countryQ(rng, pick(rng, isos), level);
      if (q) { q.data.kids = kids; q.data.level = level; if (q.data.kind === 'country') q.refs = refFor(packs, q.data.focus); }
      return q;
    }, avoid);
  },
  render(el, q, api) {
    const kids = isKids(q, api);
    const ui = frame(el, { prompt: q.prompt });
    const sub = document.createElement('small'); sub.className = 'gmq-sub'; sub.textContent = q.data.where; ui.top.append(sub);
    let done = false;
    const map = createMap(ui.mapEl, {
      region: q.data.view, target: q.data.kind === 'state' ? 'states' : q.data.view === q.data.focus ? 'none' : 'countries', playable: id => id === q.data.focus,
      bigTargets: kids || q.data.level === 1,
      onTap(hit) { if (!done && hit.marker) finish(+hit.marker.slice(1)); },
    });
    map.ready.then(() => {
      map.setLocked(true);
      map.setState(q.data.focus, 'soft');
      q.data.cities.forEach((c, i) => map.addMarker({ id: 'c' + i, lon: c.lon, lat: c.lat, kind: 'dot', tap: true }));
      if (!STATE_VIEWS[q.data.view] || q.data.kind === 'state') map.flyTo(q.data.kind === 'state' ? q.data.focus : q.data.cities.map(c => [c.lon, c.lat]).concat(boxCorners(geo.countries[q.data.focus]?.mb)), { maxZoom: 40, duration: 500, pad: 0.08 });
    });
    function finish(i) {
      done = true;
      const correct = i === q.answer;
      q.data.cities.forEach((c, k) => {
        map.markerState('c' + k, k === q.answer ? 'ok' : k === i ? 'bad' : 'dim');
        map.markerLabel('c' + k, c.n);
      });
      message(ui.foot, correct ? (kids ? `Yes! That's ${q.answerText}! 🎉` : `Correct, that's ${q.answerText}.`)
        : i == null ? `${q.answerText} is the green dot.` : `That's ${q.data.cities[i].n}. ${q.answerText} is the green dot.`, correct);
      if (i != null) api.answer({ correct, given: i, detail: { city: q.data.cities[i].n } });
    }
    return {
      map, destroy: () => map.destroy(),
      timeout() { if (!done) finish(null); },
      choose(x) { map.ready.then(() => finish(x === 'correct' ? q.answer : (q.answer + 1) % 4)); },
    };
  },
});

const boxCorners = b => (b ? [[b[0], b[1]], [b[2], b[3]]] : []);
