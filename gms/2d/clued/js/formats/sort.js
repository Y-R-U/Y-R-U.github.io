import { register, poolItems, pickPack, byDifficulty, imageOf, factText, collect, pick, shuffle, sample, factAllowed, lcLabel, factHeading, valueText } from './registry.js?v=202610081215';
import { h, imgEl } from '../ui/kit.js?v=202610081215';
import { norm, uniqueByName, injectCSS, baseCSS, once, drag, hasImg } from './fkit.js?v=202610081215';

const CSS = `
.so{gap:10px}
.so-top{display:flex;justify-content:space-between;align-items:center;font-weight:900;color:var(--ink-2)}
.so-dots{display:flex;gap:4px;flex-wrap:wrap}
.so-dots i{width:12px;height:12px;border-radius:50%;border:2px solid var(--ink);background:#fff}
.so-dots i.ok{background:var(--good)}.so-dots i.bad{background:var(--bad)}
.so-deck{position:relative;flex:1 1 auto;min-height:190px;display:grid;place-items:center}
.so-card{position:absolute;width:min(78%,300px);display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:10px;background:#fff;border:var(--line) solid var(--ink);border-radius:22px;box-shadow:var(--shadow);text-align:center;font-family:var(--font-display);font-size:24px;line-height:1.1;touch-action:none;user-select:none;cursor:grab;transition:transform .32s cubic-bezier(.3,1.2,.5,1),opacity .3s}
.so-card img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;border:2px solid var(--ink);background:#eee}
.so-card.text{padding:28px 14px}
.so-card.next{transform:translateY(10px) scale(.94);opacity:.6;pointer-events:none;filter:saturate(.6)}
.so-card.dragging{transition:none;cursor:grabbing}
.so-card.gone,.so-card.flown{opacity:0;pointer-events:none}
.so-card .so-mark{position:absolute;top:-14px;right:-10px;width:42px;height:42px;border-radius:50%;border:var(--line) solid var(--ink);display:grid;place-items:center;color:#fff;font-size:22px;font-family:var(--font)}
.so-bins{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:10px}
.so-bin{--c:var(--sky);position:relative;min-height:74px;padding:8px;border:var(--line) solid var(--ink);border-radius:18px;background:color-mix(in srgb,var(--c) 22%,#fff);box-shadow:var(--shadow);font-weight:900;font-size:17px;line-height:1.1;transition:transform .12s,background .2s}
.so-bin:nth-child(2){--c:var(--coral)}.so-bin:nth-child(3){--c:var(--sun)}.so-bin:nth-child(4){--c:var(--mint)}
.so-bin .k{position:absolute;top:5px;left:7px;font-size:11px;color:var(--ink-2)}
.so-bin .cnt{display:block;font-size:13px;color:var(--ink-2);margin-top:2px}
.so-bin.hot{transform:scale(1.06);background:color-mix(in srgb,var(--c) 45%,#fff)}
.so-bin.good{animation:f-pop .45s;background:#c9f5d8}
.so-bin.bad{animation:shake .4s;background:#ffd6d6}
.so-bin.right{box-shadow:0 0 0 4px var(--good),var(--shadow)}
.so-hint{text-align:center;font-size:13px;color:var(--ink-3);min-height:18px}
.play.kids .so-bin.bad{background:#fff1c4;animation:wobble .5s}
.play.kids .so-bin{min-height:90px;font-size:20px}
@media (orientation:landscape) and (max-height:520px){
 .so{display:grid;grid-template-columns:1fr 1.2fr;grid-template-rows:auto 1fr auto;column-gap:16px}
 .so .q-prompt{grid-column:1;grid-row:1}.so-top{grid-column:1;grid-row:3}.so-deck{grid-column:2;grid-row:1/4;min-height:0}
 .so-bins{grid-column:1;grid-row:2;align-self:center}.so-hint{display:none}
 .so-card{width:min(70%,260px);font-size:19px}.so-card img{aspect-ratio:16/10}.so-card.text{padding:18px 10px}
}
@media (min-width:900px) and (min-height:560px){.so-deck{min-height:300px}.so-card{width:320px}}
`;

