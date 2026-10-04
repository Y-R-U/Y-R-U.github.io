import { register, poolItems, pickPack, byDifficulty, imageOf, collect, pick, shuffle } from './registry.js?v=1';
import { h, imgEl } from '../ui/kit.js?v=1';
import { norm, injectCSS, baseCSS, stretchTimer, once, fmtFact, uniqueByName, hasImg } from './fkit.js?v=1';

const CSS = `
.mt-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;align-items:start}
.mt-col{display:flex;flex-direction:column;gap:8px}
.mt-col h3{font-size:14px;font-family:var(--font);font-weight:900;color:var(--ink-2);text-align:center;margin:0}
.mt-t{--c:#fff;position:relative;display:flex;align-items:center;gap:8px;min-height:54px;padding:6px 10px;border:var(--line) solid var(--ink);border-radius:14px;background:#fff;box-shadow:var(--shadow-sm);font-weight:900;font-size:16px;line-height:1.15;text-align:left;transition:transform .1s,background .2s,box-shadow .1s;animation:ch-in .35s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(var(--i)*35ms);touch-action:manipulation}
.mt-t .lbl{flex:1;min-width:0;overflow-wrap:anywhere}
.mt-t img{width:100%;height:76px;object-fit:cover;border-radius:9px;border:2px solid var(--ink);background:#eee;display:block}
.mt-t.pic{flex-direction:column;align-items:stretch;padding:5px}
.mt-t.pic .lbl{display:none}
.mt-t .key{flex:none;width:24px;height:24px;border-radius:7px;border:2px solid var(--ink);background:#f1edff;display:grid;place-items:center;font-size:12px;font-weight:900}
.mt-t.pic .key{position:absolute;top:9px;left:9px;z-index:1;background:#fff}
.mt-t.sel{transform:translateY(-2px) scale(1.03);box-shadow:0 0 0 4px var(--sky),var(--shadow-sm)}
.mt-t.on{background:var(--c)}
.mt-t .dots{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;max-width:44px}
.mt-t .dots i{width:12px;height:12px;border-radius:50%;border:2px solid var(--ink);background:var(--d)}
.mt-t.ok{box-shadow:0 0 0 3px var(--good),var(--shadow-sm)}
.mt-t.bad{box-shadow:0 0 0 3px var(--bad),var(--shadow-sm);animation:shake .45s}
.mt-t .fix{display:block;font-size:12px;color:var(--good);font-weight:900}
.mt-t.pic .fix{position:absolute;left:6px;right:6px;bottom:6px;background:#fff;border-radius:6px;padding:1px 4px;border:2px solid var(--ink)}
.mt-foot{display:flex;justify-content:center;gap:10px;align-items:center}
.mt-foot .btn{min-width:150px}
.mt-tip{font-size:13px;color:var(--ink-3);text-align:center}
.play.kids .mt-t{min-height:64px;font-size:19px}
.play.kids .mt-t img{height:96px}
@media (orientation:landscape) and (max-height:520px){
 .mt{flex-direction:row;gap:14px}.mt-head{flex:0 0 26%;display:flex;flex-direction:column;justify-content:center;gap:10px}
 .mt-cols{flex:1}.mt-t{min-height:42px;font-size:14px;padding:4px 8px}.mt-t img{height:50px}.mt-col{gap:6px}
 .mt-cols.pics .mt-col.l{display:grid;grid-template-columns:1fr 1fr;gap:6px}.mt-cols.pics .mt-col.l h3{grid-column:1/-1}
}
@media (min-width:900px) and (min-height:560px){.mt-cols{gap:12px 28px}.mt-t{min-height:60px;font-size:18px}.mt-t img{height:100px}}
`;

const COLORS = ['#ffd5d5', '#c9f2e6', '#ffe7a6', '#ddd4ff', '#cfe8ff', '#ffd6ef'];
const DOTS = ['#ff5d5d', '#22c3a0', '#ffc23c', '#7b61ff', '#3da5ff', '#ff7ac6'];

function factSources(pack) {
  const items = pack.items || [];
  const out = [];
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if (m.hard) continue;
    const has = items.filter(it => it.facts?.[key] != null && !Array.isArray(it.facts[key]));
    if (has.length < 6) continue;
    if (m.type === 'cat' && m.exclusive !== false) out.push([key, 'cat']);
    else if (m.type === 'text') {
      const txt = has.map(it => String(it.facts[key]));
      if (txt.filter(t => t.length > 30 || norm(t).length < 2 || /[,;/]| and | or /.test(t)).length / txt.length < 0.15) out.push([key, 'text']);
    } else if (m.type === 'year') out.push([key, 'year']);
  }
  return out;
}

