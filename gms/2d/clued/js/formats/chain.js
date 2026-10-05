import { register, imageOf, collect, pick, shuffle } from './registry.js?v=202610050144';
import { h, imgEl } from '../ui/kit.js?v=202610050144';
import { injectCSS, baseCSS, once, hasImg } from './fkit.js?v=202610050144';
import { FILMS } from './chain_data.js?v=202610050144';

const CSS = `
.ch{gap:10px}
.ch-row{display:flex;align-items:flex-start;justify-content:center;gap:2px;flex-wrap:nowrap}
.ch-actor{flex:1 1 0;min-width:0;max-width:110px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;font-weight:900;font-size:12px;line-height:1.1;animation:ch-in .35s cubic-bezier(.2,1.4,.4,1) both}
.ch-actor .ph{width:min(64px,15vw);height:min(64px,15vw);border-radius:50%;border:var(--line) solid var(--ink);background:#eee center/cover;overflow:hidden;box-shadow:var(--shadow-sm);display:grid;place-items:center;font-family:var(--font-display);font-size:26px}
.ch-actor .ph img{width:100%;height:100%;object-fit:cover}
.ch-link{flex:0 1 44px;min-width:24px;margin-top:20px;display:flex;flex-direction:column;align-items:center;gap:2px}
.ch-link .ln{width:100%;height:5px;border-radius:5px;background:repeating-linear-gradient(90deg,var(--ink-3) 0 6px,transparent 6px 10px)}
.ch-link .q{width:26px;height:26px;border-radius:9px;border:var(--line) solid var(--ink);background:#fff;display:grid;place-items:center;font-family:var(--font-display);font-size:16px}
.ch-link.cur .q{background:var(--sun);animation:flame .6s infinite alternate}
.ch-link.ok .ln{background:var(--good)}.ch-link.ok .q{background:var(--good);color:#fff}
.ch-link.bad .ln{background:var(--bad)}.ch-link.bad .q{background:var(--bad);color:#fff}
.ch-ask{text-align:center;font-weight:900;font-size:17px}
.ch-ask b{color:var(--grape)}
.ch-films{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:14px}
.ch-films li{display:flex;gap:6px}.ch-films li b{flex:none}
@media (orientation:landscape) and (max-height:520px){
 .ch{display:grid;grid-template-columns:1fr 1fr;column-gap:16px;align-content:center}.ch .q-prompt{grid-column:1/-1}.ch-row{grid-column:1}.ch-pick{grid-column:2;grid-row:2/4}.ch-ask{grid-column:1}
 .ch-actor .ph{width:52px;height:52px}
}
@media (min-width:900px) and (min-height:560px){.ch-actor{flex-basis:130px;font-size:15px}.ch-actor .ph{width:96px;height:96px}.ch-link{flex-basis:110px}}
`;

const castOf = Object.entries(FILMS).map(([title, cast]) => ({ title, cast: new Set(cast) }));
function graph() {
  const adj = new Map();
  for (const f of castOf) for (const a of f.cast) for (const b of f.cast) if (a !== b) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ to: b, film: f.title });
  }
  return adj;
}
const ADJ = graph();
const both = (f, a, b) => f.cast.has(a) && f.cast.has(b);

function make(rng, actorsPack, links, n) {
  const byName = new Map((actorsPack?.items || []).map(it => [it.name, it]));
  const starts = [...ADJ.keys()].filter(a => !actorsPack || byName.has(a)).sort();
  const path = [pick(rng, starts)];
  const films = [];
  for (let k = 0; k < links; k++) {
    const cur = path[path.length - 1];
    const next = shuffle(rng, (ADJ.get(cur) || []).filter(e => !path.includes(e.to) && !films.includes(e.film) && (!actorsPack || byName.has(e.to))));
    if (!next.length) return null;
    path.push(next[0].to); films.push(next[0].film);
  }
  const L = films.map((film, k) => {
    const a = path[k], b = path[k + 1];
    const near = castOf.filter(f => f.title !== film && !both(f, a, b) && (f.cast.has(a) || f.cast.has(b)) && !films.includes(f.title));
    const far = castOf.filter(f => f.title !== film && !both(f, a, b) && !near.includes(f) && !films.includes(f.title));
    const wrong = [...shuffle(rng, near), ...shuffle(rng, far)].slice(0, n - 1).map(f => f.title);
    const options = shuffle(rng, [film, ...wrong]);
    return { options, answer: options.indexOf(film) };
  });
  if (L.some(l => l.options.length < n)) return null;
  const actor = name => {
    const it = byName.get(name);
    return { name, img: it && hasImg(it) ? imageOf(it, rng) : undefined };
  };
  return {
    format: 'chain', id: `chain:${path.join('>')}`, prompt: `Link ${path[0]} to ${path[path.length - 1]}`,
    answer: L.map(l => l.answer), answerText: path.map((a, k) => (k < films.length ? `${a} → ${films[k]} →` : a)).join(' '),
    refs: actorsPack ? path.filter(a => byName.has(a)).map(a => `${actorsPack.id}/${byName.get(a).id}`) : [], pack: actorsPack?.id,
    data: { actors: path.map(actor), links: L.map(l => ({ options: l.options })) },
  };
}

