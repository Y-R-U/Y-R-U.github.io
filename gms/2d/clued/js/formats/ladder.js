import { register, poolItems, pickPack, byDifficulty, distractors, imageOf, placeAnswer, collect, pick, isIucn } from './registry.js?v=202610081215';
import { h, choiceGrid, typeBox } from '../ui/kit.js?v=202610081215';
import { fuzzyMatch, answersFor } from '../core/fuzzy.js?v=202610081215';
import { norm, injectCSS, baseCSS, stages, once, hasImg } from './fkit.js?v=202610081215';

const CSS = `
.ld{gap:10px}
.ld-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ld-count{font-weight:900;color:var(--ink-2)}
.ld-pot{flex:1;max-width:160px;height:12px;border:2px solid var(--ink);border-radius:99px;background:#fff;overflow:hidden}
.ld-pot i{display:block;height:100%;background:var(--mint);transition:width .35s cubic-bezier(.3,1.3,.5,1)}
.ld-clues{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;flex:1 1 auto;max-height:46vh}
.ld-clue{display:flex;gap:10px;align-items:flex-start;background:#fff;border:var(--line) solid var(--ink);border-radius:14px;padding:9px 12px;font-size:17px;line-height:1.3;box-shadow:var(--shadow-sm);animation:ld-in .4s cubic-bezier(.2,1.4,.4,1) both}
.ld-clue b{flex:none;width:26px;height:26px;border-radius:8px;background:var(--grape);color:#fff;display:grid;place-items:center;font-family:var(--font-display);font-weight:400;font-size:15px}
.ld-clue.hidden{background:repeating-linear-gradient(45deg,#f1edff,#f1edff 8px,#fff 8px,#fff 16px);color:transparent;box-shadow:none;border-style:dashed;animation:none}
.ld-clue.hidden b{background:var(--ink-3)}
@keyframes ld-in{from{opacity:0;transform:translateY(-8px) scale(.97)}}
.ld-ans{display:flex;flex-direction:column;gap:10px}
.ld-tries{text-align:center;font-size:14px;color:var(--ink-2);min-height:18px}
.play.kids .ld-clue{font-size:20px}
@media (orientation:landscape) and (max-height:520px){
 .ld{flex-direction:row;gap:16px}.ld-left{flex:1 1 55%;display:flex;flex-direction:column;gap:8px;min-height:0}
 .ld-ans{flex:1 1 45%;justify-content:center}.ld-clues{max-height:none}.ld-clue{font-size:15px;padding:6px 10px}
}
@media (min-width:900px) and (min-height:560px){.ld{flex-direction:row;gap:28px}.ld-left{flex:1 1 55%;display:flex;flex-direction:column;gap:10px}.ld-ans{flex:1 1 45%;justify-content:center}.ld-clues{max-height:60vh}}
`;

const COMMON = new Set(['black', 'white', 'green', 'brown', 'common', 'great', 'little', 'giant', 'small', 'royal', 'house', 'north', 'south', 'eastern', 'western', 'northern', 'southern', 'american', 'european', 'african', 'asian', 'there', 'their', 'about', 'which']);
const leak = (clue, names) => {
  const c = ` ${norm(clue)} `;
  return names.some(n => {
    const nn = norm(n);
    if (!nn) return false;
    if (c.includes(` ${nn} `)) return true;
    return nn.split(' ').some(w => w.length >= 5 && !COMMON.has(w) && c.includes(` ${w} `));
  });
};

// n clues spread from hardest to easiest, keeping the first and last.
function spread(list, n) {
  if (list.length <= n) return list.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round(i * (list.length - 1) / (n - 1))]);
  return [...new Set(out)];
}

const clueCache = new WeakMap();
const usableClues = it => {
  if (!clueCache.has(it)) clueCache.set(it, (it.clues || []).filter(c => typeof c === 'string' && c.trim() && !leak(c, answersFor(it))));
  return clueCache.get(it);
};

function make(rng, pack, opts, difficulty, kids) {
  const want = kids ? 5 : [5, 10, 20].includes(+opts.clues) ? +opts.clues : 10;
  const typed = !kids && opts.answer === 'type';
  const all = poolItems([pack]);
  const pool = byDifficulty(all.filter(c => usableClues(c.item).length >= 5), difficulty, 4, c => c.item.difficulty || 2);
  if (!pool.length) return null;
  const t = pick(rng, pool);
  const clues = spread(usableClues(t.item).filter(c => !kids || !isIucn({ label: c })), want);
  if (clues.length < 5) return null;
  const q = {
    format: 'ladder', id: `ladder:${t.ref}`, prompt: typed ? 'Name it from the clues' : 'Which one is it?',
    answerText: t.item.name, explain: t.item.blurb, refs: [t.ref], pack: pack.id, stages: clues.length,
    data: { clues, typed, accept: answersFor(t.item) },
  };
  if (!typed) {
    const n = kids ? 3 : difficulty === 1 ? 3 : 4;
    const wrong = distractors(rng, t, all, n - 1);
    if (!wrong) return null;
    const { options, answer } = placeAnswer(rng, t, wrong);
    const pics = kids && options.every(c => hasImg(c.item));
    q.options = options.map(c => (pics ? { text: c.item.name, img: imageOf(c.item, rng) } : { text: c.item.name }));
    q.answer = answer;
    q.data.layout = pics ? 'images' : 'text';
    q.refs.push(...wrong.map(c => c.ref));
  } else {
    q.answer = t.item.name;
  }
  return q;
}

