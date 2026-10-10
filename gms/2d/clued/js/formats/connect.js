import { register, poolItems, byDifficulty, factText, collect, pick, shuffle, sample, factAllowed, nested } from './registry.js?v=202610100431';
import { h } from '../ui/kit.js?v=202610100431';
import { norm, injectCSS, baseCSS, once } from './fkit.js?v=202610100431';
import { toast } from '../ui/popup.js?v=202610100431';

const CSS = `
.cn{gap:10px}
.cn-solved{display:flex;flex-direction:column;gap:8px}
.cn-bar{border:var(--line) solid var(--ink);border-radius:14px;padding:8px 10px;text-align:center;box-shadow:var(--shadow-sm);animation:f-pop .45s cubic-bezier(.2,1.8,.4,1)}
.cn-bar b{display:block;font-family:var(--font-display);font-weight:400;font-size:18px}
.cn-bar span{font-size:14px;font-weight:800}
.cn-bar.missed{opacity:.75;border-style:dashed}
.cn-grid{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:7px}
.cn-t{min-height:64px;padding:4px;border:var(--line) solid var(--ink);border-radius:12px;background:#fff;box-shadow:var(--shadow-sm);font-weight:900;font-size:clamp(11px,3.3vw,15px);line-height:1.1;overflow-wrap:anywhere;hyphens:auto;transition:transform .1s,background .15s;animation:ch-in .3s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(var(--i)*18ms)}
.cn-t.sel{background:var(--ink);color:#fff;transform:translateY(-2px)}
.cn-t.shake{animation:shake .4s}
.cn-t.fly{animation:cn-fly .35s ease-in both}
@keyframes cn-fly{to{transform:scale(.6);opacity:0}}
.cn-foot{display:flex;align-items:center;gap:8px;justify-content:center;flex-wrap:wrap}
.cn-foot .btn{min-height:46px;padding:6px 16px;font-size:16px}
.cn-lives{display:flex;gap:5px;align-items:center;font-weight:900;color:var(--ink-2);font-size:14px}
.cn-lives i{width:14px;height:14px;border-radius:50%;background:var(--ink);transition:transform .3s,opacity .3s}
.cn-lives i.lost{opacity:.15;transform:scale(.6)}
.cn-c0{background:#ffe08a}.cn-c1{background:#a8e6cf}.cn-c2{background:#a9c9ff}.cn-c3{background:#d7b8ff}
@media (orientation:landscape) and (max-height:520px){
 .cn{display:grid;grid-template-columns:minmax(200px,32%) 1fr;column-gap:14px;align-content:start}
 .cn .q-prompt{grid-column:1}.cn-side{grid-column:1;display:flex;flex-direction:column;gap:8px}.cn-board{grid-column:2;grid-row:1/4;display:flex;flex-direction:column;gap:6px}
 .cn-t{min-height:44px;font-size:13px}.cn-bar{padding:3px 6px}.cn-bar b{font-size:15px}.cn-bar span{font-size:12px}
}
@media (min-width:900px) and (min-height:560px){.cn-t{min-height:78px;font-size:17px}.cn{max-width:720px}}
`;

function predicates(pack, difficulty, kids) {
  const items = pack.items || [];
  const out = [];
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if ((m.hard && difficulty !== 3) || !factAllowed(m, { kids, difficulty })) continue;
    if (m.type === 'cat' && m.exclusive !== false) {
      const counts = {};
      for (const it of items) { const v = it.facts?.[key]; if (v != null && !Array.isArray(v)) counts[v] = (counts[v] || 0) + 1; }
      for (const [v, c] of Object.entries(counts)) if (c >= 4) out.push({ key, value: v, attr: key, label: `${m.label || key}: ${v}` });
    } else if (m.type === 'bool') {
      for (const v of [true, false]) if (items.filter(it => it.facts?.[key] === v).length >= 4) out.push({ key, value: v, attr: key, label: factText(m, v) });
    }
  }
  return out;
}
// true / false / null (unknown: the item lacks that fact, so it can't be placed fairly)
const test = (p, it) => { const v = it.facts?.[p.key]; return v == null || Array.isArray(v) ? null : String(v) === String(p.value); };

