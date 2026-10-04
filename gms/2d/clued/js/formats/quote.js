import { register, poolItems, pickPack, byDifficulty, placeAnswer, collect, pick, sample, shuffle } from './registry.js?v=1';
import { layout, choiceGrid, h } from '../ui/kit.js?v=1';
import { norm, injectCSS } from './fkit.js?v=1';

const CSS = `
.qt-card{position:relative;margin:0;background:#fff;border:var(--line) solid var(--ink);border-radius:var(--r);box-shadow:var(--shadow);padding:22px 18px 16px;font-size:clamp(19px,5.2vw,24px);line-height:1.3;font-weight:800;text-align:center;text-wrap:balance;animation:ch-in .4s cubic-bezier(.2,1.4,.4,1) both}
.qt-card::before{content:'“';position:absolute;left:10px;top:-18px;font-family:var(--font-display);font-size:64px;color:var(--coral);line-height:1}
.qt-card.long{font-size:clamp(16px,4.4vw,19px);text-align:left}
.qt-tag{display:block;margin-top:8px;font-size:13px;color:var(--ink-3);font-weight:800}
.qt .q-prompt{font-size:clamp(18px,5vw,24px)}
@media (orientation:landscape) and (max-height:520px){.qt-card{font-size:18px;padding:16px 14px 10px}.qt-card.long{font-size:15px}}
@media (min-width:900px) and (min-height:560px){.qt-card{font-size:26px}.qt-card.long{font-size:20px}}
`;