function make(rng, pack, src, n, decoys, difficulty) {
  const all = poolItems([pack]);
  if (src === 'img') {
    const pool = uniqueByName(byDifficulty(all.filter(c => hasImg(c.item)), difficulty, n + 2, c => c.item.difficulty || 2));
    if (pool.length < n) return null;
    const chosen = shuffle(rng, pool).slice(0, n);
    const extra = decoys ? shuffle(rng, uniqueByName(all).filter(c => !chosen.some(x => norm(x.item.name) === norm(c.item.name)))).slice(0, 2) : [];
    const right = shuffle(rng, [...chosen, ...extra].map(c => c.item.name));
    return {
      format: 'match', id: `match:img:${chosen.map(c => c.ref).sort().join(',')}`,
      prompt: pack.matchImgPrompt || 'Match each picture to its name',
      answer: chosen.map(c => right.indexOf(c.item.name)), answerText: chosen.map(c => c.item.name).join(' · '),
      refs: chosen.map(c => c.ref), pack: pack.id,
      data: { left: chosen.map(c => ({ text: c.item.name, img: imageOf(c.item, rng) })), right: right.map(text => ({ text })), multi: false, pics: true, heads: ['Picture', 'Name'] },
    };
  }
  const [key, type] = src;
  const meta = pack.factsMeta[key];
  const val = c => (c.item.facts?.[key] == null || Array.isArray(c.item.facts[key]) || norm(fmtFact(meta, c.item.facts[key])).length < 2 ? null : fmtFact(meta, c.item.facts[key]));
  const pool = uniqueByName(byDifficulty(all.filter(c => val(c) != null), difficulty, n + 2, c => c.item.difficulty || 2));
  const multi = type === 'cat';
  let chosen = [];
  if (multi) {
    // repeats allowed: several prompts can share one answer, but at least 3 different answers
    chosen = shuffle(rng, pool).slice(0, n);
    if (new Set(chosen.map(val)).size < Math.min(3, n)) return null;
  } else {
    const seen = new Set();
    for (const c of shuffle(rng, pool)) { const v = norm(val(c)); if (!seen.has(v)) { seen.add(v); chosen.push(c); } if (chosen.length >= n) break; }
  }
  if (chosen.length < n) return null;
  const truth = [...new Set(chosen.map(val))];
  if (new Set(truth.map(norm)).size !== truth.length) return null;
  const others = [...new Map(all.map(val).filter(v => v != null && !truth.some(t => norm(t) === norm(v))).map(v => [norm(v), v])).values()];
  const extra = decoys ? shuffle(rng, others).slice(0, multi ? 1 : 2) : [];
  const right = type === 'year' ? [...truth, ...extra].sort() : shuffle(rng, [...truth, ...extra]);
  const label = String(meta.label || key).toLowerCase();
  return {
    format: 'match', id: `match:${key}:${chosen.map(c => c.ref).sort().join(',')}`,
    prompt: meta.matchPrompt || `Match each one to its ${label}`,
    answer: chosen.map(c => right.indexOf(val(c))), answerText: chosen.map(c => `${c.item.name}: ${val(c)}`).join(' · '),
    refs: chosen.map(c => c.ref), pack: pack.id,
    data: { left: chosen.map(c => ({ text: c.item.name })), right: right.map(text => ({ text })), multi, pics: false, heads: [pack.title, meta.label || key] },
  };
}

const PAIRS = [4, 5, 6];