function make(rng, pack, G, S, difficulty, kids) {
  const preds = predicates(pack, difficulty, kids);
  const per = a => preds.filter(p => p.attr === a).length;
  // a fact with one usable value (every hit is the 1980s) can never split tiles; one with < G values can't fill alone
  const attrs = [...new Set(preds.map(p => p.attr))].filter(a => per(a) >= 2);
  const solo = attrs.filter(a => per(a) >= G);
  if (!attrs.length || (!solo.length && attrs.length < 2)) return null;
  let chosen;
  if (attrs.length === 1 || (solo.length && (difficulty === 1 || rng() < 0.5))) {
    const a = pick(rng, solo);
    chosen = sample(rng, preds.filter(p => p.attr === a), G);
  } else {
    const [a, b] = sample(rng, attrs, 2);
    const k = 1 + Math.floor(rng() * (G - 1));
    chosen = [...sample(rng, preds.filter(p => p.attr === a), k), ...sample(rng, preds.filter(p => p.attr === b), G - k)];
  }
  if (chosen.length < G || new Set(chosen.map(p => p.label)).size < G) return null;
  if (chosen.some((p, i) => chosen.some((o, j) => j > i && p.attr === o.attr && nested(p.value, o.value)))) return null;
  const pool = byDifficulty(poolItems([pack]), difficulty, G * S * 2, c => c.item.difficulty || 2);
  const used = new Set();
  const groups = [];
  for (const p of chosen) {
    // members satisfy their own group and definitely none of the others
    const ok = pool.filter(c => test(p, c.item) === true && chosen.every(o => o === p || test(o, c.item) === false) && !used.has(norm(c.item.name)));
    const pickd = [];
    for (const c of shuffle(rng, ok)) { if (used.has(norm(c.item.name))) continue; used.add(norm(c.item.name)); pickd.push(c); if (pickd.length === S) break; }
    if (pickd.length < S) return null;
    groups.push({ label: p.label, members: pickd });
  }
  const tiles = shuffle(rng, groups.flatMap((g, gi) => g.members.map(c => ({ name: c.item.name, g: gi }))));
  return {
    format: 'connect', id: `connect:${pack.id}:${groups.flatMap(g => g.members.map(c => c.item.id)).sort().join(',')}`,
    prompt: `Find ${G} groups of ${S}`, answer: tiles.map(t => t.g),
    answerText: groups.map(g => `${g.label}: ${g.members.map(c => c.item.name).join(', ')}`).join(' · '),
    refs: groups.flatMap(g => g.members.map(c => `${pack.id}/${c.item.id}`)), pack: pack.id,
    data: { tiles: tiles.map(t => t.name), groups: groups.map(g => ({ label: g.label })), size: S, lives: 4 },
  };
}

