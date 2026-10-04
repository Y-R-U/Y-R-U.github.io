import { register, poolItems, pickPack, byDifficulty, imageOf, collect, pick } from './registry.js?v=1';
import { h, mediaBox } from '../ui/kit.js?v=1';
import { numericKeys, numOf, rangeOf, injectCSS, baseCSS, stretchTimer, once, hasImg } from './fkit.js?v=1';

const CSS = `
.nb{gap:12px}
.nb-media{flex:0 1 26vh;min-height:110px}
.nb-media .q-media{height:100%;min-height:0}
.nb-read{display:flex;align-items:baseline;justify-content:center;gap:8px;font-family:var(--font-display);font-size:clamp(34px,10vw,48px);line-height:1;padding:8px 12px;background:#fff;border:var(--line) solid var(--ink);border-radius:var(--r);box-shadow:var(--shadow);min-height:66px}
.nb-read small{font-family:var(--font);font-weight:900;font-size:16px;color:var(--ink-2)}
.nb-read.locked{background:#f4f0ff}
.nb-slider{width:100%;height:40px}
.nb-ends{display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:var(--ink-3);margin-top:-8px}
.nb-pad{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.nb-pad button{min-height:44px;border:2px solid var(--ink);border-radius:12px;background:#fff;font-weight:900;font-size:19px;box-shadow:0 2px 0 var(--ink)}
.nb-pad button:active{transform:translateY(2px);box-shadow:none}
.nb-go{width:100%}
.nb-scale{position:relative;height:56px;margin:4px 8px 0}
.nb-scale .bar{position:absolute;left:0;right:0;top:26px;height:6px;border-radius:9px;background:#e7e2fb}
.nb-scale .mk{position:absolute;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;font-size:12px;font-weight:900;white-space:nowrap;transition:left .6s cubic-bezier(.2,1.2,.4,1)}
.nb-scale .mk i{width:16px;height:16px;border-radius:50%;border:3px solid var(--ink);margin-top:18px;background:var(--grape)}
.nb-scale .mk.t i{background:var(--good)}
.nb-scale .mk span{position:absolute;top:0}
.nb-scale .mk.t span{top:auto;bottom:-14px}
@media (orientation:landscape) and (max-height:520px){
 .nb{display:grid;grid-template-columns:1fr 1fr;column-gap:16px;align-content:center}
 .nb .q-prompt{grid-column:1}.nb-media{grid-column:1;min-height:0;max-height:34vh}
 .nb-right{grid-column:2;grid-row:1/4;display:flex;flex-direction:column;gap:8px}
 .nb-read{font-size:30px;min-height:48px;padding:4px 10px}.nb-pad button{min-height:34px;font-size:16px}
}
@media (min-width:900px) and (min-height:560px){.nb{max-width:620px}.nb-pad button{min-height:50px}}
`;

const PASSIVE = /^(released|born|built|founded|discovered|first published|published|painted|completed|opened|written|launched|formed|invented)$/i;
function askFor(meta, name) {
  const l = String(meta.label || '').trim();
  if (meta.askNumber) return meta.askNumber.replace(/\{name\}/g, name);
  if (meta.type === 'year') {
    if (/^died$/i.test(l)) return `In what year did ${name} die?`;
    if (PASSIVE.test(l)) return `In what year was ${name} ${l.toLowerCase()}?`;
    return `${name}: ${l.toLowerCase()} (year)?`;
  }
  if (/\b(using|by|in|of|per)\b/i.test(l)) return `${name}: ${l.toLowerCase()}?`;
  return `What is the ${l.toLowerCase()} of ${name}?`;
}

const BIG = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
export function pretty(v, unit = '', year = false) {
  if (year) return v < 0 ? `${-v} BC` : String(Math.round(v));
  const a = Math.abs(v);
  let s;
  const big = BIG.find(([n]) => a >= n);
  if (big) s = `${+(v / big[0]).toPrecision(3)} ${big[1]}`;
  else if (a >= 1000) s = Math.round(v).toLocaleString('en-GB');
  else s = String(+v.toPrecision(3));
  if (unit === 'USD') return `$${s}`;
  return unit ? `${s} ${unit}` : s;
}

