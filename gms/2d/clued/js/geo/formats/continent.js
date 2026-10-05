import { register, collect, pick, shuffle } from '../../formats/registry.js?v=202610050139';
import { geo, countryIds, createMap, frame, message, revealCard, isKids, cname, theName, byLevel, refFor, supportsGeo, CONTINENTS, loadFlags } from './common.js?v=202610050139';
import { CONTINENT_FILL } from '../style.js?v=202610050139';

const CODES = ['AF', 'AS', 'EU', 'NA', 'SA', 'OC'];
const GLOBE = { AF: '🌍', EU: '🌍', AS: '🌏', OC: '🌏', NA: '🌎', SA: '🌎' };

export default register({
  id: 'continent', title: 'Which continent?', icon: '🌍', blurb: 'Name the continent a country is in', tags: ['map', 'kids'],
  options: [
    { key: 'answers', label: 'Buttons', type: 'choice', values: [3, 6], default: 6 },
    { key: 'map', label: 'Show map', type: 'choice', values: ['yes', 'no'], labels: ['Yes', 'No (harder)'], default: 'yes' },
  ],
  supports: supportsGeo, packless: true,
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid }) {
    const kids = !!opts.kids, level = kids ? 1 : difficulty || 0;
    const n = kids ? 3 : +opts.answers === 3 ? 3 : 6;
    const pool = byLevel(countryIds().filter(id => !geo.countries[id].cs && CODES.includes(geo.countries[id].c)), level, undefined, 12);
    return collect(count, () => {
      const iso = pick(rng, pool), c = geo.countries[iso].c;
      const opts6 = n === 6 ? CODES.slice() : shuffle(rng, [c, ...shuffle(rng, CODES.filter(x => x !== c)).slice(0, n - 1)]);
      return {
        format: 'continent', id: `continent:${iso}`, prompt: `Which continent is ${theName(iso)} in?`,
        options: opts6.map(code => ({ text: CONTINENTS[code], code })), answer: opts6.indexOf(c), answerText: CONTINENTS[c],
        explain: `${cap(theName(iso))} is in ${CONTINENTS[c]}.`, refs: refFor(packs, iso),
        data: { iso, kids, level, map: kids || opts.map !== 'no' },
      };
    }, avoid);
  },
  render(el, q, api) {
    const kids = isKids(q, api);
    const ui = frame(el, { prompt: q.prompt });
    let done = false, map = null;
    if (q.data.map) {
      // portraitZoom off: tall maps otherwise start zoomed on the Atlantic and the country can be off-screen (lane I)
      map = createMap(ui.mapEl, { region: 'world', target: 'none', interactive: false, dotFor: [q.data.iso], bigTargets: true, padding: 6, portraitZoom: false });
      map.ready.then(() => { map.setState(q.data.iso, 'target pulse'); });
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
    function finish(i) {
      if (done) return;
      done = true;
      const correct = i === q.answer;
      btns.forEach((b, k) => { b.disabled = true; if (k === q.answer) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); });
      if (map) { map.setStyle('continents'); map.label(q.data.iso, cname(q.data.iso), { size: 15 }); }
      const msg = correct ? (kids ? `Yes! ${cap(theName(q.data.iso))} is in ${q.answerText}! 🎉` : `Correct, ${q.answerText}.`)
        : kids ? `Good try! ${cap(theName(q.data.iso))} is in ${q.answerText}.` : `${cap(theName(q.data.iso))} is in ${q.answerText}.`;
      message(ui.foot, msg, correct);
      if (kids) ui.foot.append(revealCard(q.data.iso, true));
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
