import { register, poolItems, pickPack, byDifficulty, imageOf, collect, pick, midName, capFirst, comparison, lcLabel, plainLabel } from './registry.js?v=202610071629';
import { h, choiceGrid, imgEl, countUp } from '../ui/kit.js?v=202610071629';
import { numericKeys, numOf, apart, rangeOf, fmtFact, norm, injectCSS, baseCSS, hasImg } from './fkit.js?v=202610071629';

const CSS = `
.hl-cards{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:stretch}
.hl-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding:10px;background:#fff;border:var(--line) solid var(--ink);border-radius:var(--r);box-shadow:var(--shadow);min-height:150px;text-align:center;animation:ch-in .35s cubic-bezier(.2,1.4,.4,1) both}
.hl-card.b{animation-delay:.08s}
.hl-card img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;border:2px solid var(--ink);background:#eee}
.hl-name{font-family:var(--font-display);font-size:20px;line-height:1.1}
.hl-val{font-family:var(--font-display);font-size:24px;color:var(--grape);min-height:30px}
.hl-val.q{color:var(--ink-3)}
.hl-card.b.up .hl-val,.hl-card.b.down .hl-val{animation:f-pop .5s cubic-bezier(.2,1.8,.4,1)}
.hl-vs{align-self:center;font-family:var(--font-display);font-size:20px;color:var(--coral)}
.hl-label{text-align:center;font-weight:900;color:var(--ink-2);font-size:15px}
.hl .choices.n2{grid-template-columns:1fr 1fr}
.hl .choice{justify-content:center;font-family:var(--font-display);font-weight:400;font-size:22px;min-height:68px}
.hl .choice .icon{font-family:var(--font);font-size:18px}
.hl{justify-content:center}
.hl-card.noimg{justify-content:center}
.play.kids .hl-name{font-size:24px}
@media (orientation:landscape) and (max-height:520px){
 .hl{flex-direction:row;align-items:center;gap:16px}.hl-left{flex:1 1 58%}.hl-right{flex:1 1 42%;display:flex;flex-direction:column;gap:10px}
 .hl-card{min-height:0;padding:6px}.hl-card img{aspect-ratio:16/10;max-height:34vh}.hl .choices.n2{grid-template-columns:1fr}.hl .choice{min-height:52px}
}
@media (min-width:900px) and (min-height:560px){.hl-card{min-height:240px}.hl-name{font-size:24px}.hl-val{font-size:30px}}
`;

const PASSIVE = /^(released|born|built|founded|discovered|first published|published|painted|completed|opened|written|launched|formed|invented)$/i;
function yearQuestion(meta, b) {
  const l = String(meta.label || '').trim();
  if (/^died$/i.test(l)) return `Did ${b} die earlier or later?`;
  if (PASSIVE.test(l)) return `Was ${b} ${lcLabel(l)} earlier or later?`;
  return `${capFirst(b)}: earlier or later?`;
}