// closeness → points, and whether it counts as right
export function scoreGuess(g, t, d) {
  if (!isFinite(g)) return { correct: false, points: 0, off: Infinity };
  const lvl = d.level || 0;
  if (d.tolerance != null) {
    const err = Math.abs(g - t), tol = Math.max(d.tolerance, 1e-9);
    return { correct: err <= tol, points: Math.round(500 * Math.max(0, 1 - err / (tol * 10))), off: err };
  }
  if (d.year) {
    const err = Math.abs(g - t);
    const tol = [3, 5, 3, 1][lvl], span = [40, 60, 40, 20][lvl];
    return { correct: err <= tol, points: err <= tol ? Math.round(500 - 200 * err / Math.max(1, tol)) : Math.round(300 * Math.max(0, 1 - err / span)), off: err };
  }
  if (d.linear) {
    const err = Math.abs(g - t), span = d.max - d.min || 1;
    const tol = [0.04, 0.08, 0.04, 0.02][lvl] * span;
    return { correct: err <= tol, points: err <= tol ? Math.round(500 - 200 * err / tol) : Math.round(300 * Math.max(0, 1 - err / (span * 0.4))), off: err };
  }
  if (g <= 0 || t <= 0) return { correct: g === t, points: g === t ? 500 : 0, off: Math.abs(g - t) };
  const err = Math.abs(Math.log(g / t));
  const tol = Math.log(1 + [0.15, 0.25, 0.15, 0.07][lvl]);
  return { correct: err <= tol, points: err <= tol ? Math.round(500 - 200 * err / tol) : Math.round(300 * Math.max(0, 1 - err / Math.log(4))), off: Math.abs(g - t) };
}

function scaleFor(meta, range, t) {
  const year = meta.type === 'year';
  let { min, max } = range;
  if (year) return { year: true, min: Math.floor((min - 15) / 10) * 10, max: Math.min(new Date().getFullYear(), Math.ceil((max + 10) / 10) * 10), log: false };
  if (min > 0 && max / min > 30) return { min: min / 2, max: max * 2, log: true };
  const pad = (max - min) * 0.15 || Math.abs(t) * 0.5 || 1;
  return { min: min > 0 ? Math.max(0, min - pad) : min - pad, max: max + pad, log: false, linear: min <= 0 };
}

function make(rng, pack, key, difficulty) {
  const meta = pack.factsMeta[key];
  const pool = byDifficulty(poolItems([pack]).filter(c => numOf(c.item, key) != null), difficulty, 4, c => c.item.difficulty || 2);
  if (!pool.length) return null;
  const t = pick(rng, pool);
  const v = numOf(t.item, key);
  const range = rangeOf(pack, key);
  if (!(range.max > range.min)) return null;
  const sc = scaleFor(meta, range, v);
  const unit = meta.type === 'year' ? '' : meta.unit || '';
  return {
    format: 'number', id: `number:${key}:${t.ref}`, prompt: askFor(meta, t.item.name),
    media: meta.showImg && hasImg(t.item) ? { img: [imageOf(t.item, rng)] } : undefined,
    answer: v, answerText: pretty(v, unit, sc.year), explain: t.item.blurb, refs: [t.ref], pack: pack.id,
    data: { ...sc, unit, level: difficulty, label: meta.label || key },
  };
}

function fromQuestion(rng, pack, difficulty) {
  const qs = byDifficulty((pack.questions || []).filter(q => q.kind === 'number' && isFinite(Number(q.answer))), difficulty, 1);
  if (!qs.length) return null;
  const q = pick(rng, qs);
  const v = Number(q.answer);
  const year = /year/i.test(q.unit || '') || (Number.isInteger(v) && v > 1000 && v <= 2100 && !q.unit);
  const span = q.min != null && q.max != null ? { min: q.min, max: q.max } : year ? { min: Math.floor((v - 200) / 50) * 50, max: Math.min(2026, Math.ceil((v + 120) / 50) * 50) } : v > 0 ? { min: v / 10, max: v * 10 } : { min: v - 100, max: v + 100 };
  return {
    format: 'number', id: `number:${pack.id}/q:${q.id}`, prompt: q.prompt, media: q.media && Object.keys(q.media).length ? q.media : undefined,
    answer: v, answerText: pretty(v, year ? '' : q.unit || '', year), explain: q.explain, refs: [`${pack.id}/q:${q.id}`], pack: pack.id,
    data: { ...span, year, log: !year && span.min > 0 && span.max / span.min > 30, unit: year ? '' : q.unit || '', tolerance: q.tolerance ?? null, level: difficulty },
  };
}

