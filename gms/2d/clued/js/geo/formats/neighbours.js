import { register, collect, pick } from '../../formats/registry.js?v=1';
import { geo, countryIds, isPlayable, REGIONS, createMap, frame, message, button, isKids, cname, theName, byLevel, refFor, supportsGeo, bboxUnion, plural } from './common.js?v=1';

// Borders that surprise people, explained on the reveal.
const NOTES = {
  'FRA-BRA': 'France borders Brazil and Suriname through French Guiana.', 'FRA-SUR': 'France borders Brazil and Suriname through French Guiana.',
  'ESP-MAR': "Spain's cities of Ceuta and Melilla border Morocco.", 'RUS-POL': "Russia's Kaliningrad region borders Poland and Lithuania.",
  'RUS-LTU': "Russia's Kaliningrad region borders Poland and Lithuania.", 'AZE-TUR': "Azerbaijan's Nakhchivan exclave borders Turkey.",
  'GBR-IRL': 'The United Kingdom borders Ireland in Northern Ireland.', 'DNK-DEU': 'Denmark’s only land border is with Germany.',
};
const note = (a, b) => NOTES[`${a}-${b}`] || NOTES[`${b}-${a}`];
const nbOf = iso => (geo.countries[iso]?.nb || []).filter(n => isPlayable(n));

// Smallest map view that holds the country and all its neighbours.
function viewFor(iso) {
  const box = bboxUnion([iso, ...nbOf(iso)].map(id => geo.countries[id].mb));
  for (const k of [geo.countries[iso].c, ...(geo.countries[iso].cs || []), 'mideast']) {
    const r = REGIONS[k]; if (!r?.file) continue;
    const f = r.frame, span = Math.max(f[2] - f[0], f[3] - f[1]);
    if (box[0] >= f[0] - span * 0.3 && box[2] <= f[2] + span * 0.3 && box[1] >= f[1] - span * 0.5 && box[3] <= f[3] + span * 0.5) return { region: k, box };
  }
  return { region: 'world', box };
}

export default register({
  id: 'neighbours', title: 'Neighbours', icon: '🤝', blurb: 'Tap every country that borders it', tags: ['map'],
  options: [{ key: 'mistakes', label: 'Wrong taps allowed', type: 'choice', values: [1, 3, 5], default: 3 }],
  supports: supportsGeo,
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid }) {
    const kids = !!opts.kids, level = kids ? 1 : difficulty || 0;
    const max = level === 1 ? 6 : level === 2 ? 9 : 15;
    let pool = countryIds().filter(id => { const n = nbOf(id).length; return n >= 2 && n <= max; });
    if (level && level < 3) pool = pool.filter(id => id !== 'FRA');
    pool = byLevel(pool, level, undefined, 10);
    return collect(count, () => {
      const iso = pick(rng, pool);
      const nb = nbOf(iso).sort();
      const notes = [...new Set(nb.map(n => note(iso, n)).filter(Boolean))];
      return {
        format: 'neighbours', id: `neighbours:${iso}`, prompt: `Tap every country that borders ${theName(iso)}`,
        answer: nb, answerText: nb.map(cname).join(', '), refs: refFor(packs, iso),
        explain: notes.join(' ') || undefined,
        data: { iso, ...viewFor(iso), kids, level, mistakes: kids ? 3 : +opts.mistakes || 3 },
      };
    }, avoid);
  },
  render(el, q, api) {
    const kids = isKids(q, api);
    const ui = frame(el, { prompt: q.prompt });
    const need = new Set(q.answer), found = new Set(), wrong = new Set();
    const counter = document.createElement('span'); counter.className = 'gmq-count';
    const doneBtn = button("I'm done", 'gmq-btn ghost', () => finish());
    ui.foot.append(counter, doneBtn);
    const draw = () => { counter.textContent = `${found.size} of ${need.size} found` + (wrong.size ? ` · ${plural(wrong.size, 'miss')}`.replace('misss', 'misses') : ''); };
    draw();
    let done = false;
    const map = createMap(ui.mapEl, {
      region: q.data.region, target: 'countries', bigTargets: kids || q.data.level === 1,
      members: null, playable: id => isPlayable(id) && id !== q.data.iso,
      onTap(hit) {
        if (done || !hit.id || !hit.playable || found.has(hit.id) || wrong.has(hit.id)) return;
        if (need.has(hit.id)) { found.add(hit.id); map.setState(hit.id, 'correct'); api.sfx?.('correct'); }
        else { wrong.add(hit.id); map.setState(hit.id, 'wrong'); api.sfx?.('wrong'); }
        map.label(hit.id, cname(hit.id), { size: 12 });
        draw();
        if (found.size === need.size || wrong.size >= q.data.mistakes) finish();
      },
    });
    map.ready.then(() => {
      map.setState(q.data.iso, 'hint');
      map.label(q.data.iso, cname(q.data.iso), { size: 14 });
      map.flyTo(q.data.box, { pad: 0.08, maxZoom: 30, duration: 500 });
    });
    function finish(timeout) {
      if (done) return;
      done = true;
      map.setLocked(true);
      doneBtn.remove();
      for (const id of need) if (!found.has(id)) { map.setState(id, 'target'); map.label(id, cname(id), { size: 12 }); }
      const frac = Math.max(0, (found.size - wrong.size * 0.5) / need.size);
      const correct = found.size === need.size && wrong.size === 0;
      const msg = correct ? (kids ? `You found them all! 🎉` : `All ${need.size} found!`)
        : `${found.size} of ${need.size} found${need.size - found.size ? `; the missing ones are in yellow` : ''}.`;
      message(ui.foot, msg, correct ? true : frac >= 0.5 ? null : false);
      if (!timeout) api.answer({ correct, partial: !correct && frac > 0, points: correct ? undefined : Math.round(100 * frac), given: [...found, ...wrong], detail: { found: found.size, of: need.size, wrong: wrong.size } });
    }
    return {
      map, destroy: () => map.destroy(),
      timeout() { finish(true); },
      choose(x) { map.ready.then(() => { if (x === 'correct') { q.answer.forEach(id => found.add(id)); } finish(); }); },
    };
  },
});
