import { register, collect, pick } from '../../formats/registry.js?v=202610100547';
import { countryIds, regionMembers, REGIONS, createMap, frame, message, revealCard, isKids, cname, theName, byLevel, refFor, supportsGeo, REGION_CHOICES, REGION_LABELS, loadFlags } from './common.js?v=202610100547';

const FLAGS = await loadFlags();

// Prefer a flag image from C2's countries pack if it carries one; otherwise our Commons-verified set.
// Afghanistan's flag is contested (Islamic Republic vs Taliban), so it is never asked.
const SKIP = new Set(['AFG']);
function flagFor(packs, iso) {
  if (SKIP.has(iso)) return null;
  for (const p of packs || []) {
    if (p.id !== 'countries' && p.id !== 'flags') continue;
    const it = (p.items || []).find(x => x.iso3 === iso || x.id === iso || x.facts?.iso3 === iso);
    if (it?.facts?.flagDisputed) return null;
    const img = it?.media?.img?.find(m => /flag/i.test(m.src + (m.page || '')));
    if (img) return img;
  }
  const f = FLAGS[iso];
  return f ? { src: f.src, w: f.w, h: f.h, credit: f.credit, license: f.license, page: f.page } : null;
}

export default register({
  id: 'flag-map', title: 'Flag on the map', icon: '🏳️', blurb: 'See a flag, tap its country', tags: ['map', 'kids'],
  options: [{ key: 'region', label: 'Map', type: 'choice', values: REGION_CHOICES, labels: REGION_LABELS, default: 'world' }],
  supports: supportsGeo, packless: true,
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid, kids: kidsArg }) {
    const kids = !!(opts.kids || kidsArg), level = kids ? 1 : difficulty || 0;
    const region = REGIONS[opts.region] ? opts.region : 'world';
    const members = (region === 'world' ? countryIds() : regionMembers(region)).filter(iso => flagFor(packs, iso));
    const pool = byLevel(members, level, undefined, 8);
    return collect(count, () => {
      const iso = pick(rng, pool);
      const img = flagFor(packs, iso);
      return {
        format: 'flag-map', id: `flag-map:${region}:${iso}`, prompt: 'Tap the country with this flag', answer: iso, answerText: cname(iso),
        media: { img: [img] }, refs: refFor(packs, iso), data: { region, kids, level },
      };
    }, avoid);
  },
  render(el, q, api) {
    const kids = isKids(q, api);
    const easy = kids || q.data.level === 1;
    const ui = frame(el, { prompt: q.prompt, flag: q.media.img[0] });
    let done = false;
    const map = createMap(ui.mapEl, {
      region: q.data.region, target: 'countries', style: easy ? 'continents' : 'plain', bigTargets: easy, dots: !easy, portraitZoom: !easy,
      onTap(hit) { if (!done && hit.id && hit.playable) finish(hit.id); },
    });
    function finish(given) {
      done = true;
      map.setLocked(true);
      const correct = given === q.answer;
      if (given && !correct) { map.setState(given, 'wrong'); map.label(given, cname(given)); }
      map.setState(q.answer, correct ? 'correct' : 'target pulse');
      map.label(q.answer, cname(q.answer));
      if (!correct) map.flyTo(given ? [given, q.answer] : [q.answer], { maxZoom: 6 });
      message(ui.foot, correct ? (kids ? `Yes! That's the flag of ${theName(q.answer)}! 🎉` : `Correct, ${q.answerText}.`)
        : given ? `That’s ${theName(given)}. This is the flag of ${theName(q.answer)}.` : `This is the flag of ${theName(q.answer)}.`, correct);
      ui.foot.append(revealCard(q.answer, false));
      if (given !== undefined) api.answer({ correct, given });
    }
    return {
      map, destroy: () => map.destroy(),
      timeout() { if (!done) map.ready.then(() => finish(undefined)); },
      choose(x) { map.ready.then(() => finish(x === 'correct' ? q.answer : map.featureIds().find(id => id !== q.answer && map.feature(id).playable))); },
    };
  },
});