function make(rng, pack, key, difficulty, kids) {
  const meta = pack.factsMeta[key];
  const pool = byDifficulty(poolItems([pack]).filter(c => numOf(c.item, key) != null), difficulty, 6, c => c.item.difficulty || 2);
  if (pool.length < 2) return null;
  const a = pick(rng, pool);
  const va = numOf(a.item, key);
  const bs = pool.filter(c => c !== a && norm(c.item.name) !== norm(a.item.name) && apart(meta, va, numOf(c.item, key), kids ? 1 : difficulty, rangeOf(pack, key)));
  if (!bs.length) return null;
  const b = pick(rng, bs);
  const vb = numOf(b.item, key);
  const year = meta.type === 'year';
  const cmp = year ? null : comparison(meta);
  const options = year ? [{ text: 'Earlier', icon: '◀' }, { text: 'Later', icon: '▶' }]
    : [{ text: cmp?.hi || 'Higher', icon: '▲' }, { text: cmp?.lo || 'Lower', icon: '▼' }];
  const answer = year ? (vb < va ? 0 : 1) : (vb > va ? 0 : 1);
  const label = plainLabel(meta) || key;
  const yl = lcLabel(label);
  const an = capFirst(midName(a.item, pack)), bn = midName(b.item, pack);
  const ask = year ? yearQuestion(meta, bn) : cmp ? cmp.ask(bn) : `Is ${bn} higher or lower?`;
  const prompt = year
    ? `${a.item.name}: ${PASSIVE.test(yl) || yl === 'died' ? `${yl} ` : ''}${fmtFact(meta, va)}. ${ask}`
    : cmp?.stmt ? `${cmp.stmt(an, fmtFact(meta, va))} ${ask}` : `${label}: ${an} is ${fmtFact(meta, va)}. ${ask}`;
  const pics = hasImg(a.item) && hasImg(b.item);
  return {
    format: 'hilo', id: `hilo:${key}:${a.ref}:${b.ref}`, prompt, options, answer,
    answerText: `${options[answer].text}: ${b.item.name} is ${fmtFact(meta, vb)}`,
    explain: `${b.item.name}: ${fmtFact(meta, vb)} · ${a.item.name}: ${fmtFact(meta, va)}`,
    refs: [a.ref, b.ref], pack: pack.id,
    data: {
      label, year, ask: capFirst(ask),
      a: { name: a.item.name, value: fmtFact(meta, va), img: pics ? imageOf(a.item, rng) : undefined },
      b: { name: b.item.name, value: fmtFact(meta, vb), num: vb, img: pics ? imageOf(b.item, rng) : undefined },
    },
  };
}

export default register({
  id: 'hilo', title: 'Higher or lower', icon: '📈', blurb: 'Is the next one higher or lower?', tags: ['choice', 'kids'], kids: true,
  options: [],
  supports(info) {
    return Object.values(info.caps?.facts || {}).some(t => t === 'num' || t === 'year') ? true : 'Needs number or year facts';
  },
  generate({ rng, packs, count, difficulty = 0, kids = false, avoid }) {
    const usable = packs.map(p => ({ p, keys: numericKeys(p) })).filter(x => x.keys.length);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, keys } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + 1));
      return make(rng, p, pick(rng, keys), difficulty, kids);
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-hilo-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data;
    const card = (x, cls) => h(`div.hl-card.${cls}`, { class: x.img ? '' : 'noimg' }, x.img ? imgEl(x.img, { alt: x.name }) : null,
      h('div.hl-name', {}, x.name), h('div.hl-val', { class: cls === 'b' ? 'q' : '' }, cls === 'b' ? '?' : x.value));
    const A = card(d.a, 'a'), B = card(d.b, 'b');
    const left = h('div.hl-left', {}, h('div.hl-label', {}, d.label), h('div.hl-cards', {}, A, h('div.hl-vs', {}, 'vs'), B));
    const prompt = h('h2.q-prompt', {}, d.ask || (d.year ? `Was ${d.b.name} earlier or later?` : `Is ${d.b.name} higher or lower?`));
    const answers = h('div.q-answers');
    const right = h('div.hl-right', {}, prompt, answers);
    el.append(h('div.f-stage.hl', {}, left, right));
    const grid = choiceGrid(answers, q.options, {
      onPick(i) { grid.lock(); grid.mark(q.answer, i); show(); api.answer({ correct: i === q.answer, given: i }); },
    });
    const off = (() => {
      const fn = e => {
        if (grid.el.classList.contains('locked')) return;
        const k = e.key;
        if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'h') grid.pick(0);
        else if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'l') grid.pick(1);
      };
      document.addEventListener('keydown', fn);
      return () => document.removeEventListener('keydown', fn);
    })();
    function show() {
      const v = B.querySelector('.hl-val');
      v.classList.remove('q');
      B.classList.add(q.answer === 0 ? (d.year ? 'down' : 'up') : (d.year ? 'up' : 'down'));
      const n = d.b.num;
      if (!d.year && Number.isFinite(n) && Math.abs(n) >= 100 && Math.abs(n) < 1e13) {
        countUp(v, n, 650);
        setTimeout(() => { v.textContent = d.b.value; }, 720);
      } else v.textContent = d.b.value;
    }
    return {
      destroy() { grid.destroy(); off(); },
      timeout() { grid.lock(); grid.mark(q.answer, -1); show(); },
      choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? 1 - q.answer : +x); },
    };
  },
});