const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'to', 'part', 'movie', 'film', 'episode', 'book', 'from', 'with']);
const SERIES = [
  /^(star wars|the empire strikes back|return of the jedi)/, /^indiana jones|^raiders of the lost ark/, /avengers|captain america|black panther|iron man|thor\b|guardians of the galaxy|spider-man/,
];
const tokens = s => norm(s).split(' ').filter(w => w.length >= 4 && !STOP.has(w));
const seriesOf = s => { const n = String(s).toLowerCase(); const i = SERIES.findIndex(r => r.test(n)); return i < 0 ? null : i; };
// Two titles from the same franchise can't sit side by side: the line might be in both.
function related(a, b) {
  if (seriesOf(a) != null && seriesOf(a) === seriesOf(b)) return true;
  const ta = new Set(tokens(a));
  return tokens(b).some(w => ta.has(w));
}
const leaks = (quote, names) => {
  const q = ` ${norm(quote)} `;
  return names.some(n => norm(n) && (q.includes(` ${norm(n)} `) || tokens(n).some(w => w.length >= 4 && q.includes(` ${w} `))));
};
function trimQuote(s, max = 230) {
  s = String(s).trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

function promptFor(pack, kind) {
  if (pack.quotePrompt) return pack.quotePrompt;
  if (kind === 'first') return 'Which book opens with this line?';
  if (pack.theme === 'screen') return 'Which film is this line from?';
  return 'Who said it?';
}

function sources(pack) {
  const items = pack.items || [];
  const out = [];
  if (items.filter(it => it.quote || it.quotes?.length).length >= 1 && items.length >= 4) out.push('quote');
  if (items.filter(it => it.firstLine).length >= 1 && items.length >= 4) out.push('first');
  if ((pack.questions || []).some(q => q.kind === 'quote' && q.answer && (q.wrong || []).length >= 2)) out.push('q');
  return out;
}

// Every line an item owns: [{ text, context, difficulty }]
function linesOf(it, kind) {
  if (kind === 'first') return it.firstLine ? [{ text: it.firstLine, difficulty: it.difficulty }] : [];
  const out = (it.quotes || []).map(x => (typeof x === 'string' ? { text: x } : x)).filter(x => x && x.text);
  if (it.quote && !out.some(x => norm(x.text) === norm(it.quote))) out.unshift({ text: it.quote, difficulty: it.difficulty });
  return out;
}

function fromItems(rng, pack, kind, n, difficulty) {
  const all = poolItems([pack]);
  const withLine = all.filter(c => linesOf(c.item, kind).length);
  const t = pick(rng, byDifficulty(withLine, difficulty, 3, c => c.item.difficulty || 2));
  if (!t) return null;
  const pickLine = byDifficulty(linesOf(t.item, kind), difficulty, 1, x => x.difficulty || t.item.difficulty || 2);
  const lineObj = pick(rng, pickLine);
  const line = lineObj?.text;
  if (!line || leaks(line, [t.item.name, ...(t.item.alt || [])])) return null;
  let cands = all.filter(c => c !== t && !related(c.item.name, t.item.name));
  if (difficulty === 3 && t.item.group) {
    const same = cands.filter(c => c.item.group === t.item.group);
    if (same.length >= n - 1) cands = same;
  }
  const wrong = [];
  for (const c of shuffle(rng, cands)) {
    if (wrong.length >= n - 1) break;
    if (wrong.some(w => related(w.item.name, c.item.name) || norm(w.item.name) === norm(c.item.name))) continue;
    wrong.push(c);
  }
  if (wrong.length < n - 1) return null;
  const { options, answer } = placeAnswer(rng, t, wrong);
  const tag = kind === 'first' && t.item.translator ? `Translated by ${t.item.translator}` : '';
  return {
    format: 'quote', id: `quote:${kind}:${t.ref}:${norm(line).slice(0, 24)}`,
    prompt: `“${trimQuote(line)}” ${promptFor(pack, kind)}`, options: options.map(c => ({ text: c.item.name })), answer, answerText: t.item.name,
    explain: lineObj.context ? `${t.item.name}: ${lineObj.context}.` : t.item.blurb, refs: [t.ref, ...wrong.map(c => c.ref)], pack: pack.id,
    data: { quote: trimQuote(line), tag, ask: promptFor(pack, kind) },
  };
}

function fromQuestion(rng, pack, n, difficulty) {
  const qs = byDifficulty((pack.questions || []).filter(q => q.kind === 'quote' && q.answer && (q.wrong || []).length >= n - 1), difficulty, 1);
  if (!qs.length) return null;
  const q = pick(rng, qs);
  const line = q.quote || q.text || q.prompt;
  if (!line || leaks(line, [q.answer])) return null;
  const { options, answer } = placeAnswer(rng, q.answer, sample(rng, q.wrong, n - 1));
  const ask = q.quote ? (q.prompt || promptFor(pack, 'q')) : promptFor(pack, 'q');
  return {
    format: 'quote', id: `quote:${pack.id}/q:${q.id}`, prompt: `“${trimQuote(line)}” ${ask}`,
    options: options.map(t => ({ text: String(t) })), answer, answerText: String(q.answer), explain: q.explain,
    refs: [`${pack.id}/q:${q.id}`], pack: pack.id, data: { quote: trimQuote(line), tag: q.source || '', ask },
  };
}

const ANSWERS = [3, 4];

export default register({
  id: 'quote', title: 'Who said it?', icon: '💬', blurb: 'Famous lines: which film, book or person?', tags: ['choice', 'kids'], kids: true,
  options: [{ key: 'answers', label: 'Answers', type: 'choice', values: ANSWERS, default: 4, kidsValues: [3], kidsDefault: 3 }],
  supports(info) {
    const c = info.caps || {};
    if ((c.quotes || 0) >= 4 || (c.qkinds?.quote || 0) >= 1) return true;
    if (info.theme === 'books' && Object.keys(c.facts || {}).includes('author') && info.items >= 20) return true;
    return 'Needs famous quotes or first lines';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 3 : ANSWERS.includes(+opts.answers) ? +opts.answers : 4;
    const usable = packs.map(p => ({ p, s: sources(p) })).filter(x => x.s.length);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, s } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + 1));
      const kind = pick(rng, s);
      return kind === 'q' ? fromQuestion(rng, p, n, difficulty) : fromItems(rng, p, kind, n, difficulty);
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-quote-css', CSS);
    const { answersEl, bodyEl, wrap } = layout(el, { prompt: q.data.ask || q.prompt });
    wrap.classList.add('qt');
    const long = q.data.quote.length > 110;
    bodyEl.insertBefore(h('blockquote.qt-card', { class: long ? 'long' : '' }, q.data.quote, q.data.tag ? h('span.qt-tag', {}, q.data.tag) : null), bodyEl.firstChild);
    const grid = choiceGrid(answersEl, q.options, {
      onPick(i) { grid.lock(); grid.mark(q.answer, i); api.answer({ correct: i === q.answer, given: i }); },
    });
    return {
      destroy: () => grid.destroy(),
      timeout() { grid.lock(); grid.mark(q.answer, -1); },
      eliminate(k = 1) { grid.eliminate(q.answer, k, api.rng || Math.random); },
      choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x); },
    };
  },
});
