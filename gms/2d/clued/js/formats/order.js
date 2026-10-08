import { register, poolItems, pickPack, byDifficulty, imageOf, collect, pick, shuffle, comparison, capFirst, factPhrase, whenPhrase } from './registry.js?v=202610081215';
import { h, imgEl } from '../ui/kit.js?v=202610081215';
import { numericKeys, numOf, spreadSet, rangeOf, fmtFact, uniqueByName, injectCSS, baseCSS, once, drag, hasImg } from './fkit.js?v=202610081215';

const CSS = `
.or-wrap{display:flex;flex-direction:column;gap:6px}
.or-cap{font-size:13px;font-weight:900;color:var(--ink-2);text-align:center;letter-spacing:.3px;text-transform:uppercase}
.or-list{position:relative;display:flex;flex-direction:column;gap:8px;list-style:none;margin:0;padding:0}
.or-it{position:relative;display:flex;align-items:center;gap:10px;min-height:58px;padding:6px 8px 6px 6px;background:#fff;border:var(--line) solid var(--ink);border-radius:14px;box-shadow:var(--shadow-sm);font-weight:900;font-size:17px;line-height:1.15;touch-action:none;user-select:none;cursor:grab;animation:ch-in .35s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(var(--i)*40ms)}
.or-it .pos{flex:none;width:30px;height:30px;border-radius:9px;background:var(--grape);color:#fff;display:grid;place-items:center;font-family:var(--font-display);font-weight:400;font-size:17px;border:2px solid var(--ink)}
.or-it img{flex:none;width:58px;height:44px;object-fit:cover;border-radius:8px;border:2px solid var(--ink);background:#eee}
.or-it .nm{flex:1;min-width:4.5em;overflow-wrap:break-word;hyphens:auto}
.or-it .val{flex:none;font-family:var(--font-display);font-weight:400;font-size:17px;color:var(--grape);display:none}
.or-it .mv{flex:none;display:flex;flex-direction:column;gap:2px}
.or-it .mv button{width:34px;height:24px;border:2px solid var(--ink);border-radius:7px;background:#f1edff;font-size:12px;line-height:1;padding:0}
.or-it .grip{flex:none;color:var(--ink-3);font-size:18px;letter-spacing:-2px}
.or-it.drag{z-index:5;cursor:grabbing;box-shadow:0 10px 22px rgba(31,26,77,.28),var(--shadow-sm);transform:scale(1.03);transition:none;animation:none}
.or-it.sel{box-shadow:0 0 0 4px var(--sky),var(--shadow-sm)}
.or-list.done .or-it{cursor:default}
.or-list.done .val{display:block}
.or-list.done .mv,.or-list.done .grip{display:none}
.or-it.ok{background:#e2fbe9}.or-it.ok .pos{background:var(--good)}
.or-it.bad{background:#ffe8e8}.or-it.bad .pos{background:var(--bad)}
.or-foot{display:flex;justify-content:center}
.or-foot .btn{min-width:160px}
.play.kids .or-it{min-height:70px;font-size:20px}.play.kids .or-it img{width:76px;height:58px}
@media (orientation:landscape) and (max-height:520px){
 .or{flex-direction:row;gap:16px}.or-head{flex:0 0 calc(46% - 24px);display:flex;flex-direction:column;justify-content:center;gap:12px}
 .or-wrap{flex:1}.or-it{min-height:40px;font-size:15px;padding:3px 8px 3px 4px}.or-it img{height:32px;width:44px}.or-list{gap:5px}.or-it .pos{width:26px;height:26px;font-size:15px}.or-it .mv{flex-direction:row;gap:4px}.or-it .mv button{height:28px;width:32px}.or-cap{font-size:11px}.or-wrap{gap:3px}.or-foot .btn{min-height:42px}
 .play.revealed .or-head{padding-bottom:calc(var(--rv-h,0px) + 14px)}
}
@media (min-width:900px) and (min-height:560px){.or-it{min-height:64px;font-size:19px}}
`;

const SUP_LO = { Smaller: 'smallest', Shorter: 'shortest', Lighter: 'lightest', Narrower: 'narrowest', Softer: 'softest', 'Less dense': 'least dense', 'More recently': 'most recent' };