export default register({
  id: 'connect', revealInline: true, answerOnBoard: true, title: 'Connections', icon: '🧶', blurb: 'Sort 16 into 4 hidden groups', tags: ['slow', 'nodaily'], timeScale: 6,
  options: [],
  supports(info) {
    const c = info.caps || {};
    const multi = new Set(c.multi || []);
    const n = Object.entries(c.facts || {}).filter(([k, t]) => t === 'cat' && !multi.has(k)).length;
    return n && info.items >= 9 ? true : 'Needs items with category facts';
  },
  generate({ rng, packs, count, difficulty = 0, kids = false, avoid }) {
    // 16 into 4 is the target; a pack whose facts can't fill that cleanly drops to 12 (3×4), then 9 (3×3)
    const shapes = kids ? [[3, 3]] : [[4, 4], [3, 4], [3, 3]];
    const usable = packs.filter(p => (p.items || []).length >= 9 && predicates(p, difficulty, kids).length >= 3);
    if (!usable.length) return [];
    const fits = new Map();
    return collect(count, () => {
      const p = pick(rng, usable);
      for (const [G, S] of shapes) {
        const k = `${p.id}:${G}x${S}`;
        if ((fits.get(k) || 0) >= 4 || (p.items || []).length < G * S) continue;
        for (let t = 0; t < 8; t++) { const q = make(rng, p, G, S, difficulty, kids); if (q) { fits.set(k, -1e9); return q; } }
        fits.set(k, (fits.get(k) || 0) + 1);   // a shape is only given up after several rounds of misses
      }
      return null;
    }, avoid, count * 6);
  },
  render(el, q, api) {
    injectCSS('f-connect-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data, S = d.size, G = d.groups.length;
    const answer = once(api);
    let sel = new Set(), lives = d.lives, done = false;
    const solved = new Set(), guesses = new Set();
    const solvedEl = h('div.cn-solved');
    const grid = h('div.cn-grid', { style: `--cols:${S}` });
    const tiles = d.tiles.map((t, i) => {
      const b = h('button.cn-t', { type: 'button', style: `--i:${i}`, dataset: { i: String(i) } }, t);
      b.addEventListener('click', () => toggle(i));
      return b;
    });
    grid.append(...tiles);
    const livesEl = h('div.cn-lives', {}, 'Mistakes left', ...Array.from({ length: lives }, () => h('i')));
    const submit = h('button.btn.go', { type: 'button', disabled: true, onclick: () => guess() }, 'Submit');
    const shuffleBtn = h('button.btn', { type: 'button', onclick: () => reshuffle() }, 'Shuffle');
    const clear = h('button.btn', { type: 'button', onclick: () => { sel.clear(); paint(); } }, 'Clear');
    el.append(h('div.f-stage.cn', {}, h('h2.q-prompt', {}, q.prompt), h('div.cn-side', {}, livesEl, h('div.cn-foot', {}, shuffleBtn, clear, submit)),
      h('div.cn-board', {}, solvedEl, grid)));
    function paint() {
      tiles.forEach((b, i) => b.classList.toggle('sel', sel.has(i)));
      submit.disabled = sel.size !== S || done;
      clear.disabled = !sel.size || done;
      [...livesEl.querySelectorAll('i')].forEach((x, k) => x.classList.toggle('lost', k >= lives));
    }
    function toggle(i) {
      if (done || tiles[i].hidden) return;
      if (sel.has(i)) sel.delete(i); else if (sel.size < S) sel.add(i);
      api.sfx('button');
      paint();
    }
    function reshuffle() {
      const live = tiles.filter(t => !t.hidden);
      for (let i = live.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [live[i], live[j]] = [live[j], live[i]]; }
      live.forEach(t => grid.append(t));
    }
    function bar(gi, missed = false) {
      const names = d.tiles.filter((_, i) => q.answer[i] === gi);
      solvedEl.append(h(`div.cn-bar.cn-c${gi % 4}`, { class: missed ? 'missed' : '' }, h('b', {}, d.groups[gi].label), h('span', {}, names.join(', '))));
    }
    function guess() {
      if (done || sel.size !== S) return;
      const picked = [...sel];
      const key = picked.slice().sort((a, b) => a - b).join(',');
      if (guesses.has(key)) { toast('Already guessed!'); return; }
      guesses.add(key);
      const gs = picked.map(i => q.answer[i]);
      const counts = {};
      gs.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
      const best = Math.max(...Object.values(counts));
      if (best === S) {
        const gi = gs[0];
        solved.add(gi);
        picked.forEach(i => tiles[i].classList.add('fly'));
        api.sfx('correct');
        setTimeout(() => { picked.forEach(i => { tiles[i].hidden = true; }); bar(gi); sel.clear(); paint(); if (solved.size === G) end(); }, 330);
      } else {
        lives--;
        api.sfx('wrong'); api.haptic && api.haptic('wrong');
        picked.forEach(i => { tiles[i].classList.remove('shake'); void tiles[i].offsetWidth; tiles[i].classList.add('shake'); });
        if (best === S - 1 && S > 2) toast('One away…');
        paint();
        if (lives <= 0) end();
      }
    }
    function end() {
      if (done) return;
      done = true;
      for (let gi = 0; gi < G; gi++) if (!solved.has(gi)) bar(gi, true);
      tiles.forEach(t => { t.hidden = true; });
      paint();
      const all = solved.size === G;
      answer(all ? { correct: true, given: [...solved] } : { correct: false, partial: solved.size > 0, points: solved.size * 25, given: [...solved], detail: `${solved.size}/${G}` });
    }
    const onKey = e => {
      if (done || /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); guess(); }
      else if (e.key === 'Escape') { sel.clear(); paint(); }
    };
    document.addEventListener('keydown', onKey, true);
    paint();
    return {
      destroy() { document.removeEventListener('keydown', onKey, true); },
      timeout() { if (!done) { done = true; for (let gi = 0; gi < G; gi++) if (!solved.has(gi)) bar(gi, true); tiles.forEach(t => { t.hidden = true; }); } },
      choose(x) {
        if (x === 'wrong') { while (!done) { sel = new Set(); const first = q.answer.indexOf(0); sel.add(first); q.answer.forEach((g, i) => { if (g !== 0 && sel.size < S) sel.add(i); }); guesses.clear(); guess(); } return; }
        const step = gi => { if (gi >= G || done) return; sel = new Set(q.answer.map((g, i) => (g === gi ? i : -1)).filter(i => i >= 0)); guess(); setTimeout(() => step(gi + 1), 360); };
        step(0);
      },
    };
  },
});