export default register({
  id: 'match', title: 'Matching board', icon: '🔗', blurb: 'Pair them all up', tags: ['slow'], kids: true,
  options: [
    { key: 'pairs', label: 'Pairs', type: 'choice', values: PAIRS, default: 5, kidsValues: [4], kidsDefault: 4 },
    { key: 'decoys', label: 'Decoy answers', type: 'bool', default: true, kidsHide: true },
  ],
  supports(info) {
    const c = info.caps || {};
    if ((c.img || 0) >= 6 && info.items >= 6) return true;
    const multi = new Set(c.multi || []);
    if (info.items >= 6 && Object.entries(c.facts || {}).some(([k, t]) => (t === 'cat' && !multi.has(k)) || t === 'text' || t === 'year')) return true;
    return 'Needs pictures or facts to pair up';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 4 : PAIRS.includes(+opts.pairs) ? +opts.pairs : 5;
    const decoys = !kids && opts.decoys !== false;
    const usable = packs.map(p => {
      const s = factSources(p).map(x => [x, 1]);
      if ((p.items || []).filter(hasImg).length >= n) s.push(['img', kids ? 6 : 2]);
      return { p, s: kids ? s.filter(x => x[0] === 'img') : s };
    }).filter(x => x.s.length);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, s } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + 1));
      const total = s.reduce((a, x) => a + x[1], 0);
      let r = rng() * total, src = s[0][0];
      for (const x of s) { r -= x[1]; if (r < 0) { src = x[0]; break; } }
      return make(rng, p, src, n, decoys, difficulty);
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-match-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data, n = d.left.length;
    const answer = once(api);
    const pairs = new Array(n).fill(-1);
    let sel = null;   // { side: 'l'|'r', i }
    let done = false;
    const tile = (o, side, i) => {
      const t = h('button.mt-t', { type: 'button', class: o.img ? 'pic' : '', style: `--i:${i}`, dataset: { side, i: String(i) } },
        h('span.key', {}, side === 'l' ? String(i + 1) : String.fromCharCode(65 + i)),
        o.img ? imgEl(o.img, { alt: 'Picture ' + (i + 1) }) : null, h('span.lbl', {}, o.text), side === 'r' ? h('span.dots') : null);
      t.addEventListener('click', () => tap(side, i));
      return t;
    };
    const L = d.left.map((o, i) => tile(o, 'l', i)), R = d.right.map((o, i) => tile(o, 'r', i));
    const check = h('button.btn.go', { type: 'button', disabled: true, onclick: () => grade() }, 'Check');
    const tip = h('div.mt-tip', {}, d.multi ? 'Tap one on each side to pair them. Answers can be used more than once.' : 'Tap one on each side to pair them.');
    const head = h('div.mt-head', {}, h('h2.q-prompt', {}, q.prompt), tip);
    el.append(h('div.f-stage.mt', {}, head,
      h('div.mt-cols', { class: d.pics ? 'pics' : '' },
        h('div.mt-col.l', {}, h('h3', {}, d.heads?.[0] || ''), ...L), h('div.mt-col.r', {}, h('h3', {}, d.heads?.[1] || ''), ...R)),
      h('div.mt-foot', {}, check)));
    stretchTimer(api, el, 1 + n * 0.6);

    function draw() {
      L.forEach((t, i) => {
        const r = pairs[i];
        t.classList.toggle('on', r >= 0);
        t.style.setProperty('--c', r >= 0 ? COLORS[i % COLORS.length] : '#fff');
        t.classList.toggle('sel', sel?.side === 'l' && sel.i === i);
      });
      R.forEach((t, j) => {
        const owners = pairs.map((r, i) => (r === j ? i : -1)).filter(i => i >= 0);
        t.classList.toggle('on', owners.length > 0);
        t.style.setProperty('--c', owners.length === 1 ? COLORS[owners[0] % COLORS.length] : owners.length ? '#f4f0ff' : '#fff');
        t.classList.toggle('sel', sel?.side === 'r' && sel.i === j);
        const dots = t.querySelector('.dots');
        dots.innerHTML = '';
        owners.forEach(i => { const e = document.createElement('i'); e.style.setProperty('--d', DOTS[i % DOTS.length]); dots.append(e); });
      });
      L.forEach((t, i) => t.querySelector('.key').style.background = pairs[i] >= 0 ? DOTS[i % DOTS.length] : '');
      check.disabled = pairs.some(r => r < 0) || done;
    }
    function link(i, j) {
      if (!d.multi) pairs.forEach((r, k) => { if (r === j) pairs[k] = -1; });
      pairs[i] = j;
      sel = null;
      api.sfx('button');
      L[i].classList.remove('f-pop'); void L[i].offsetWidth; L[i].classList.add('f-pop');
      draw();
      if (api.kids && pairs.every(r => r >= 0)) setTimeout(grade, 350);
    }
    function tap(side, i) {
      if (done) return;
      if (side === 'l' && pairs[i] >= 0 && !sel) { pairs[i] = -1; sel = { side, i }; draw(); return; }
      if (!sel || sel.side === side) { sel = sel && sel.side === side && sel.i === i ? null : { side, i }; draw(); return; }
      if (side === 'r') link(sel.i, i); else link(i, sel.i);
    }
    function grade() {
      if (done || pairs.some(r => r < 0)) return;
      done = true; sel = null; draw();
      let right = 0;
      L.forEach((t, i) => {
        const good = pairs[i] === q.answer[i];
        if (good) right++;
        t.classList.add(good ? 'ok' : 'bad');
        if (!good) t.append(h('span.fix', {}, '→ ' + d.right[q.answer[i]].text));
      });
      check.disabled = true;
      const all = right === n;
      answer(all ? { correct: true, given: pairs.slice() } : { correct: false, partial: right > 0, points: Math.round(100 * right / n), given: pairs.slice(), detail: `${right}/${n}` });
      if (!all) api.reveal(`<b>${right} of ${n}</b> pairs right.`);
    }
    const onKey = e => {
      if (done || /input|textarea/i.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      const num = parseInt(k, 10);
      if (num >= 1 && num <= n) { e.preventDefault(); tap('l', num - 1); }
      else if (k.length === 1 && k >= 'a' && k.charCodeAt(0) - 97 < R.length) { e.preventDefault(); tap('r', k.charCodeAt(0) - 97); }
      else if (k === 'enter' && !check.disabled) { e.preventDefault(); e.stopPropagation(); grade(); }
    };
    document.addEventListener('keydown', onKey, true);
    draw();
    return {
      destroy() { document.removeEventListener('keydown', onKey, true); },
      timeout() {
        if (done) return;
        done = true;
        L.forEach((t, i) => { t.classList.add(pairs[i] === q.answer[i] ? 'ok' : 'bad'); if (pairs[i] !== q.answer[i]) t.append(h('span.fix', {}, '→ ' + d.right[q.answer[i]].text)); });
      },
      choose(x) {
        const wrong = x === 'wrong';
        q.answer.forEach((j, i) => { pairs[i] = wrong && i === 0 ? (j + 1) % R.length : j; });
        draw(); grade();
      },
    };
  },
});