function make(rng, pack, key, n, difficulty) {
  const meta = pack.factsMeta[key];
  const pool = uniqueByName(byDifficulty(poolItems([pack]).filter(c => numOf(c.item, key) != null), difficulty, n + 2, c => c.item.difficulty || 2));
  const set = spreadSet(rng, pool, c => numOf(c.item, key), meta, n, difficulty, rangeOf(pack, key));
  if (!set) return null;
  const year = meta.type === 'year';
  const sorted = set.slice().sort((a, b) => (year ? numOf(a.item, key) - numOf(b.item, key) : numOf(b.item, key) - numOf(a.item, key)));
  let shown = shuffle(rng, set);
  for (let k = 0; k < 4 && shown.every((c, i) => c === sorted[i]); k++) shown = shuffle(rng, set);
  if (shown.every((c, i) => c === sorted[i])) shown = sorted.slice().reverse();
  const pics = shown.every(c => hasImg(c.item));
  const cmp = year ? null : comparison(meta);
  const when = year && whenPhrase(meta);
  return {
    format: 'order', id: `order:${key}:${set.map(c => c.ref).sort().join(',')}`,
    prompt: year ? `Put these in order${when ? ` of ${when}` : ''}, earliest first` : `Put these in order: ${factPhrase(meta, key)}, ${cmp?.sup || 'highest'} first`,
    answer: sorted.map(c => shown.indexOf(c)), answerText: sorted.map(c => c.item.name).join(' → '),
    explain: sorted.map(c => `${c.item.name}: ${fmtFact(meta, numOf(c.item, key))}`).join(' · '),
    refs: set.map(c => c.ref), pack: pack.id,
    data: {
      items: shown.map(c => ({ text: c.item.name, img: pics ? imageOf(c.item, rng) : undefined, value: fmtFact(meta, numOf(c.item, key)) })),
      caps: year ? ['Earliest', 'Latest'] : cmp ? [capFirst(cmp.sup), capFirst(SUP_LO[cmp.lo] || 'last')] : ['Highest', 'Lowest'],
    },
  };
}

function capsOf(l) {
  if (Array.isArray(l) && l.length >= 2) return l.slice(0, 2).map(String);
  const m = typeof l === 'string' && l.match(/^(.+?)\s+(?:to|→|->)\s+(.+)$/i);
  return m ? [m[1].charAt(0).toUpperCase() + m[1].slice(1), m[2].charAt(0).toUpperCase() + m[2].slice(1)] : typeof l === 'string' && l.trim() ? [l.trim(), ''] : ['First', 'Last'];
}

function fromQuestion(rng, pack, difficulty) {
  const qs = byDifficulty((pack.questions || []).filter(q => q.kind === 'order' && Array.isArray(q.answer) && q.answer.length >= 3), difficulty, 1);
  if (!qs.length) return null;
  const q = pick(rng, qs);
  const correct = q.answer.map(String);
  let shown = shuffle(rng, correct);
  if (shown.every((t, i) => t === correct[i])) shown = correct.slice().reverse();
  return {
    format: 'order', id: `order:${pack.id}/q:${q.id}`, prompt: q.prompt, answer: correct.map(t => shown.indexOf(t)),
    answerText: correct.join(' → '), explain: q.explain, refs: [`${pack.id}/q:${q.id}`], pack: pack.id,
    data: { items: shown.map(text => ({ text })), caps: capsOf(q.orderLabel) },
  };
}

const COUNTS = [4, 5, 6];

