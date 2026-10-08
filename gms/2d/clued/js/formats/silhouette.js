import { register, poolItems, pickPack, byDifficulty, distractors, placeAnswer, collect, pick } from './registry.js?v=202610081215';
import { h, choiceGrid } from '../ui/kit.js?v=202610081215';
import { injectCSS, baseCSS, stages, once, numOf } from './fkit.js?v=202610081215';

const CSS = `
.sl-box{position:relative;flex:1 1 0;min-height:180px;border:var(--line) solid var(--ink);border-radius:var(--r);background:radial-gradient(circle at 50% 40%,#fffdf6,#f1ead7);box-shadow:var(--shadow);overflow:hidden;display:grid;place-items:center}
.sl-box svg{position:absolute;inset:3%;width:94%;height:94%;overflow:visible}
.sl-main{fill:var(--ink);stroke:var(--ink);stroke-width:.4;stroke-linejoin:round;transition:fill .5s}
.sl-ctx{fill:none;stroke:rgba(31,26,77,.35);stroke-width:.35;stroke-dasharray:1.2 .8;opacity:0;transition:opacity .5s}
.sl-box.ctx .sl-ctx{opacity:1}
.sl-box.done .sl-main{fill:var(--coral)}
.sl-g{transform-origin:50px 50px;transition:transform .6s cubic-bezier(.3,1.1,.4,1)}
.sl-box.ctx .sl-g{transform:scale(.62)}
.sl-tag{position:absolute;left:10px;top:10px;padding:3px 10px;border:2px solid var(--ink);border-radius:999px;background:#fff;font-weight:900;font-size:14px;opacity:0;transform:translateY(-6px);transition:.35s}
.sl-tag.on{opacity:1;transform:none}
.sl-box .f-more{position:absolute;right:10px;bottom:10px}
.sl-load{color:var(--ink-3);font-weight:800}
.sl-q .q-body{flex:none}
@media (orientation:landscape) and (max-height:520px){.sl-q{flex-direction:row}.sl-q .sl-box{flex:1 1 48%;min-height:0}.sl-q .q-body{flex:1 1 52%;justify-content:center}}
@media (min-width:900px) and (min-height:560px){.sl-q{flex-direction:row;max-width:1000px;align-items:center;gap:28px}.sl-q .sl-box{flex:1 1 55%;height:min(62vh,540px)}.sl-q .q-body{flex:1 1 45%}}
`;

