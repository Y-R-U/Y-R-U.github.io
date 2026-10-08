import { register, poolItems, pickPack, byDifficulty, imageOf, fill, placeAnswer, collect, pick, shuffle, factAllowed, nameArgs } from './registry.js?v=202610081215';
import { layout, choiceGrid } from '../ui/kit.js?v=202610081215';
import { norm, fmtFact, escHtml, injectCSS, hasImg } from './fkit.js?v=202610081215';

const CSS = `
.lk-diff{border-collapse:collapse;width:100%;table-layout:fixed;font-size:14px;margin-top:2px}
.lk-diff th,.lk-diff td{border-top:2px solid rgba(31,26,77,.12);padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:break-word;hyphens:auto}
.lk-diff th{color:var(--ink-2);font-weight:800}
.lk-diff td.me{color:var(--good);font-weight:900}
.lk-notes{margin:2px 0 0;padding-left:18px;font-size:14px;color:var(--ink-2)}
`;

function lookalikesOf(c, byId) {
  return (c.item.lookalikes || []).map(id => byId.get(id)).filter(x => x && hasImg(x.item) && norm(x.item.name) !== norm(c.item.name));
}

// Facts that tell the target apart from its lookalikes, as a small table for the reveal.
function diffTable(pack, list, kids) {
  const rows = [];
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if (kids && !factAllowed(m, { kids })) continue;
    if (!['bool', 'cat', 'num', 'year'].includes(m.type)) continue;
    const vs = list.map(c => c.item.facts?.[key]);
    if (vs.some(v => v == null)) continue;
    const txt = vs.map(v => fmtFact(m, v));
    if (new Set(txt).size < 2) continue;
    rows.push([m.label || key, txt]);
    if (rows.length >= 4) break;
  }
  return rows;
}

function make(rng, pack, n, difficulty, kids) {
  const all = poolItems([pack]).filter(c => hasImg(c.item));
  const byId = new Map(all.map(c => [c.item.id, c]));
  const targets = byDifficulty(all.filter(c => lookalikesOf(c, byId).length), difficulty, 3, c => c.item.difficulty || 2);
  if (!targets.length) return null;
  const t = pick(rng, targets);
  const others = shuffle(rng, lookalikesOf(t, byId));
  const seen = new Set([norm(t.item.name)]);
  const wrong = others.filter(c => !seen.has(norm(c.item.name)) && seen.add(norm(c.item.name))).slice(0, n - 1);
  const { options, answer } = placeAnswer(rng, t, wrong);
  const ordered = options;
  const rows = diffTable(pack, ordered, kids);
  return {
    format: 'lookalike', id: `look:${t.ref}:${wrong.map(c => c.item.id).sort().join(',')}`,
    prompt: fill(pack.lookPrompt || 'Which one is {aName}?', nameArgs(t.item, pack)),
    options: ordered.map(c => ({ text: c.item.name, img: imageOf(c.item, rng) })),
    answer, answerText: t.item.name, explain: t.item.blurb,
    refs: [t.ref, ...wrong.map(c => c.ref)], pack: pack.id,
    data: {
      layout: 'images',
      diff: rows.length ? { names: ordered.map(c => c.item.name), rows } : null,
      notes: rows.length ? null : wrong.map(c => [c.item.name, c.item.blurb || '']).filter(x => x[1]),
    },
  };
}

function diffHtml(q) {
  const d = q.data?.diff;
  if (d) {
    const head = `<tr><th></th>${d.names.map((n, i) => `<th class="${i === q.answer ? 'me' : ''}">${escHtml(n)}</th>`).join('')}</tr>`;
    const body = d.rows.map(([l, vs]) => `<tr><th>${escHtml(l)}</th>${vs.map((v, i) => `<td class="${i === q.answer ? 'me' : ''}">${escHtml(v)}</td>`).join('')}</tr>`).join('');
    return `<table class="lk-diff">${head}${body}</table>`;
  }
  const notes = q.data?.notes || [];
  return notes.length ? `<ul class="lk-notes">${notes.map(([n, b]) => `<li><b>${escHtml(n)}:</b> ${escHtml(b)}</li>`).join('')}</ul>` : '';
}

const ANSWERS = [2, 3];

export default register({
  id: 'lookalike', title: 'Lookalikes', icon: '👯', blurb: 'Which one is the real deal?', tags: ['kids'], kids: true,
  options: [{ key: 'answers', label: 'Pictures', type: 'choice', values: ANSWERS, default: 3, kidsValues: [2], kidsDefault: 2 }],
  supports(info) {
    const c = info.caps || {};
    return (c.lookalikes || 0) >= 2 && (c.img || 0) >= 4 ? true : 'Needs lookalike pairs with pictures';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 2 : ANSWERS.includes(+opts.answers) ? +opts.answers : 3;
    const usable = packs.filter(p => (p.items || []).some(it => it.lookalikes?.length && hasImg(it)));
    if (!usable.length) return [];
    return collect(count, () => {
      const q = make(rng, pickPack(rng, usable), n, difficulty, kids);
      return q && q.options.length >= 2 ? q : null;
    }, avoid);
  },
  render(el, q, api) {
    injectCSS('f-look-css', CSS);
    const { answersEl } = layout(el, { prompt: q.prompt, compact: true });
    const grid = choiceGrid(answersEl, q.options, {
      images: true,
      onPick(i) {
        grid.lock(); grid.mark(q.answer, i);
        const d = diffHtml(q); if (d) api.reveal(d);
        api.answer({ correct: i === q.answer, given: i });
      },
    });
    return {
      destroy: () => grid.destroy(),
      timeout() { grid.lock(); grid.mark(q.answer, -1); const d = diffHtml(q); if (d) api.reveal(d); },
      choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x); },
    };
  },
});
