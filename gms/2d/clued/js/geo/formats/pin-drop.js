import { register, collect, pick } from '../../formats/registry.js?v=202610100547';
import { loadCities, geo as G } from '../data.js?v=202610100547';
import { haversineKm } from '../proj.js?v=202610100547';
import { geo, countryIds, regionMembers, REGIONS, createMap, frame, message, button, isKids, cname, REGION_CHOICES, REGION_LABELS, supportsGeo, fmtKm } from './common.js?v=202610100547';

await loadCities();

// kmPerPoint: 0 points at 500 * kmPerPoint km. "correct" within `ok` km.
const SCALE = { world: { kmPer: 10, ok: 400 }, region: { kmPer: 4, ok: 200 } };
const LEVEL = { 1: { r: 1, pop: 4e6 }, 2: { r: 3, pop: 1e6 }, 3: { r: 6, pop: 2e5 }, 0: { r: 3, pop: 1.5e6 } };

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
function landmarkPoints(packs) {
  const out = [];
  for (const p of packs || []) for (const it of p.items || []) {
    const lat = num(it.geo?.lat ?? it.lat ?? it.facts?.lat), lon = num(it.geo?.lon ?? it.lon ?? it.facts?.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ n: it.name, ln: it.lname || it.name, lat, lon, ref: `${p.id}/${it.id}`, d: it.difficulty || 2, where: it.facts?.country || it.facts?.location || '' });
  }
  return out;
}

export default register({
  id: 'pin-drop', title: 'Pin drop', icon: '📌', blurb: 'Drop a pin as close as you can', tags: ['map'],
  options: [
    { key: 'what', label: 'Places', type: 'choice', values: ['mix', 'cities', 'landmarks'], labels: ['Mix', 'Cities', 'Landmarks'], default: 'mix' },
    { key: 'region', label: 'Map', type: 'choice', values: REGION_CHOICES, labels: REGION_LABELS, default: 'world' },
  ],
  supports: supportsGeo, packless: true,
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid, kids: kidsArg }) {
    const kids = !!(opts.kids || kidsArg), level = kids ? 1 : difficulty || 0;
    const region = REGIONS[opts.region] ? opts.region : 'world';
    const members = new Set(region === 'world' ? countryIds() : regionMembers(region));
    const f = REGIONS[region].frame;
    const inFrame = p => region === 'world' || (p.lon >= f[0] && p.lon <= f[2] && p.lat >= f[1] && p.lat <= f[3]);
    const L = LEVEL[level];
    const cities = [];
    for (const iso of members) for (const c of G.cities.c[iso] || []) if ((c.r <= L.r || c.pop >= L.pop) && inFrame(c)) cities.push({ ...c, iso });
    const marks = landmarkPoints(packs).filter(p => inFrame(p) && (!level || p.d <= Math.max(level, 1) + (level === 3 ? 1 : 0)));
    const what = opts.what || 'mix';
    return collect(count, () => {
      const useMark = marks.length && (what === 'landmarks' || (what === 'mix' && rng() < 0.5)) || !cities.length;
      if (useMark && !marks.length) return null;
      const t = useMark ? pick(rng, marks) : pick(rng, cities);
      const where = useMark ? t.where : cname(t.iso);
      return {
        format: 'pin-drop', id: `pin-drop:${region}:${t.n}`, prompt: `Drop a pin on ${t.ln || t.n}`, answer: { lon: t.lon, lat: t.lat }, answerText: t.n,
        refs: t.ref ? [t.ref] : [], explain: where ? `${t.n}, ${where}.` : undefined,
        data: { region, name: t.n, where, kids, level, scale: region === 'world' ? SCALE.world : SCALE.region },
      };
    }, avoid);
  },
  render(el, q, api) {
    const kids = isKids(q, api);
    const ui = frame(el, { prompt: q.prompt });
    if (q.data.where) { const s = document.createElement('small'); s.className = 'gmq-sub'; s.textContent = q.data.where; ui.top.append(s); }
    let done = false, guess = null;
    const go = button('Drop pin here', 'gmq-btn', () => guess && finish(guess));
    go.disabled = true;
    const hint = document.createElement('span'); hint.className = 'gmq-count'; hint.textContent = 'Tap the map to place your pin';
    ui.foot.append(hint, go);
    const map = createMap(ui.mapEl, {
      region: q.data.region, target: 'none', bigTargets: kids,
      onTap(hit) {
        if (done || hit.lon == null) return;
        guess = { lon: hit.lon, lat: hit.lat };
        map.addMarker({ id: 'guess', lon: guess.lon, lat: guess.lat, kind: 'pin' });
        go.disabled = false;
        hint.textContent = 'Tap again to move it';
        if (kids) finish(guess);
      },
    });
    function finish(g) {
      done = true;
      map.setLocked(true);
      hint.remove(); go.remove();
      const t = q.answer;
      map.addMarker({ id: 'true', lon: t.lon, lat: t.lat, kind: 'star', label: q.answerText });
      if (!g) { map.flyTo([[t.lon, t.lat]], { maxZoom: 4 }); message(ui.foot, `${q.answerText} is at the star.`); return; }
      const km = haversineKm([g.lon, g.lat], [t.lon, t.lat]);
      const { kmPer, ok } = q.data.scale;
      const points = Math.max(0, Math.round(500 - km / kmPer));
      const correct = km <= ok * (kids || q.data.level === 1 ? 2 : 1);
      if (km > 1) map.addLine([g.lon, g.lat], [t.lon, t.lat]);
      map.flyTo([[g.lon, g.lat], [t.lon, t.lat]], { maxZoom: 12, pad: 0.25 });
      message(ui.foot, `${fmtKm(km)} away${points ? ` · ${points} points` : ''}`, correct);
      api.answer({ correct, partial: !correct && points > 0, points, given: g, detail: { km: Math.round(km) } });
    }
    return {
      map, destroy: () => map.destroy(), manualTimer: false,
      timeout() { if (!done) map.ready.then(() => finish(null)); },
      choose(x) { map.ready.then(() => finish(x === 'correct' ? { ...q.answer } : { lon: q.answer.lon + 40 > 180 ? q.answer.lon - 40 : q.answer.lon + 40, lat: q.answer.lat * 0.5 })); },
    };
  },
});
