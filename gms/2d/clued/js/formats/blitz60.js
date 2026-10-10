import { register, poolItems, pickPack, collect, pick, factText, isIucn, lcLabel, factHeading } from './registry.js?v=202610101826';
import { h, typeBox } from '../ui/kit.js?v=202610101826';
import { fuzzyMatch, distance, answersFor } from '../core/fuzzy.js?v=202610101826';
import { norm, injectCSS, baseCSS, ownClock, once } from './fkit.js?v=202610101826';

const CSS = `
.bz{gap:10px}
.bz-top{display:flex;align-items:center;gap:10px}
.bz-clock{flex:none;width:64px;height:64px;border-radius:50%;border:var(--line) solid var(--ink);display:grid;place-items:center;font-family:var(--font-display);font-size:26px;background:conic-gradient(var(--mint) calc(var(--p)*360deg),#fff 0);box-shadow:var(--shadow-sm)}
.bz-clock span{width:46px;height:46px;border-radius:50%;background:#fff;display:grid;place-items:center}
.bz-clock.low{background:conic-gradient(var(--bad) calc(var(--p)*360deg),#fff 0);animation:flame .4s infinite alternate}
.bz-top .q-prompt{flex:1;text-align:left;font-size:clamp(17px,4.8vw,24px)}
.bz-count{font-family:var(--font-display);font-size:22px;white-space:nowrap}
.bz-count small{font-size:14px;color:var(--ink-2)}
.bz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--w,96px),1fr));gap:5px;overflow:auto;min-height:0;flex:1 1 auto;align-content:start;padding:2px}
.bz-s{min-height:30px;padding:4px 6px;border:2px dashed rgba(31,26,77,.3);border-radius:9px;font-size:13px;font-weight:900;color:var(--ink-3);display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.05;overflow-wrap:anywhere}
.bz-s.got{border:2px solid var(--ink);background:#c9f5d8;color:var(--ink);animation:f-pop .45s cubic-bezier(.2,1.8,.4,1)}
.bz-s.miss{border-style:solid;border-color:rgba(31,26,77,.25);color:var(--ink-2);background:#f6f3ff}
.bz-msg{min-height:20px;text-align:center;font-weight:800;color:var(--ink-2);font-size:14px}
.bz-start{align-self:center}
.bz .type-box[hidden]{display:none}
@media (orientation:landscape) and (max-height:520px){
 .bz{display:grid;grid-template-columns:minmax(260px,38%) 1fr;grid-template-rows:auto auto auto 1fr;column-gap:14px}
 .bz-top{grid-column:1}.bz .type-box,.bz-msg,.bz-start{grid-column:1}.bz-grid{grid-column:2;grid-row:1/5}
 .bz-top .q-prompt{font-size:16px}.bz-count{font-size:18px}.bz-clock{width:52px;height:52px;font-size:21px}.bz-clock span{width:38px;height:38px}
}
`;

const SHORT = s => String(s).split(/\s+/).length <= 5 && String(s).length <= 34;

const catCache = new WeakMap();
function categories(pack) {
  if (catCache.has(pack)) return catCache.get(pack);
  const items = (pack.items || []).filter(it => SHORT(it.name));
  const out = [];
  const title = pack.title || pack.id;
  if (items.length >= 6) out.push({ label: title, test: () => true, key: '*' });
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if (m.hard || isIucn(m)) continue;
    if (m.type === 'cat') {
      const counts = {};
      for (const it of items) for (const v of [].concat(it.facts?.[key] ?? [])) counts[v] = (counts[v] || 0) + 1;
      for (const [v, c] of Object.entries(counts)) if (c >= 6 && c < items.length) out.push({ label: `${title} (${factHeading(m, key) ? `${lcLabel(factHeading(m, key))}: ` : ''}${v})`, key: `${key}=${v}`, test: it => [].concat(it.facts?.[key] ?? []).map(String).includes(v) });
    } else if (m.type === 'bool') {
      const c = items.filter(it => it.facts?.[key] === true).length;
      if (c >= 6 && c < items.length) out.push({ label: `${title}: ${factText(m, true).toLowerCase()}`, key: `${key}=true`, test: it => it.facts?.[key] === true });
    }
  }
  catCache.set(pack, out);
  return out;
}

function make(rng, pack, difficulty) {
  const cats = categories(pack);
  if (!cats.length) return null;
  const cat = pick(rng, cats);
  const targets = poolItems([pack]).filter(c => SHORT(c.item.name) && cat.test(c.item));
  if (targets.length < 6) return null;
  // names that fuzzy-match each other can't both be answers
  const list = targets.map(c => ({ name: c.item.name, accept: answersFor(c.item), ref: c.ref })).sort((a, b) => a.name.localeCompare(b.name));
  const n = list.length;
  return {
    format: 'blitz60', id: `blitz60:${pack.id}:${cat.key}`, prompt: `Name as many as you can: ${cat.label}`,
    answer: n, answerText: list.length > 8 ? `${list.slice(0, 8).map(t => t.name).join(', ')} and ${list.length - 8} more` : list.map(t => t.name).join(', '), refs: list.map(t => t.ref).slice(0, 60), pack: pack.id,
    data: { targets: list.map(t => ({ name: t.name, accept: t.accept })), goal: Math.max(3, Math.min(10, Math.ceil(n * 0.4))), level: difficulty, seconds: 60 },
  };
}

