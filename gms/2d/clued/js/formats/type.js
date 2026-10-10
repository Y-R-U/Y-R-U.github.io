import { register, poolItems, pickPack, byDifficulty, imageOf, fill, collect, pick, factAllowed } from './registry.js?v=202610100431';
import { h, layout, typeBox } from '../ui/kit.js?v=202610100431';
import { fuzzyMatch, answersFor } from '../core/fuzzy.js?v=202610100431';
import { norm, injectCSS, once, hasImg } from './fkit.js?v=202610100431';

const CSS = `
.ty-pat{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;font-family:var(--font-display);font-size:22px;letter-spacing:4px;color:var(--ink-2)}
.ty-clues{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ty-clues li{background:#fff;border:2px solid var(--ink);border-radius:12px;padding:8px 12px;font-size:17px;box-shadow:var(--shadow-sm)}
.ty-msg{text-align:center;min-height:20px;font-weight:800;color:var(--ink-2);font-size:15px}
.ty-msg.near{color:#c27c00}
.ty-row{display:flex;justify-content:center}
.ty .q-answers{gap:10px;display:flex;flex-direction:column}
@media (orientation:landscape) and (max-height:520px){.ty-pat{font-size:17px}.ty-clues li{font-size:14px;padding:4px 8px}}
`;

const SHORT = s => { const t = String(s ?? '').trim(); return t.length >= 2 && t.length <= 26 && t.split(/\s+/).length <= 4 && norm(t).length >= 2; };
const CONTEXT = /\b(these|following|which of|not|except|true|false)\b/i;

// Facts whose values are bins or scales ("Middle Ages", "1900s or later", "Potentially deadly", "Large") can't be typed:
// nobody would guess the exact label. factsMeta.typeable overrides.
const BIN_KEY = /^(era|century|danger|size|edibility|status|coat|habitat|field|type|age)$/i;
const BIN_VAL = /\d0?s\b|\bor (later|earlier|older)\b|\bto\b|\bcentury\b|ancient|middle ages|deadly|dangerous|harmless|venomous|provoked|\bsting\b|concern|threatened|endangered|vulnerable|deficient/i;
export function typeableFact(key, m, items) {
  if (m.typeable != null) return !!m.typeable;
  if (BIN_KEY.test(key) || /conservation|iucn/i.test(m.label || '')) return false;
  const vals = [...new Set(items.map(it => it.facts?.[key]).filter(v => typeof v === 'string'))];
  if (vals.length < 3) return false;
  return /decade/i.test(key) || !vals.some(v => BIN_VAL.test(v));
}

// Common other names for typed answers ("Great Britain" for the United Kingdom).
const ALIASES = {
  'United Kingdom': ['UK', 'Great Britain', 'Britain', 'GB'], 'United States': ['USA', 'US', 'America', 'United States of America'],
  'Netherlands': ['Holland'], 'Czech Republic': ['Czechia'], 'South Korea': ['Korea'], 'Myanmar': ['Burma'],
  'United Arab Emirates': ['UAE'], 'Democratic Republic of the Congo': ['DR Congo', 'DRC'], 'Eswatini': ['Swaziland'],
  'Türkiye': ['Turkey'], 'Turkey': ['Türkiye'], 'Ivory Coast': ["Côte d'Ivoire"], "Côte d'Ivoire": ['Ivory Coast'],
};
export function withAliases(list) {
  const out = [];
  for (const a of list) {
    out.push(a);
    for (const x of ALIASES[a] || []) out.push(x);
    const dec = /^(1\d|20)(\d0)s$/.exec(a);
    if (dec) out.push(`${dec[2]}s`);
  }
  return [...new Set(out)];
}

function sources(pack, gate) {
  const items = pack.items || [];
  const out = [];
  if (items.filter(it => hasImg(it) && SHORT(it.name)).length >= 4) out.push(['img', 3]);
  if (items.filter(it => (it.clues || []).length >= 3 && SHORT(it.name)).length >= 4) out.push(['clue', 2]);
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if (!m.ask || (m.type !== 'cat' && m.type !== 'text') || m.exclusive === false || !factAllowed(m, gate) || !typeableFact(key, m, items)) continue;
    if (items.filter(it => typeof it.facts?.[key] === 'string' && SHORT(it.facts[key])).length >= 4) out.push([`fact:${key}`, 1.5]);
  }
  if ((pack.questions || []).some(q => (q.kind || 'mc') === 'mc' && SHORT(q.answer) && !CONTEXT.test(q.prompt))) out.push(['q', 1.5]);
  return out;
}

const leaks = (text, names) => names.some(n => norm(n) && ` ${norm(text)} `.includes(` ${norm(n)} `));

