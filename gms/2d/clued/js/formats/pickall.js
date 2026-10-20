// Pick all: "Which 3 of these are …?" — 6–8 tiles (kids 4–5), 2–4 right. Sources: hand-written list questions
// (pack questions of kind 'pickall': answer = every right option, wrong = decoys, prompt holds {n}) and item facts
// (js/formats/pickall_rules.js). Partial credit: see pickScore.
import { register, poolItems, byDifficulty, imageOf, collect, pick, shuffle, sample, fill, givesAway, weightedPick } from './registry.js?v=202610201048';
import { h, imgEl, onKey } from '../ui/kit.js?v=202610201048';
import { injectCSS, baseCSS, once, hasImg, norm, uniqueByName } from './fkit.js?v=202610201048';
import { basePoints } from '../core/scoring.js?v=202610201048';
import { rulesFor } from './pickall_rules.js?v=202610201048';
import { pickScore } from './pickall_score.js?v=202610201048';

export { pickScore };

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];
const TILES = [6, 7, 8];

/* ---------- fairness: no option may be hinted by the prompt ---------- */
const STOP = new Set('these which what that this with from were have their there they them other others both about into some many most than then also only does were your more pick part names name famous among world great common little first lake island islands ocean river mountain city cities country countries state states'.split(' '));
const words = s => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w));
const stemHit = (a, b) => { const k = Math.min(a.length, b.length, 6); return k >= 4 && a.slice(0, k) === b.slice(0, k); };
const hitsOf = (text, pw) => pw.filter(p => words(text).some(w => stemHit(w, p)));
// A prompt word that only right (or only wrong) options share is a cue; one both sides share tells nothing.
export function unfair(prompt, opts, rightSet) {
  const pw = words(prompt);
  const hit = opts.map(t => hitsOf(t, pw));
  const bad = new Set();
  for (const p of new Set(hit.flat())) {
    const r = hit.some((x, i) => rightSet.has(i) && x.includes(p)), w = hit.some((x, i) => !rightSet.has(i) && x.includes(p));
    if (r !== w) hit.forEach((x, i) => { if (x.includes(p)) bad.add(i); });
  }
  // givesAway is the shared check; a cue already shown to be shared by both sides is not a giveaway
  const neutral = new Set([...new Set(hit.flat())].filter(p => !hit.some((x, i) => x.includes(p) && bad.has(i))));
  opts.forEach((t, i) => {
    if (!rightSet.has(i) || !givesAway(t, prompt, opts.filter((_, j) => !rightSet.has(j)))) return;
    if (!hit[i].length || !hit[i].every(p => neutral.has(p))) bad.add(i);
  });
  return [...bad];
}
const selfHint = (text, prompt) => hitsOf(text, words(prompt)).length > 0;

const countFor = (rng, nRight, tiles, kids) => {
  if (kids) return 2;
  const max = Math.min(4, nRight, Math.floor(tiles / 2));
  if (max < 2) return 0;
  return pick(rng, [2, 3, 3, 4].filter(x => x <= max));
};
const numWord = n => WORDS[n] || String(n);
const listText = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

function finishQ(rng, { id, prompt, right, wrong, explain, refs, pack, pics, data, difficulty }) {
  const all = shuffle(rng, [...right.map(o => ({ ...o, r: true })), ...wrong.map(o => ({ ...o, r: false }))]);
  const texts = all.map(o => o.text);
  if (new Set(texts.map(norm)).size !== texts.length) return null;
  const rs = new Set(all.map((o, i) => (o.r ? i : -1)).filter(i => i >= 0));
  if (unfair(prompt, texts, rs).length) return null;
  const answer = [...rs].sort((a, b) => a - b);
  const first = pick(rng, answer.map(i => texts[i]));
  return {
    format: 'pickall', id, prompt,
    options: all.map(o => (pics && o.img ? { text: o.text, img: o.img } : { text: o.text })),
    answer, answerText: answer.map(i => texts[i]).join(' · '), explain, refs, pack,
    hint: `One of them starts with “${first.charAt(0)}”`,
    ...(difficulty ? { difficulty } : {}),
    data: { need: answer.length, layout: pics ? 'images' : 'text', ...data },
  };
}