export default register({
  id: 'chain', title: 'Link chain', icon: '⛓️', blurb: 'Actor → film → actor', tags: ['slow'], timeScale: q => 1 + q.data.links.length * 0.8,
  options: [
    { key: 'links', label: 'Links', type: 'choice', values: [2, 3, 4], default: 3 },
    { key: 'answers', label: 'Films per link', type: 'choice', values: [3, 4], default: 3 },
  ],
  supports(info) {
    return info.caps?.facts?.films ? true : 'Link chains use the actors pack';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const actorsPack = packs.find(p => (p.items || []).some(it => it.facts?.films)) || null;
    if (!actorsPack) return [];
    const links = kids ? 2 : [2, 3, 4].includes(+opts.links) ? +opts.links : difficulty === 1 ? 2 : difficulty === 3 ? 4 : 3;
    const n = kids ? 3 : +opts.answers === 4 ? 4 : 3;
    return collect(count, () => make(rng, actorsPack, links, n), avoid, count * 30);
  },
  render(el, q, api) {
    injectCSS('f-chain-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data, N = d.links.length;
    const answer = once(api);
    const given = [];
    let k = 0, done = false;
    const row = h('div.ch-row');
    const linkEls = [];
    d.actors.forEach((a, i) => {
      row.append(h('div.ch-actor', { style: { animationDelay: `${i * 80}ms` } },
        h('span.ph', {}, a.img ? imgEl(a.img, { alt: a.name }) : a.name.charAt(0)), h('span', {}, a.name)));
      if (i < N) { const l = h('div.ch-link', {}, h('span.q', {}, '?'), h('span.ln')); linkEls.push(l); row.append(l); }
    });
    const ask = h('div.ch-ask');
    const pickEl = h('div.ch-pick.q-answers');
    el.append(h('div.f-stage.ch', {}, h('h2.q-prompt', {}, q.prompt), row, ask, pickEl));
    let buttons = [];
    function step() {
      linkEls.forEach((l, i) => l.classList.toggle('cur', i === k && !done));
      if (k >= N) return finish();
      ask.innerHTML = '';
      ask.append('Which film has ', h('b', {}, d.actors[k].name), ' and ', h('b', {}, d.actors[k + 1].name), '?');
      pickEl.innerHTML = '';
      const grid = h('div.choices', { class: `n${d.links[k].options.length}` });
      buttons = d.links[k].options.map((t, i) => {
        const b = h('button.choice', { type: 'button', style: `--i:${i}` }, h('span.badge', {}, String(i + 1)), h('span.label', {}, t));
        b.addEventListener('click', () => choose(i));
        grid.append(b);
        return b;
      });
      grid.classList.remove('n4'); grid.style.gridTemplateColumns = '1fr';
      pickEl.append(grid);
    }
    function choose(i) {
      if (done || k >= N || buttons[i].disabled) return;
      const right = q.answer[k], ok = i === right;
      given.push(i);
      buttons.forEach((b, j) => { b.disabled = true; b.classList.toggle('right', j === right); b.classList.toggle('wrong', j === i && !ok); b.classList.toggle('dim', j !== right && j !== i); });
      linkEls[k].classList.add(ok ? 'ok' : 'bad');
      linkEls[k].querySelector('.q').textContent = ok ? '✓' : '✗';
      api.sfx(ok ? 'button' : 'wrong');
      k++;
      setTimeout(step, ok ? 450 : 1100);
    }
    function finish() {
      if (done) return;
      done = true;
      const right = given.filter((g, i) => g === q.answer[i]).length;
      linkEls.forEach(l => l.classList.remove('cur'));
      api.reveal(`<ul class="ch-films">${d.links.map((l, i) => `<li><b>${i + 1}.</b>${l.options[q.answer[i]].replace(/</g, '&lt;')}</li>`).join('')}</ul>`);
      answer(right === N ? { correct: true, given } : { correct: false, partial: right > 0, points: Math.round(100 * right / N), given, detail: `${right}/${N}` });
    }
    const onKey = e => {
      if (done || /input|textarea/i.test(e.target.tagName)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= buttons.length) { e.preventDefault(); e.stopPropagation(); choose(n - 1); }
    };
    document.addEventListener('keydown', onKey, true);
    step();
    return {
      destroy() { document.removeEventListener('keydown', onKey, true); },
      timeout() { done = true; buttons.forEach(b => { b.disabled = true; }); },
      choose(x) {
        const go = () => { if (done || k >= N) return; choose(x === 'wrong' && k === 0 ? (q.answer[k] + 1) % buttons.length : q.answer[k]); setTimeout(go, 1200); };
        go();
      },
    };
  },
});
