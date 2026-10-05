import { register, collect, pick } from '../../formats/registry.js?v=202610050139';
import { loadMarine } from '../data.js?v=202610050139';
import { REGIONS, createMap, frame, message, isKids, REGION_CHOICES, REGION_LABELS, supportsGeo } from './common.js?v=202610050139';

const { info: M } = await loadMarine();

// Ocean pieces share a group (North + South Atlantic = Atlantic Ocean); sub-seas name their parent.
const OCEANS = {
  'pacific-ocean': 'Pacific Ocean', 'atlantic-ocean': 'Atlantic Ocean', 'indian-ocean': 'Indian Ocean',
  'arctic-ocean': 'Arctic Ocean', 'southern-ocean': 'Southern Ocean',
};
const accepted = key => Object.keys(M).filter(id => id === key || M[id].g === key || M[id].p === key);
const nameOf = key => OCEANS[key] || M[key]?.n || key;
const KINDS = { 1: ['ocean'], 2: ['ocean', 'sea', 'gulf', 'bay'], 3: ['sea', 'gulf', 'bay', 'strait', 'channel', 'sound'] };
const MAXR = { 1: 0, 2: 2, 3: 4, 0: 3 };

function targets(level, region) {
  if (level === 1) return Object.keys(OCEANS);
  const kinds = KINDS[level] || KINDS[2].concat(['strait', 'channel']);
  const f = REGIONS[region]?.frame;
  const out = Object.keys(M).filter(id => kinds.includes(M[id].k) && M[id].r <= MAXR[level] && !M[id].g && M[id].k !== 'ocean'
    && (!f || (M[id].lp[0] >= f[0] && M[id].lp[0] <= f[2] && M[id].lp[1] >= f[1] && M[id].lp[1] <= f[3])));
  if (level === 2 && region === 'world') out.push(...Object.keys(OCEANS));
  return out;
}

export default register({
  id: 'water-click', title: 'Oceans and seas', icon: '🌊', blurb: 'Tap the ocean, sea, gulf or bay', tags: ['map', 'kids'],
  options: [{ key: 'region', label: 'Map', type: 'choice', values: REGION_CHOICES.filter(r => !['caribbean', 'mideast'].includes(r)), labels: REGION_LABELS.filter((l, i) => !['caribbean', 'mideast'].includes(REGION_CHOICES[i])), default: 'world' }],
  supports: supportsGeo, packless: true,
  generate({ rng, count, opts = {}, difficulty = 0, avoid }) {
    const kids = !!opts.kids, level = kids ? 1 : difficulty || 0;
    const region = level === 1 ? 'world' : REGIONS[opts.region] ? opts.region : 'world';
    let pool = targets(level, region);
    if (pool.length < 4) pool = targets(level || 2, 'world');
    return collect(count, () => {
      const key = pick(rng, pool);
      return {
        format: 'water-click', id: `water-click:${key}`, prompt: `Tap the ${nameOf(key)}`, answer: key, answerText: nameOf(key), refs: [],
        data: { region: region === 'world' || REGIONS[region] ? region : 'world', accept: accepted(key), name: nameOf(key), kids, level },
      };
    }, avoid, count * 30);
  },
  render(el, q, api) {
    const kids = isKids(q, api);
    const ui = frame(el, { prompt: q.prompt });
    let done = false;
    const map = createMap(ui.mapEl, {
      region: q.data.region, target: 'marine', bigTargets: kids || q.data.level === 1,
      playable: q.data.level === 1 ? id => M[id]?.k === 'ocean' : () => true,
      onTap(hit) { if (!done && hit.id && hit.playable) finish(hit.id); },
    });
    const keyOf = id => (M[id]?.g || id);
    function finish(given) {
      done = true;
      map.setLocked(true);
      const correct = given != null && q.data.accept.includes(given);
      if (given != null && !correct) { map.setState(given, 'wrong'); map.label(given, nameOf(keyOf(given)), { cls: 'sea' }); }
      for (const id of q.data.accept) map.setState(id, correct ? 'correct' : 'target pulse');
      const main = q.data.accept.slice().sort((a, b) => (M[b].a || 0) - (M[a].a || 0))[0];
      map.label(main, q.answerText, { cls: 'sea', size: 14 });
      if (!correct) map.flyTo(main, { maxZoom: 5 });
      message(ui.foot, correct ? (kids ? `Yes! That's the ${q.answerText}! 🐳` : `Correct, the ${q.answerText}.`)
        : given != null ? (kids ? `Good try! That's the ${nameOf(keyOf(given))}.` : `That's the ${nameOf(keyOf(given))}.`) : `Here is the ${q.answerText}.`, correct);
      if (given !== undefined) api.answer({ correct, given, detail: { name: given ? nameOf(keyOf(given)) : null } });
    }
    return {
      map, destroy: () => map.destroy(),
      timeout() { if (!done) map.ready.then(() => finish(undefined)); },
      choose(x) { map.ready.then(() => finish(x === 'correct' ? q.data.accept[0] : Object.keys(M).find(id => !q.data.accept.includes(id) && M[id].k === 'ocean'))); },
    };
  },
});