function make(rng, pack, kind, difficulty) {
  const all = poolItems([pack]);
  const base = { format: 'type', pack: pack.id };
  if (kind === 'q') {
    const qs = byDifficulty((pack.questions || []).filter(q => (q.kind || 'mc') === 'mc' && SHORT(q.answer) && !CONTEXT.test(q.prompt)), difficulty, 1);
    if (!qs.length) return null;
    const q = pick(rng, qs);
    return { ...base, id: `type:${pack.id}/q:${q.id}`, prompt: q.prompt, media: q.media && Object.keys(q.media).length ? q.media : undefined,
      answer: String(q.answer), answerText: String(q.answer), explain: q.explain, refs: [`${pack.id}/q:${q.id}`],
      data: { accept: withAliases([String(q.answer), ...(q.alt || [])]), level: difficulty } };
  }
  if (kind.startsWith('fact:')) {
    const key = kind.slice(5), meta = pack.factsMeta[key];
    const pool = byDifficulty(all.filter(c => typeof c.item.facts?.[key] === 'string' && SHORT(c.item.facts[key])), difficulty, 4, c => c.item.difficulty || 2);
    const t = pick(rng, pool);
    if (!t) return null;
    const v = t.item.facts[key];
    return { ...base, id: `type:${key}:${t.ref}`, prompt: fill(meta.ask, { name: t.item.name, lname: t.item.lname, label: meta.label }),
      answer: v, answerText: v, explain: t.item.blurb, refs: [t.ref], data: { accept: withAliases([v, ...(meta.alt?.[v] || [])]), level: difficulty } };
  }
  const pool = byDifficulty(all.filter(c => SHORT(c.item.name) && (kind === 'img' ? hasImg(c.item) : (c.item.clues || []).length >= 3)), difficulty, 4, c => c.item.difficulty || 2);
  const t = pick(rng, pool);
  if (!t) return null;
  if (kind === 'img') {
    return { ...base, id: `type:img:${t.ref}`, prompt: fill(t.item.nameImgPrompt || pack.nameImgPrompt || 'Name this', { name: t.item.name }),
      media: { img: [imageOf(t.item, rng)] }, answer: t.item.name, answerText: t.item.name, explain: t.item.blurb, refs: [t.ref],
      data: { accept: answersFor(t.item), level: difficulty } };
  }
  const clues = t.item.clues.filter(c => !leaks(c, answersFor(t.item)) && !/starts with|letters?\)|answer has/i.test(c));
  if (clues.length < 3) return null;
  const shown = clues.slice(-(difficulty === 3 ? 2 : 3));
  return { ...base, id: `type:clue:${t.ref}`, prompt: `Name the ${pack.noun || String(pack.title || 'thing').toLowerCase().replace(/s$/, '')}`,
    answer: t.item.name, answerText: t.item.name, explain: t.item.blurb, refs: [t.ref], data: { accept: answersFor(t.item), clues: shown, level: difficulty } };
}

const pattern = s => String(s).split(/\s+/).map(w => w.replace(/[A-Za-zÀ-ÿ0-9]/g, '_'));

export default register({
  id: 'type', title: 'Type the answer', icon: '⌨️', blurb: 'No options. Typos forgiven.', tags: [], timeScale: 1.8,
  options: [{ key: 'hint', label: 'Letter hints', type: 'choice', values: ['auto', 'off'], labels: ['By difficulty', 'Off'], default: 'auto' }],
  supports(info) {
    const c = info.caps || {};
    if ((c.img || 0) >= 4 || (c.clues || 0) >= 4 || (c.qkinds?.mc ?? info.questions ?? 0) > 0) return true;
    return 'Needs pictures, clues or trivia questions';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const usable = packs.map(p => ({ p, s: sources(p, { kids, difficulty }) })).filter(x => x.s.length);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, s } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + (x.p.questions || []).length + 1));
      const total = s.reduce((a, x) => a + x[1], 0);
      let r = rng() * total, kind = s[0][0];
      for (const x of s) { r -= x[1]; if (r < 0) { kind = x[0]; break; } }
      const q = make(rng, p, kind, difficulty);
      if (q && opts.hint === 'off') q.data.level = 3;
      return q;
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-type-css', CSS);
    const answer = once(api);
    const { answersEl, bodyEl, wrap } = layout(el, { prompt: q.prompt, media: q.media });
    wrap.classList.add('ty');
    const d = q.data;
    if (d.clues) bodyEl.insertBefore(h('ul.ty-clues', {}, ...d.clues.map(c => h('li', {}, c))), answersEl);
    const lvl = d.level || 0;
    if (lvl === 1 || lvl === 0) answersEl.append(h('div.ty-pat', { 'aria-label': 'Letter pattern' }, ...pattern(q.answerText).map(w => h('span', {}, w))));
    else if (lvl === 2) answersEl.append(h('div.ty-pat', {}, `${String(q.answerText).charAt(0).toUpperCase()}…  (${String(q.answerText).replace(/\s/g, '').length} letters)`));
    const msg = h('div.ty-msg');
    let tries = 0;
    const box = typeBox(answersEl, {
      placeholder: 'Type your answer',
      onSubmit(v) {
        const m = fuzzyMatch(v, d.accept);
        if (m.ok) { box.lock(); giveUp.disabled = true; answer({ correct: true, given: v, detail: m.dist ? 'typo' : '' }); if (m.dist) api.reveal(`Accepted “${v.replace(/</g, '&lt;')}” (close enough!)`); return; }
        tries++;
        api.sfx('wrong');
        if (tries >= 2) { box.lock(); giveUp.disabled = true; answer({ correct: false, given: v }); return; }
        msg.textContent = m.best && m.dist <= 3 ? 'So close! One more try.' : 'Not that. One more try.';
        msg.className = 'ty-msg' + (m.best && m.dist <= 3 ? ' near' : '');
        return false;
      },
    });
    const giveUp = h('button.btn.ghost.small', { type: 'button', onclick: () => { box.lock(); giveUp.disabled = true; answer({ correct: false, given: null, detail: 'gave up' }); } }, 'I don’t know');
    answersEl.append(msg, h('div.ty-row', {}, giveUp));
    return {
      destroy() {},
      timeout() { box.lock(); giveUp.disabled = true; },
      hint: () => `It starts with “${String(q.answerText).charAt(0)}”`,
      choose(x) {
        box.input.value = x === 'correct' ? q.answerText : x === 'wrong' ? 'qqqqqq' : String(x);
        box.el.requestSubmit();
        if (x === 'wrong' && !giveUp.disabled) { box.input.value = 'qqqqqq'; box.el.requestSubmit(); }
      },
    };
  },
});