function sources(pack, bins, gate) {
  const items = pack.items || [];
  const out = [];
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if (m.hard || !factAllowed(m, gate)) continue;
    const has = items.filter(it => it.facts?.[key] != null);
    if (m.type === 'bool' && has.filter(it => it.facts[key] === true).length >= 2 && has.filter(it => it.facts[key] === false).length >= 2) out.push(['bool', key]);
    if (m.type === 'cat' && m.exclusive !== false) {
      const counts = {};
      for (const it of has) if (!Array.isArray(it.facts[key])) counts[it.facts[key]] = (counts[it.facts[key]] || 0) + 1;
      if (Object.values(counts).filter(c => c >= 2).length >= bins) out.push(['cat', key]);
    }
  }
  if ((pack.fakes || []).length >= 3 && items.length >= 4) out.push(['fake', '']);
  return out;
}

// "A or B?", but "A / B / C" when a bin name has its own "or" ("1900s or later")
const binList = b => (b.some(x => /\bor\b/i.test(x)) ? b.join(' / ') : `${b.slice(0, -1).join(', ')} or ${b.at(-1)}?`);

function make(rng, pack, [type, key], cards, bins, difficulty, kids) {
  const pool = uniqueByName(byDifficulty(poolItems([pack]), difficulty, cards + 2, c => c.item.difficulty || 2));
  let binNames, deck, prompt;
  if (type === 'fake') {
    const real = new Set((pack.items || []).flatMap(it => [it.name, ...(it.alt || [])]).map(norm));
    const fakes = [...new Set(pack.fakes)].filter(f => !real.has(norm(f)));
    const nf = Math.min(fakes.length, Math.max(2, Math.floor(cards * (0.3 + rng() * 0.25))));
    if (nf < 2) return null;
    deck = [...sample(rng, pool, cards - nf).map(c => ({ c, bin: 0 })), ...sample(rng, fakes, nf).map(f => ({ fake: f, bin: 1 }))];
    binNames = ['Real', 'Made up'];
    prompt = 'Real or made up?';
  } else if (type === 'bool') {
    const meta = pack.factsMeta[key];
    const yes = pool.filter(c => c.item.facts?.[key] === true), no = pool.filter(c => c.item.facts?.[key] === false);
    const ny = Math.max(2, Math.min(yes.length, Math.round(cards / 2 + (rng() - 0.5) * 2)));
    if (yes.length < 2 || no.length < cards - ny) return null;
    deck = [...sample(rng, yes, ny).map(c => ({ c, bin: 0 })), ...sample(rng, no, cards - ny).map(c => ({ c, bin: 1 }))];
    binNames = [factText(meta, true), factText(meta, false)];
    prompt = `Sort them: ${binList(binNames.map(lcLabel))}`;
  } else {
    const meta = pack.factsMeta[key];
    const has = pool.filter(c => c.item.facts?.[key] != null && !Array.isArray(c.item.facts[key]));
    const counts = {};
    for (const c of has) counts[c.item.facts[key]] = (counts[c.item.facts[key]] || 0) + 1;
    const ok = Object.keys(counts).filter(v => counts[v] >= 2).sort();
    if (ok.length < bins) return null;
    const ordered = meta.values ? meta.values.filter(v => ok.includes(v)) : ok;
    const vals = shuffle(rng, ordered).slice(0, bins);
    const chosen = meta.values ? ordered.filter(v => vals.includes(v)) : vals;
    deck = [];
    const per = Math.floor(cards / bins);
    chosen.forEach((v, b) => deck.push(...sample(rng, has.filter(c => c.item.facts[key] === v), b < cards % bins ? per + 1 : per).map(c => ({ c, bin: b }))));
    if (deck.length < cards - 1) return null;
    binNames = chosen.map(v => { const t = String(valueText(meta, v)); return t.charAt(0).toUpperCase() + t.slice(1); });
    prompt = `${factHeading(meta, key) || 'Sort them'}: ${binList(binNames)}`;
  }
  deck = shuffle(rng, deck);
  const pics = type !== 'fake' && deck.every(x => hasImg(x.c.item)) && (kids || rng() < 0.6);
  return {
    format: 'sort', id: `sort:${type}:${key}:${deck.map(x => x.c ? x.c.ref : norm(x.fake)).sort().join(',')}`,
    prompt, answer: deck.map(x => x.bin), answerText: binNames.map((b, i) => `${b}: ${deck.filter(x => x.bin === i).map(x => x.c ? x.c.item.name : x.fake).join(', ')}`).join(' · '),
    refs: deck.filter(x => x.c).map(x => x.c.ref), pack: pack.id,
    data: { bins: binNames, cards: deck.map(x => (x.c ? { text: x.c.item.name, img: pics ? imageOf(x.c.item, rng) : undefined } : { text: x.fake })) },
  };
}