/* ---------- hand-written list questions ---------- */
// used: Map of list question / rule+value → times asked this round (a list once, a rule value twice).
function fromList(rng, pack, tiles, difficulty, kids, used) {
  const qs = (pack.questions || []).filter(q => q.kind === 'pickall' && (q.answer || []).length >= 2 && (q.wrong || []).length >= 2 && !used.has(`${pack.id}/${q.id}`));
  const q = pick(rng, byDifficulty(qs, difficulty, 1));
  if (!q) return null;
  const tpl = String(q.prompt);
  const pw = words(tpl.replace('{n}', 'three'));
  // an option whose prompt-word cue no option on the other side shares can never be fair
  const lone = (t, others) => hitsOf(t, pw).some(p => !others.some(o => hitsOf(o, pw).includes(p)));
  const rights = q.answer.filter(a => !lone(a, q.wrong)), wrongs = q.wrong.filter(w => !lone(w, q.answer));
  const n = countFor(rng, rights.length, tiles, kids);
  if (!n) return null;
  const T = Math.min(tiles, n + wrongs.length);
  if (T - n < 2 || (!kids && T < 6)) return null;
  const right = sample(rng, rights, n), wrong = sample(rng, wrongs, T - n);
  const prompt = tpl.replace('{n}', numWord(n));
  const out = finishQ(rng, {
    id: `pickall:${pack.id}/q:${q.id}:${[...right].sort().join('|')}:${[...wrong].sort().join('|')}`, prompt,
    right: right.map(text => ({ text })), wrong: wrong.map(text => ({ text })), explain: q.explain,
    refs: [`${pack.id}/q:${q.id}`], pack: pack.id, pics: false, data: { from: 'q' }, difficulty: q.difficulty,
  });
  if (out) used.set(`${pack.id}/${q.id}`, 1);
  return out;
}

/* ---------- item facts ---------- */
const factVal = (it, rule) => (rule.bool ? it.facts?.[rule.key] === true : it.facts?.[rule.key]);
function ruleValues(rule, items) {
  if (rule.bool) return [true];
  const counts = {};
  for (const it of items) { const v = it.facts?.[rule.key]; if (v != null && !Array.isArray(v)) counts[v] = (counts[v] || 0) + 1; }
  return Object.keys(counts).filter(v => counts[v] >= (rule.min || 2) && (!rule.values || rule.values.includes(v)) && (!rule.value || rule.value(v))).sort();
}

function fromRule(rng, pack, rule, tiles, difficulty, kids, used) {
  const pool = poolItems([pack], it => it.facts?.[rule.key] != null && (!rule.ok || rule.ok(it)));
  const key = v => `${pack.id}:${rule.id}:${v}`;
  const values = ruleValues(rule, pool.map(c => c.item)).filter(v => (used.get(key(v)) || 0) < 2);
  if (!values.length) return null;
  const v = pick(rng, values);
  const isRight = c => (rule.bool ? factVal(c.item, rule) === true : String(c.item.facts[rule.key]) === v);
  const isWrong = c => (rule.bool ? c.item.facts[rule.key] === false : String(c.item.facts[rule.key]) !== v) && (!rule.wrong || rule.wrong(c.item, v));
  const vText = rule.display?.[v] || v;
  const tpl = rule.ask.replace('{plural}', vText);
  const probe = fill(tpl.replace('{n}', 'three'), { value: rule.bool ? '' : v });
  const fair = c => !selfHint(c.item.name, probe);
  let rights = uniqueByName(byDifficulty(pool.filter(c => isRight(c) && fair(c)), difficulty, 2, c => c.item.difficulty || 2));
  let wrongs = uniqueByName(pool.filter(c => isWrong(c) && fair(c)));
  if (difficulty) wrongs = byDifficulty(wrongs, difficulty, tiles, c => c.item.difficulty || 2);
  const n = countFor(rng, rights.length, tiles, kids);
  if (!n) return null;
  const T = Math.min(tiles, n + wrongs.length);
  if (T - n < 2 || (!kids && T < 6)) return null;
  const right = sample(rng, rights, n);
  const names = new Set(right.map(c => norm(c.item.name)));
  if (rule.id === 'hits') wrongs = wrongs.filter(c => !pool.some(x => isRight(x) && norm(x.item.name) === norm(c.item.name)));
  const wrong = sample(rng, wrongs.filter(c => !names.has(norm(c.item.name))), T - n);
  if (wrong.length < T - n) return null;
  const pics = !!rule.pics && [...right, ...wrong].every(c => hasImg(c.item)) && (kids || rng() < 0.35);
  const opt = c => ({ text: c.item.name, img: pics ? imageOf(c.item, rng) : undefined });
  const prompt = fill(tpl.replace('{n}', numWord(n)), { value: rule.bool ? '' : v });
  const explain = fill(rule.say.replace('{plural}', vText).replace('{list}', listText(right.map(c => c.item.name))).replace(/\{(are|have|were|come)\}/g, '$1'), { value: rule.bool ? '' : v });
  const out = finishQ(rng, {
    id: `pickall:${rule.id}:${pack.id}:${right.map(c => c.item.id).sort().join(',')}:${wrong.map(c => c.item.id).sort().join(',')}`, prompt,
    right: right.map(opt), wrong: wrong.map(opt), explain,
    refs: [...right, ...wrong].map(c => c.ref), pack: pack.id, pics,
    data: { from: 'rule', rule: rule.id, key: rule.key, value: rule.bool ? true : v },
  });
  if (out) used.set(key(v), (used.get(key(v)) || 0) + 1);
  return out;
}