export default register({
  id: 'order', revealInline: true, answerOnBoard: true, title: 'Put in order', icon: '↕️', blurb: 'Drag them into the right order', tags: ['slow'], timeScale: q => 1 + q.data.items.length * 0.5,
  options: [{ key: 'items', label: 'Items', type: 'choice', values: COUNTS, default: 4, kidsValues: [4], kidsDefault: 4 }],
  supports(info) {
    const c = info.caps || {};
    if ((c.qkinds?.order || 0) > 0) return true;
    return Object.values(c.facts || {}).some(t => t === 'num' || t === 'year') && info.items >= 4 ? true : 'Needs number or date facts';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 3 : COUNTS.includes(+opts.items) ? +opts.items : 4;
    const usable = packs.map(p => ({ p, keys: numericKeys(p, { min: n }), qs: (p.questions || []).some(q => q.kind === 'order') })).filter(x => x.keys.length || x.qs);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, keys, qs } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + 1));
      if (qs && (!keys.length || rng() < 0.4)) return fromQuestion(rng, p, difficulty);
      return make(rng, p, pick(rng, keys), n, kids ? 1 : difficulty);
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-order-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data, n = d.items.length;
    const answer = once(api);
    let order = d.items.map((_, i) => i);   // display slot -> item index
    let sel = -1, done = false;
    const list = h('ol.or-list');
    const offs = [];
    const cards = d.items.map((it, i) => {
      const up = h('button', { type: 'button', 'aria-label': 'Move up' }, '▲'), down = h('button', { type: 'button', 'aria-label': 'Move down' }, '▼');
      const li = h('li.or-it', { style: `--i:${i}`, dataset: { i: String(i) } }, h('span.pos'), it.img ? imgEl(it.img, { alt: '' }) : null,
        h('span.nm', {}, it.text), h('span.val', {}, it.value || ''), h('span.mv', {}, up, down));
      up.addEventListener('pointerdown', e => e.stopPropagation());
      down.addEventListener('pointerdown', e => e.stopPropagation());
      up.addEventListener('click', () => move(i, -1));
      down.addEventListener('click', () => move(i, 1));
      offs.push(drag(li, {
        onStart() { if (done) return; li.classList.add('drag'); sel = -1; paint(); },
        onMove(e, dx, dy, s) { if (done) return; dragMove(li, i, e, s); },
        onEnd() { li.classList.remove('drag'); li.style.transform = ''; dragState = null; paint(); },
        onTap() { if (done) return; sel = sel === i ? -1 : i; paint(); },
      }));
      return li;
    });
    const check = h('button.btn.go', { type: 'button', onclick: () => grade() }, 'Check order');
    el.append(h('div.f-stage.or', {}, h('div.or-head', {}, h('h2.q-prompt', {}, q.prompt)),
      h('div.or-wrap', {}, h('div.or-cap', {}, '▲ ' + d.caps[0]), list, d.caps[1] ? h('div.or-cap', {}, '▼ ' + d.caps[1]) : null, h('div.or-foot', {}, check))));

    function layoutList(animate = true) {
      const before = new Map(cards.map(c => [c, c.getBoundingClientRect().top]));
      order.forEach(i => list.append(cards[i]));
      if (animate) cards.forEach(c => {
        if (c.classList.contains('drag')) return;
        const dy = before.get(c) - c.getBoundingClientRect().top;
        if (dy) c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,1.2,.4,1)' });
      });
      paint();
    }
    function paint() {
      order.forEach((i, slot) => { cards[i].querySelector('.pos').textContent = String(slot + 1); cards[i].classList.toggle('sel', sel === i); });
    }
    function move(i, dir) {
      if (done) return;
      const s = order.indexOf(i), t = s + dir;
      if (t < 0 || t >= n) return;
      [order[s], order[t]] = [order[t], order[s]];
      api.sfx('button');
      layoutList();
    }
    let dragState = null;
    function dragMove(li, i, e) {
      if (!dragState) dragState = { y0: e.clientY, start: li.offsetTop };
      const y = e.clientY, slot = order.indexOf(i);
      for (let s = 0; s < n; s++) {
        if (s === slot) continue;
        const r = cards[order[s]].getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if ((s < slot && y < mid) || (s > slot && y > mid)) { order.splice(slot, 1); order.splice(s, 0, i); layoutList(); api.sfx('button'); break; }
      }
      li.style.transform = `translateY(${y - dragState.y0 - (li.offsetTop - dragState.start)}px) scale(1.03)`;
    }
    function grade() {
      if (done) return;
      done = true;
      const given = order.slice();
      let right = 0;
      given.forEach((i, slot) => { const ok = q.answer[slot] === i; if (ok) right++; cards[i].classList.add(ok ? 'ok' : 'bad'); });
      check.disabled = true;
      list.classList.add('done');
      setTimeout(() => { if (!list.isConnected) return; order = q.answer.slice(); layoutList(); }, 650);
      const all = right === n;
      answer(all ? { correct: true, given } : { correct: false, partial: right > 0, points: Math.round(100 * right / n), given, detail: `${right}/${n}` });
      if (!all) api.reveal(`<b>${right} of ${n}</b> in the right place.`);
    }
    const onKey = e => {
      if (done || /input|textarea/i.test(e.target.tagName)) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= n) { e.preventDefault(); e.stopPropagation(); sel = order[num - 1]; paint(); }
      else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && sel >= 0) { e.preventDefault(); move(sel, e.key === 'ArrowUp' ? -1 : 1); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); grade(); }
    };
    document.addEventListener('keydown', onKey, true);
    layoutList(false);
    return {
      destroy() { offs.forEach(f => f()); document.removeEventListener('keydown', onKey, true); },
      timeout() { if (done) return; done = true; list.classList.add('done'); order = q.answer.slice(); layoutList(); },
      choose(x) {
        order = q.answer.slice();
        if (x === 'wrong') [order[0], order[1]] = [order[1], order[0]];
        layoutList(false); grade();
      },
    };
  },
});