export default register({
  id: 'number', title: 'Closest guess', icon: '🎯', blurb: 'How big? What year? Get close', tags: [],
  options: [],
  supports(info) {
    const c = info.caps || {};
    if ((c.qkinds?.number || 0) > 0) return true;
    return Object.values(c.facts || {}).some(t => t === 'num' || t === 'year') && info.items >= 4 ? true : 'Needs number or year facts';
  },
  generate({ rng, packs, count, difficulty = 0, avoid }) {
    const usable = packs.map(p => ({ p, keys: numericKeys(p), qs: (p.questions || []).some(q => q.kind === 'number') })).filter(x => x.keys.length || x.qs);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, keys, qs } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + 1));
      if (qs && (!keys.length || rng() < 0.5)) return fromQuestion(rng, p, difficulty);
      return make(rng, p, pick(rng, keys), difficulty);
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-number-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data;
    const answer = once(api);
    const STEPS = 1000;
    const toVal = s => {
      const k = s / STEPS;
      const v = d.log ? Math.exp(Math.log(d.min) + k * (Math.log(d.max) - Math.log(d.min))) : d.min + k * (d.max - d.min);
      return round(v);
    };
    const toPos = v => {
      const k = d.log ? (Math.log(Math.max(d.min, v)) - Math.log(d.min)) / (Math.log(d.max) - Math.log(d.min)) : (v - d.min) / (d.max - d.min);
      return Math.round(Math.max(0, Math.min(1, k)) * STEPS);
    };
    const round = v => (d.year ? Math.round(v) : Math.abs(v) >= 100 ? Number(v.toPrecision(3)) : Number(v.toPrecision(2)));
    let value = round(d.log ? Math.sqrt(d.min * d.max) : (d.min + d.max) / 2), typed = '', locked = false;
    const read = h('div.nb-read', {}, h('span'), h('small', {}, d.unit === 'USD' ? '' : d.unit || ''));
    const slider = h('input.nb-slider', { type: 'range', min: 0, max: STEPS, step: 1, value: toPos(value), 'aria-label': 'Your guess' });
    slider.addEventListener('input', () => { typed = ''; value = toVal(+slider.value); draw(); });
    const pad = h('div.nb-pad');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', d.year || Number.isInteger(q.answer) ? (d.min < 0 ? '−' : '00') : '.', '⌫'];
    for (const k of keys) pad.append(h('button', { type: 'button', onclick: () => key(k) }, k));
    const go = h('button.btn.go.nb-go', { type: 'button', onclick: () => lock() }, 'Lock it in');
    const media = q.media ? h('div.nb-media', {}, mediaBox(q.media)) : null;
    el.append(h('div.f-stage.nb', {}, h('h2.q-prompt', {}, q.prompt), media,
      h('div.nb-right', {}, read, slider, h('div.nb-ends', {}, h('span', {}, pretty(d.min, d.unit === 'USD' ? 'USD' : '', d.year)), h('span', {}, pretty(d.max, d.unit === 'USD' ? 'USD' : '', d.year))), pad, go)));
    stretchTimer(api, el, 2);
    function draw() {
      read.firstChild.textContent = typed ? (d.unit === 'USD' ? '$' : '') + typed.replace('-', '−') : d.year ? pretty(value, '', true) : pretty(value, d.unit === 'USD' ? 'USD' : '');
    }
    function key(k) {
      if (locked) return;
      if (k === '⌫') typed = typed.slice(0, -1);
      else if (k === '−') typed = typed.startsWith('-') ? typed.slice(1) : '-' + typed;
      else if (k === '.' && typed.includes('.')) return;
      else if (typed.replace(/[-.]/g, '').length < 15) typed += k;
      const v = parseFloat(typed);
      if (isFinite(v)) { value = v; slider.value = String(toPos(v)); }
      api.sfx('button');
      draw();
    }
    function lock() {
      if (locked) return;
      locked = true;
      slider.disabled = true; go.disabled = true;
      pad.querySelectorAll('button').forEach(b => { b.disabled = true; });
      read.classList.add('locked');
      const s = scoreGuess(value, q.answer, d);
      showScale();
      const off = d.year ? `${s.off} ${s.off === 1 ? 'year' : 'years'}` : pretty(s.off, d.unit, false);
      api.reveal(`You said <b>${pretty(value, d.unit, d.year)}</b>${s.off ? `, off by ${off}` : ': spot on!'}${!s.correct && s.points ? ` <b>+${s.points}</b> for being close` : ''}`);
      answer(s.correct ? { correct: true, points: s.points, given: value } : { correct: false, partial: s.points > 0, points: s.points, given: value });
    }
    function showScale() {
      const pos = v => `${(toPos(v) / STEPS) * 100}%`;
      const sc = h('div.nb-scale', {}, h('div.bar'),
        h('div.mk.g', { style: { left: pos(value) } }, h('span', {}, 'You'), h('i')),
        h('div.mk.t', { style: { left: pos(q.answer) } }, h('i'), h('span', {}, pretty(q.answer, d.unit, d.year))));
      slider.replaceWith(sc);
    }
    const onKey = e => {
      if (locked || /input|textarea/i.test(e.target.tagName)) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); key(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); key('⌫'); }
      else if (e.key === '.' || e.key === '-') { e.preventDefault(); key(e.key === '-' ? '−' : '.'); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); lock(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { slider.value = String(+slider.value + 10); slider.dispatchEvent(new Event('input')); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { slider.value = String(+slider.value - 10); slider.dispatchEvent(new Event('input')); }
    };
    document.addEventListener('keydown', onKey, true);
    draw();
    return {
      destroy() { document.removeEventListener('keydown', onKey, true); },
      timeout() { if (!locked) { locked = true; slider.disabled = true; go.disabled = true; showScale(); } },
      choose(x) {
        value = x === 'correct' ? q.answer : x === 'wrong' ? (d.year ? q.answer + 100 : q.answer * 20 + 1000) : Number(x);
        typed = ''; draw(); lock();
      },
    };
  },
});