export default register({
  id: 'blitz60', revealInline: true, answerOnBoard: true, title: 'Name them all', icon: '⏱️', blurb: 'As many as you can in 60 seconds', tags: ['slow', 'nodaily'], manualTimer: true, minPerPack: 2,
  options: [],
  supports(info) {
    return info.items >= 6 ? true : 'Needs at least 6 items';
  },
  generate({ rng, packs, count, difficulty = 0, avoid }) {
    const usable = packs.filter(p => categories(p).length);
    if (!usable.length) return [];
    return collect(count, () => make(rng, pickPack(rng, usable), difficulty), avoid, count * 30);
  },
  render(el, q, api) {
    injectCSS('f-blitz60-css', CSS); baseCSS();
    el.innerHTML = '';
    ownClock(api, el);
    const d = q.data, T = d.targets, total = T.length;
    const answer = once(api);
    const found = new Set();
    const showGrid = total <= 80;
    const lvl = d.level || 0;
    const clock = h('div.bz-clock', { style: `--p:${1}` }, h('span', {}, String(d.seconds)));
    const countEl = h('div.bz-count', {}, '0', h('small', {}, ` / ${total}`));
    const grid = h('div.bz-grid', { style: `--w:${total > 40 ? '84px' : '104px'}` });
    const slots = T.map(t => {
      const hint = !showGrid ? '' : lvl === 1 ? `${t.name.charAt(0)}${'·'.repeat(Math.min(10, t.name.length - 1))}` : lvl === 3 ? '' : t.name.charAt(0);
      const s = h('div.bz-s', {}, hint);
      if (showGrid) grid.append(s);
      return s;
    });
    const msg = h('div.bz-msg', {}, `Goal: ${d.goal}. Typos are fine.`);
    let left = d.seconds * 1000, t0 = 0, iv = null, over = false;
    const box = typeBox(document.createElement('div'), { placeholder: 'Type a name…', button: 'Enter', onSubmit: v => submit(v) });
    const start = h('button.btn.go.big.bz-start', { type: 'button', onclick: () => begin() }, 'Start the clock');
    box.el.hidden = true;
    el.append(h('div.f-stage.bz', {}, h('div.bz-top', {}, clock, h('h2.q-prompt', {}, q.prompt), countEl), start, box.el, msg, grid));
    function begin() {
      if (t0) return;
      start.remove(); box.el.hidden = false;
      setTimeout(() => box.input.focus({ preventScroll: true }), 30);
      t0 = performance.now();
      iv = setInterval(tick, 100);
    }
    function tick() {
      const r = Math.max(0, left - (performance.now() - t0));
      clock.style.setProperty('--p', r / (d.seconds * 1000));
      clock.firstChild.textContent = String(Math.ceil(r / 1000));
      clock.classList.toggle('low', r < 10000);
      if (r <= 0) end();
    }
    function submit(v) {
      if (over) return false;
      const g = norm(v);
      let best = -1, bestD = Infinity, dup = false;
      T.forEach((t, i) => {
        const m = fuzzyMatch(v, t.accept);
        if (!m.ok) return;
        const dd = Math.min(...t.accept.map(a => distance(norm(a), g)));
        if (found.has(i)) { if (dd === 0) dup = true; return; }
        if (dd < bestD) { bestD = dd; best = i; }
      });
      if (best < 0) {
        msg.textContent = dup ? 'Already got that one!' : `“${v}” isn’t on the list`;
        api.sfx(dup ? 'button' : 'wrong');
        box.input.value = '';
        return false;
      }
      found.add(best);
      slots[best].textContent = T[best].name;
      slots[best].classList.add('got');
      if (!showGrid) grid.prepend(slots[best]);
      slots[best].scrollIntoView({ block: 'nearest' });
      countEl.firstChild.textContent = String(found.size);
      msg.textContent = found.size === d.goal ? 'Goal reached! Keep going…' : `✓ ${T[best].name}`;
      api.sfx(found.size === d.goal ? 'streak' : 'correct');
      box.input.value = '';
      if (found.size === total) end();
      return false;
    }
    function end() {
      if (over) return;
      over = true;
      clearInterval(iv);
      box.lock();
      T.forEach((t, i) => { if (!found.has(i)) { slots[i].textContent = t.name; slots[i].classList.add('miss'); if (!showGrid) grid.append(slots[i]); } });
      const k = found.size, ok = k >= d.goal;
      api.reveal(`You named <b>${k}</b> of ${total}${ok ? '' : ` (goal ${d.goal})`}.`);
      answer(ok ? { correct: true, points: Math.min(500, 300 + Math.round(200 * (k - d.goal) / Math.max(1, Math.min(total, d.goal * 2) - d.goal))), given: k }
        : { correct: false, partial: k > 0, points: Math.round(250 * k / d.goal), given: k, detail: `${k}/${total}` });
    }
    const onKey = e => { if (!t0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); begin(); } };
    document.addEventListener('keydown', onKey, true);
    return {
      destroy() { clearInterval(iv); document.removeEventListener('keydown', onKey, true); },
      timeout() { end(); },
      choose(x) {
        begin();
        const n = x === 'wrong' ? 1 : Math.min(total, d.goal);
        for (let i = 0; i < n; i++) submit(T[i].name);
        end();
      },
    };
  },
});