export default register({
  id: 'ladder', revealInline: true, title: 'Clue ladder', icon: '🪜', blurb: 'Fewer clues, more points', tags: ['slow', 'kids'], kids: true, timeScale: q => Math.min(2, 1 + q.data.clues.length / 10),
  options: [
    { key: 'clues', label: 'Clues', type: 'choice', values: [5, 10, 20], default: 10, kidsHide: true },
    { key: 'answer', label: 'Answer by', type: 'choice', values: ['pick', 'type'], labels: ['Picking', 'Typing'], default: 'pick', kidsHide: true },
  ],
  supports(info) {
    return (info.caps?.clues || 0) >= 4 ? true : 'Needs items with at least 5 clues';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const usable = packs.filter(p => (p.items || []).filter(it => usableClues(it).length >= 5).length >= 4);
    if (!usable.length) return [];
    return collect(count, () => make(rng, pickPack(rng, usable), opts, difficulty, kids), avoid);
  },
  render(el, q, api) {
    injectCSS('f-ladder-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data, N = d.clues.length;
    const answer = once(api);
    const count = h('span.ld-count'), pot = h('div.ld-pot', {}, h('i'));
    const list = h('ol.ld-clues');
    const items = d.clues.map((c, i) => h('li.ld-clue.hidden', {}, h('b', {}, String(i + 1)), h('span', {}, c)));
    list.append(...items);
    const prompt = h('h2.q-prompt', {}, q.prompt);
    const left = h('div.ld-left', {}, h('div.ld-top', {}, count, pot), list);
    const ans = h('div.ld-ans', {}, prompt);
    el.append(h('div.f-stage.ld', {}, left, ans));
    let st;
    const draw = s => {
      items.forEach((li, i) => li.classList.toggle('hidden', i > s));
      count.textContent = `Clue ${s + 1} of ${N}`;
      pot.firstChild.style.width = `${100 * (1 - 0.6 * s / Math.max(1, N - 1))}%`;
      items[s]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (s > 0) api.sfx('reveal');
    };
    st = stages(api, q, el, draw);
    if (st.button) left.append(st.button);
    const showAll = () => items.forEach(li => li.classList.remove('hidden'));
    let grid = null, box = null, tries = 0;
    const triesEl = h('div.ld-tries');
    if (!d.typed) {
      grid = choiceGrid(ans, q.options, {
        images: d.layout === 'images',
        onPick(i) {
          grid.lock(); grid.mark(q.answer, i); st.lock(); showAll();
          answer({ correct: i === q.answer, given: i, detail: { clues: st.stage + 1 }, ...(i === q.answer ? st.points() : {}) });
        },
      });
    } else {
      box = typeBox(ans, {
        placeholder: 'Your answer', button: 'Guess',
        onSubmit(v) {
          const m = fuzzyMatch(v, d.accept);
          if (m.ok) { box.lock(); st.lock(); showAll(); answer({ correct: true, given: v, detail: { clues: st.stage + 1 }, ...st.points() }); return; }
          tries++;
          api.sfx('wrong'); api.haptic && api.haptic('wrong');
          if (tries >= 3) { box.lock(); st.lock(); showAll(); answer({ correct: false, given: v }); return; }
          triesEl.textContent = `Not “${v}”. ${3 - tries} ${3 - tries === 1 ? 'guess' : 'guesses'} left.`;
          return false;
        },
      });
      ans.append(triesEl);
    }
    const offKey = (() => {
      const fn = e => { if (e.key === '+' || (e.key === 'm' && !/input/i.test(e.target.tagName))) st.more(); };
      document.addEventListener('keydown', fn);
      return () => document.removeEventListener('keydown', fn);
    })();
    return {
      destroy() { grid?.destroy(); st.destroy(); offKey(); },
      timeout() { grid?.lock(); grid?.mark(q.answer, -1); box?.lock(); st.lock(); showAll(); },
      eliminate(k = 2) { grid?.eliminate(q.answer, k, api.rng || Math.random); },
      hint: () => d.clues[Math.min(N - 1, st.stage + 1)],
      choose(x) {
        if (grid) return grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x);
        box.input.value = x === 'correct' ? q.answer : x === 'wrong' ? 'zzzz' : String(x);
        box.el.requestSubmit();
      },
    };
  },
});