const packId = info => info.id || String(info.path || '').replace(/^.*\//, '').replace(/\.json$/, '');
function sources(pack, kids) {
  const out = [];
  if ((pack.questions || []).some(q => q.kind === 'pickall')) out.push([null, 3]);
  for (const r of rulesFor(pack.id)) if (!kids || r.kids) out.push([r, 1]);
  return out;
}

export default register({
  id: 'pickall', title: 'Pick all', icon: '☑️', blurb: 'Tap every right answer, then lock in', tags: ['kids', 'slow'], kids: true,
  answerOnBoard: true, revealInline: true, timeScale: 1.6,
  options: [
    { key: 'tiles', label: 'Answers shown', type: 'choice', values: TILES, default: 6, kidsHide: true, help: '2–4 of them are right' },
  ],
  supports(info) {
    if ((info.caps?.qkinds?.pickall || 0) > 0 || rulesFor(packId(info)).length) return true;
    return 'Needs list questions or grouped facts';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const tilesOf = () => (kids ? (rng() < 0.5 ? 4 : 5) : TILES.includes(+opts.tiles) ? +opts.tiles : 6);
    const usable = packs.map(p => ({ p, s: sources(p, kids) })).filter(x => x.s.length);
    if (!usable.length) return [];
    const used = new Map();
    return collect(count, () => {
      const { p, s } = weightedPick(rng, usable, x => Math.sqrt((x.p.items || []).length + (x.p.questions || []).filter(q => q.kind === 'pickall').length * 4 + 1));
      const [rule] = weightedPick(rng, s, x => x[1]);
      const tiles = tilesOf();
      const q = rule ? fromRule(rng, p, rule, tiles, difficulty, kids, used) : fromList(rng, p, tiles, difficulty, kids, used);
      if (q && kids) q.kids = true;
      return q;
    }, avoid, count * 20);
  },
  render,
});

const CSS = `
.pa{gap:10px}
.pa-top{display:flex;justify-content:center;align-items:center;gap:8px;font-weight:900;color:var(--ink-2);font-size:15px;min-height:22px}
.pa-top.warn{color:var(--bad);animation:shake .4s}
.pa-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pa-tile{--c:var(--sky);position:relative;display:flex;align-items:center;gap:8px;min-height:54px;padding:8px 10px;border:var(--line) solid var(--ink);border-radius:16px;background:#fff;box-shadow:var(--shadow-sm,0 3px 0 var(--ink));font:inherit;font-weight:800;font-size:16px;line-height:1.15;color:var(--ink);text-align:left;cursor:pointer;overflow-wrap:break-word;hyphens:auto}
.pa-tile .box{flex:none;width:24px;height:24px;border-radius:7px;border:2px solid var(--ink);background:#fff;display:grid;place-items:center;font-size:16px;color:#fff}
.pa-tile .lbl{flex:1;min-width:0}
.pa-tile[aria-pressed=true]{background:color-mix(in srgb,var(--c) 32%,#fff);transform:translateY(2px);box-shadow:0 1px 0 var(--ink)}
.pa-tile[aria-pressed=true] .box{background:var(--ink)}
.pa-tile[aria-pressed=true] .box::before{content:'✓'}
.pa-tile:disabled{cursor:default}
.pa-tile.gone{visibility:hidden}
.pa-tile.ok{background:var(--good);color:#fff}.pa-tile.ok .box{background:#fff;color:var(--good)}.pa-tile.ok .box::before{content:'✓'}
.pa-tile.bad{background:var(--bad);color:#fff}.pa-tile.bad .box{background:#fff;color:var(--bad)}.pa-tile.bad .box::before{content:'✗'}
.pa-tile.miss{border-style:dashed;border-color:var(--good);background:#e9f7ee;color:#1d5a35}.pa-tile.miss .box{border-color:var(--good)}
.pa-tile.miss .box::before{content:'!';color:var(--good)}
.pa-tile.dim{opacity:.45}
.pa-tile .tag{position:absolute;right:6px;top:-9px;padding:0 6px;border-radius:999px;border:2px solid var(--ink);background:#fff;color:var(--ink);font-size:11px;font-weight:900}
.pa-grid.images .pa-tile{flex-direction:column;align-items:stretch;padding:6px;gap:4px;text-align:center}
.pa-grid.images .pa-tile img{width:100%;aspect-ratio:4/3;object-fit:contain;border-radius:10px;border:2px solid var(--ink);background:#eee}
.pa-grid.images .pa-tile .box{position:absolute;top:10px;left:10px;z-index:1}
.pa-lock{align-self:center;min-width:200px}
.play.kids .pa-tile{min-height:70px;font-size:clamp(16px,4.8vw,21px);border-radius:20px;gap:6px}
.play.kids .pa-top{font-size:18px}
@media (orientation:landscape) and (max-height:520px){
 .pa{gap:6px}.pa-grid{grid-template-columns:repeat(4,1fr);gap:6px}.pa-grid.n6,.pa-grid.n5{grid-template-columns:repeat(3,1fr)}
 .pa-tile{min-height:40px;padding:5px 8px;font-size:14px}.pa-grid.images{grid-template-columns:repeat(5,1fr)}
 .pa-grid.images.n4{grid-template-columns:repeat(4,1fr)}.pa-grid.images .pa-tile img{aspect-ratio:16/10}.pa-lock{min-height:40px;padding:6px 18px}
}
@media (min-width:900px) and (min-height:560px){.pa-grid{grid-template-columns:repeat(4,1fr)}.pa-grid.n6{grid-template-columns:repeat(3,1fr)}.pa-tile{min-height:64px;font-size:18px}}
`;

function render(el, q, api) {
  injectCSS('f-pickall-css', CSS); baseCSS();
  el.innerHTML = '';
  const answer = once(api);
  const need = Math.max(1, q.data?.need || (q.answer || []).length || 1);
  const right = new Set(q.answer || []);
  const imgs = q.data?.layout === 'images';
  const sel = new Set();
  let done = false, warnT = 0, autoT = 0;
  const top = h('div.pa-top');
  const tiles = q.options.map((o, i) => h('button.pa-tile', { type: 'button', 'aria-pressed': 'false', dataset: { i: String(i) }, onclick: () => tap(i) },
    h('span.box'), o.img ? imgEl(o.img, { alt: o.text }) : null, h('span.lbl', {}, o.text)));
  const grid = h('div.pa-grid', { class: `${imgs ? 'images' : ''} n${q.options.length}` }, ...tiles);
  const lock = h('button.btn.primary.pa-lock', { type: 'button', dataset: { act: 'lock' }, onclick: () => finish() });
  el.append(h('div.f-stage.pa', {}, h('h2.q-prompt', {}, q.prompt), top, grid, api.kids ? null : lock));
  const draw = () => {
    const left = need - sel.size;
    top.textContent = `Pick ${need} · ${sel.size} picked`;
    lock.disabled = left !== 0;
    lock.textContent = left > 0 ? `Pick ${left} more` : 'Lock in ✓';
  };
  draw();
  function tap(i) {
    if (done || tiles[i].disabled) return;
    if (sel.has(i)) sel.delete(i);
    else if (sel.size < need) sel.add(i);
    else {
      top.textContent = 'Unpick one first';
      top.classList.remove('warn'); void top.offsetWidth; top.classList.add('warn');
      clearTimeout(warnT); warnT = setTimeout(() => { top.classList.remove('warn'); if (!done) draw(); }, 1100);
      api.sfx?.('wrong');
      return;
    }
    tiles[i].setAttribute('aria-pressed', String(sel.has(i)));
    api.sfx?.('tap');
    api.draft?.([...sel].sort((a, b) => a - b));
    draw();
    clearTimeout(autoT);
    if (api.kids && sel.size === need) autoT = setTimeout(() => finish(), 450);
  }
  function mark() {
    tiles.forEach((b, i) => {
      b.disabled = true; b.removeAttribute('aria-pressed');
      const cls = right.has(i) ? (sel.has(i) ? 'ok' : 'miss') : sel.has(i) ? 'bad' : 'dim';
      b.classList.add(cls);
      if (cls === 'miss') b.append(h('span.tag', {}, 'missed'));
    });
    lock.remove();
  }
  function finish(timeout) {
    if (done || (!timeout && sel.size !== need)) return;
    done = true;
    clearTimeout(autoT); clearTimeout(warnT);
    mark();
    const s = pickScore([...sel], q.answer);
    top.classList.remove('warn');
    top.textContent = s.correct ? `All ${right.size} right!` : `${s.hits} of ${right.size} right${s.wrong ? ` · ${s.wrong} wrong` : ''}`;
    // a timeout scores what was picked as if locked at the deadline (minimum speed points)
    const given = [...sel].sort((a, b) => a - b);
    let res;
    if (s.correct) res = { correct: true, given };
    else {
      let rem = 0, full = 0;
      try { rem = timeout ? 0 : api.timer.remaining(); full = api.timer.full || api.timer.limit || 0; } catch (e) {}
      const base = basePoints({ timed: !!api.timed && full > 0 && (timeout || rem > 0), remaining: rem, limit: full });
      const points = Math.round(base * s.frac);
      res = { correct: false, partial: points > 0, points, given, detail: { hits: s.hits, wrong: s.wrong, of: right.size } };
    }
    if (timeout) return res;
    answer(res);
  }
  const offKey = onKey(e => {
    if (done) return;
    const k = parseInt(e.key, 10);
    if (k >= 1 && k <= tiles.length) { tap(k - 1); return true; }
    if (e.key === 'Enter' && sel.size === need) { finish(); return true; }
  });
  return {
    destroy() { offKey(); clearTimeout(autoT); clearTimeout(warnT); },
    timeoutAnswer() { return finish(true) || null; },
    eliminate(k = 1) {
      const wrong = tiles.map((b, i) => i).filter(i => !right.has(i) && !tiles[i].disabled && !sel.has(i));
      const m = Math.min(k, Math.max(1, Math.floor(wrong.length / 2)));
      for (const i of shuffle(api.rng || Math.random, wrong).slice(0, m)) { tiles[i].disabled = true; tiles[i].classList.add('gone'); }
    },
    hint: () => q.hint,
    choose(x) {
      sel.clear();
      const ids = Array.isArray(x) ? x : x === 'correct' ? [...right] : tiles.map((b, i) => i).filter(i => !right.has(i)).slice(0, need);
      ids.slice(0, need).forEach(i => sel.add(i));
      tiles.forEach((b, i) => b.setAttribute('aria-pressed', String(sel.has(i))));
      draw();
      finish();
    },
  };
}