const CARDS = [6, 8, 10];

export default register({
  id: 'sort', revealInline: true, title: 'Sort into bins', icon: '🗂️', blurb: 'Swipe each one into the right bin', tags: ['slow', 'kids'], kids: true, timeScale: q => 1 + q.data.cards.length * 0.35,
  options: [
    { key: 'cards', label: 'Cards', type: 'choice', values: CARDS, default: 8, kidsValues: [6], kidsDefault: 6 },
    { key: 'bins', label: 'Bins', type: 'choice', values: [2, 3], default: 2, kidsHide: true },
  ],
  supports(info) {
    const c = info.caps || {};
    const multi = new Set(c.multi || []);
    if ((c.fakes || 0) >= 3 || Object.entries(c.facts || {}).some(([k, t]) => t === 'bool' || (t === 'cat' && !multi.has(k)))) return info.items >= 6 ? true : 'Needs more items';
    return 'Needs yes/no or category facts';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const cards = kids ? 6 : CARDS.includes(+opts.cards) ? +opts.cards : 8;
    const bins = kids ? 2 : +opts.bins === 3 ? 3 : 2;
    const usable = packs.map(p => ({ p, s: sources(p, bins, { kids, difficulty }).filter(s => !(kids && s[0] === 'fake')) })).filter(x => x.s.length && (x.p.items || []).length >= cards);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, s } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + 1));
      return make(rng, p, pick(rng, s), cards, bins, difficulty, kids);
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-sort-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data, N = d.cards.length;
    const answer = once(api);
    const given = [];
    let k = 0, busy = false, done = false;
    const dots = h('div.so-dots', {}, ...d.cards.map(() => h('i')));
    const counter = h('span', {}, `1 / ${N}`);
    const deck = h('div.so-deck');
    const bins = d.bins.map((b, i) => h('button.so-bin', { type: 'button', onclick: () => put(i) }, h('span.k', {}, d.bins.length === 2 ? (i ? '→' : '←') : String(i + 1)), b, h('span.cnt', {}, '')));
    const hint = h('div.so-hint', {}, d.bins.length === 2 ? 'Swipe left or right, or tap a bin' : 'Drag to a bin, or tap one');
    el.append(h('div.f-stage.so', {}, h('h2.q-prompt', {}, q.prompt), h('div.so-top', {}, counter, dots), deck,
      h('div.so-bins', { style: `--n:${d.bins.length}` }, ...bins), hint));
    const cardEls = d.cards.map((c, i) => {
      const e = h('div.so-card', { class: c.img ? '' : 'text' }, c.img ? imgEl(c.img, { alt: c.text }) : null, h('span', {}, c.text));
      e.style.zIndex = String(N - i);
      return e;
    });
    deck.append(...cardEls.slice().reverse());
    let offDrag = () => {};
    function setup() {
      cardEls.forEach((e, i) => { e.classList.toggle('next', i === k + 1); e.classList.toggle('gone', i > k + 1 && !e.classList.contains('flown')); });
      counter.textContent = `${Math.min(k + 1, N)} / ${N}`;
      offDrag();
      const e = cardEls[k];
      if (!e) return;
      e.classList.remove('next', 'gone');
      offDrag = drag(e, {
        onStart() { e.classList.add('dragging'); },
        onMove(ev, dx, dy) { e.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 14}deg)`; hot(binAt(ev, dx)); },
        onEnd(ev, dx) {
          e.classList.remove('dragging');
          const b = binAt(ev, dx);
          hot(-1);
          if (b >= 0) put(b); else e.style.transform = '';
        },
      });
    }
    function binAt(ev, dx) {
      for (let i = 0; i < bins.length; i++) {
        const r = bins[i].getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 20 && ev.clientY <= r.bottom + 20) return i;
      }
      if (bins.length === 2 && Math.abs(dx) > 70) return dx < 0 ? 0 : 1;
      return -1;
    }
    function hot(b) { bins.forEach((x, i) => x.classList.toggle('hot', i === b)); }
    function put(b) {
      if (busy || done || k >= N) return;
      busy = true;
      const e = cardEls[k], right = q.answer[k];
      given.push(b);
      const ok = b === right;
      const br = bins[b].getBoundingClientRect(), cr = e.getBoundingClientRect();
      e.style.transform = `translate(${br.left + br.width / 2 - (cr.left + cr.width / 2)}px,${br.top - cr.top}px) scale(.25) rotate(${(b - 0.5) * 20}deg)`;
      e.style.opacity = '0';
      e.classList.add('flown');
      bins[b].classList.remove('good', 'bad'); void bins[b].offsetWidth;
      bins[b].classList.add(ok ? 'good' : 'bad');
      if (!ok) { bins[right].classList.add('right'); hint.textContent = `${d.cards[k].text}: ${d.bins[right]}`; }
      else hint.textContent = '';
      dots.children[k].classList.add(ok ? 'ok' : 'bad');
      bins[b].querySelector('.cnt').textContent = String(given.filter(x => x === b).length);
      api.sfx(ok ? 'button' : 'wrong');
      if (api.haptic) api.haptic(ok ? 'tap' : 'wrong');
      k++;
      setTimeout(() => {
        busy = false;
        bins.forEach(x => x.classList.remove('right'));
        if (k >= N) finish(); else setup();
      }, ok ? 260 : 900);
    }
    function finish() {
      if (done) return;
      done = true;
      const right = given.filter((b, i) => b === q.answer[i]).length;
      const misses = given.map((b, i) => (b !== q.answer[i] ? `${d.cards[i].text} → ${d.bins[q.answer[i]]}` : null)).filter(Boolean);
      if (misses.length) api.reveal(`<b>${right} of ${N}</b> sorted right.<br><small>${misses.map(m => m.replace(/</g, '&lt;')).join(' · ')}</small>`);
      answer(right === N ? { correct: true, given } : { correct: false, partial: right > 0, points: Math.round(100 * right / N), given, detail: `${right}/${N}` });
    }
    const onKey = e => {
      if (done || /input|textarea/i.test(e.target.tagName)) return;
      if (bins.length === 2 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); put(e.key === 'ArrowLeft' ? 0 : 1); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= bins.length) { e.preventDefault(); e.stopPropagation(); put(n - 1); }
    };
    document.addEventListener('keydown', onKey, true);
    setup();
    return {
      destroy() { offDrag(); document.removeEventListener('keydown', onKey, true); },
      timeout() { done = true; offDrag(); },
      choose(x) {
        const wrong = x === 'wrong';
        const step = () => {
          if (done || k >= N) return;
          if (busy) return setTimeout(step, 60);
          put(wrong && k === 0 ? 1 - Math.min(1, q.answer[k]) : q.answer[k]);
          setTimeout(step, 60);
        };
        step();
      },
    };
  },
});