// Archipelagos and split countries whose main frame shows < 80% of the land (checked by tools/f_test.mjs against world.json)
const SKIP = new Set(['CPV', 'SLB', 'IDN', 'VUT', 'MYS', 'FJI', 'PHL', 'WSM', 'BHS', 'GNQ']);
const MIN_AREA = [30000, 400000, 60000, 10000];
const CONTINENTS = { AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America', OC: 'Oceania' };

const shapeable = it => it.iso3 && !SKIP.has(it.iso3) && (numOf(it, 'areaKm2') || 0) >= MIN_AREA[0];
const isCountryPack = p => (p.items || []).filter(it => it.iso3 && numOf(it, 'areaKm2') != null && !it.facts?.country).length >= 8;

function make(rng, pack, n, difficulty, kids) {
  const all = poolItems([pack]).filter(c => shapeable(c.item));
  const lvl = kids ? 1 : difficulty;
  const big = all.filter(c => numOf(c.item, 'areaKm2') >= MIN_AREA[lvl]);
  const pool = byDifficulty(big.length >= n ? big : all, lvl, n, c => c.item.difficulty || 2);
  const t = pick(rng, pool);
  if (!t) return null;
  const wrong = distractors(rng, t, all, n - 1);
  if (!wrong) return null;
  const { options, answer } = placeAnswer(rng, t, wrong);
  return {
    format: 'silhouette', id: `silhouette:${t.ref}`, prompt: 'Which country has this shape?',
    options: options.map(c => ({ text: c.item.name })), answer, answerText: t.item.name, explain: t.item.blurb,
    refs: [t.ref, ...wrong.map(c => c.ref)], pack: pack.id, stages: 3,
    data: { iso: t.item.iso3, continent: t.item.facts?.continent || t.item.group || '' },
  };
}

let geoP = null;
function loadGeo() {
  return (geoP ||= Promise.all([import('../geo/data.js?v=202610081215'), import('../geo/shape.js?v=202610081215')])
    .then(async ([data, shape]) => { const G = await data.loadIndex(); return { G, shape }; })
    .catch(e => { geoP = null; throw e; }));
}

export default register({
  id: 'silhouette', title: 'Silhouettes', icon: '🗺️', blurb: 'Name the country from its outline', tags: ['map', 'kids'], kids: true,
  options: [{ key: 'answers', label: 'Answers', type: 'choice', values: [3, 4], default: 4, kidsValues: [3], kidsDefault: 3 }],
  supports(info) {
    const f = info.caps?.facts || {};
    return info.theme === 'geography' && f.areaKm2 && f.continent && !f.country ? true : 'Country outlines need the countries pack';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 3 : +opts.answers === 3 ? 3 : 4;
    const usable = packs.filter(isCountryPack);
    if (!usable.length) return [];
    return collect(count, () => make(rng, pickPack(rng, usable), n, difficulty, kids), avoid);
  },
  render(el, q, api) {
    injectCSS('f-sil-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data;
    const answer = once(api);
    const box = h('div.sl-box', {}, h('span.sl-load', {}, 'Drawing the map…'));
    const tag = h('span.sl-tag', {}, d.continent ? `In ${d.continent}` : '');
    const answersEl = h('div.q-answers');
    el.append(h('div.q.has-media.sl-q', {}, box, h('div.q-body', {}, h('h2.q-prompt', {}, q.prompt), answersEl)));
    let cur = 0, drawn = false;
    loadGeo().then(async ({ G, shape }) => {
      if (!box.isConnected) return;
      const s = await shape.countryShape(d.iso, { neighbours: G.countries?.[d.iso]?.nb || [] });
      if (!box.isConnected) return;
      box.querySelector('.sl-load')?.remove();
      if (!s) { box.append(h('span.sl-load', {}, 'Map unavailable')); return; }
      box.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 100 100" aria-label="Country outline"><g class="sl-g"><path class="sl-ctx" d="${s.context}"/><path class="sl-main" d="${s.main}" fill-rule="evenodd"/></g></svg>`);
      if (!d.continent && G.countries?.[d.iso]) tag.textContent = `In ${CONTINENTS[G.countries[d.iso].c] || ''}`;
      drawn = true;
      paint(cur);
    }).catch(() => { const l = box.querySelector('.sl-load'); if (l) l.textContent = 'Map unavailable'; });
    box.append(tag);
    function paint(s) {
      cur = s;
      tag.classList.toggle('on', s >= 1);
      box.classList.toggle('ctx', drawn && s >= 2);
    }
    const st = stages(api, q, el, s => { if (s > cur) api.sfx('reveal'); paint(s); }, { label: 'Clue 👀' });
    if (st.button) box.append(st.button);
    const grid = choiceGrid(answersEl, q.options, {
      onPick(i) {
        grid.lock(); grid.mark(q.answer, i); st.lock(); box.classList.add('done', 'ctx');
        answer({ correct: i === q.answer, given: i, detail: { stage: st.stage }, ...(i === q.answer ? st.points() : {}) });
      },
    });
    return {
      destroy() { grid.destroy(); st.destroy(); },
      timeout() { grid.lock(); grid.mark(q.answer, -1); st.lock(); box.classList.add('done', 'ctx'); },
      eliminate(k = 2) { grid.eliminate(q.answer, k, api.rng || Math.random); },
      choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x); },
    };
  },
});
