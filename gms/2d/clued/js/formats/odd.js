import { register, poolItems, pickPack, byDifficulty, imageOf, factText, placeAnswer, collect, pick, sample, factAllowed, nested, factPhrase } from './registry.js?v=202610081134';
import { layout, choiceGrid } from '../ui/kit.js?v=202610081134';
import { uniqueByName, norm, hasImg } from './fkit.js?v=202610081134';

const vals = v => [].concat(v).map(String);

// Every way a pack can split its items into "same" and "odd". n = total options.
function sources(pack, n, difficulty, kids) {
  const items = pack.items || [];
  const out = [];
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if ((m.hard && difficulty !== 3) || !factAllowed(m, { kids, difficulty })) continue;
    const has = items.filter(it => it.facts && it.facts[key] != null);
    if (m.type === 'cat' && m.exclusive !== false) {
      const counts = {};
      for (const it of has) for (const v of vals(it.facts[key])) counts[v] = (counts[v] || 0) + 1;
      if (Object.keys(counts).length >= 2 && Object.values(counts).some(c => c >= n - 1)) out.push(['cat', key]);
    } else if (m.type === 'bool') {
      const yes = has.filter(it => it.facts[key] === true).length, no = has.filter(it => it.facts[key] === false).length;
      if (yes >= 1 && no >= 1 && Math.max(yes, no) >= n - 1) out.push(['bool', key]);
    }
  }
  const groups = {};
  for (const it of items) if (it.group) groups[it.group] = (groups[it.group] || 0) + 1;
  const dupFact = Object.keys(pack.factsMeta || {}).some(k => items.every(it => !it.group || vals(it.facts?.[k] ?? '').includes(it.group)));
  if (pack.groupLabel && !dupFact && Object.keys(groups).length >= 2 && Object.values(groups).some(c => c >= n - 1)) out.push(['group', '']);
  return out;
}

// With multi-valued facts another option could also be "the odd one"; such sets are dropped.
function onlyOneOdd(list, v) {
  let n = 0;
  list.forEach((c, j) => {
    const rest = list.filter((_, k) => k !== j);
    const shared = v(rest[0]).filter(x => rest.every(r => v(r).includes(x)));
    if (shared.length && shared.every(x => !v(c).includes(x))) n++;
  });
  return n === 1;
}

function make(rng, pack, [type, key], n, difficulty, kids) {
  const meta = key ? pack.factsMeta[key] : null;
  const all = poolItems([pack]);
  const val = c => (type === 'group' ? c.item.group : c.item.facts?.[key]);
  const pool = byDifficulty(all.filter(c => val(c) != null), difficulty, n + 2, c => c.item.difficulty || 2);
  let label, sameText, oddText, same, odd;
  if (type === 'bool') {
    const flip = rng() < 0.5;
    const A = pool.filter(c => val(c) === !flip), B = pool.filter(c => val(c) === flip);
    if (A.length < n - 1 || !B.length) return null;
    same = sample(rng, uniqueByName(A), n - 1);
    odd = pick(rng, B);
    label = factPhrase(meta, key);
    sameText = factText(meta, !flip); oddText = factText(meta, flip);
  } else {
    const counts = {};
    for (const c of pool) for (const v of vals(val(c))) counts[v] = (counts[v] || 0) + 1;
    const big = Object.keys(counts).filter(v => counts[v] >= n - 1).sort();
    if (!big.length) return null;
    const V = pick(rng, big);
    const A = pool.filter(c => vals(val(c)).includes(V)), B = pool.filter(c => !vals(val(c)).includes(V) && !vals(val(c)).some(x => nested(x, V)));
    if (!B.length) return null;
    same = sample(rng, uniqueByName(A), n - 1);
    odd = pick(rng, B);
    label = type === 'group' ? pack.groupLabel : factPhrase(meta, key);
    sameText = V; oddText = vals(val(odd)).join(', ');
  }
  if (same.length < n - 1 || same.some(c => norm(c.item.name) === norm(odd.item.name))) return null;
  if (!onlyOneOdd([odd, ...same], c => (type === 'bool' ? [String(val(c))] : vals(val(c))))) return null;
  const { options, answer } = placeAnswer(rng, odd, same);
  const pics = options.every(c => hasImg(c.item)) && (kids || rng() < 0.45);
  return {
    format: 'odd', id: `odd:${type}:${key}:${odd.ref}:${same.map(c => c.item.id).sort().join(',')}`,
    prompt: `Odd one out: think ${label}`,
    options: options.map(c => (pics ? { text: c.item.name, img: imageOf(c.item, rng) } : { text: c.item.name })),
    answer, answerText: odd.item.name,
    explain: `${odd.item.name}: ${oddText}. The others: ${sameText}.`,
    refs: [odd.ref, ...same.map(c => c.ref)], data: { layout: pics ? 'images' : 'text' }, pack: pack.id,
    hint: `Three of them are ${sameText.toLowerCase()}`,
  };
}

const ANSWERS = [3, 4, 5];

export default register({
  id: 'odd', title: 'Odd one out', icon: '🧩', blurb: 'Spot the one that doesn’t belong', tags: ['choice', 'kids'], kids: true,
  options: [
    { key: 'answers', label: 'Answers', type: 'choice', values: ANSWERS, default: 4, kidsValues: [3], kidsDefault: 3 },
  ],
  supports(info) {
    const c = info.caps || {};
    const multi = new Set(c.multi || []);
    if (Object.entries(c.facts || {}).some(([k, t]) => t === 'bool' || (t === 'cat' && !multi.has(k))) && info.items >= 4) return true;
    return 'Needs items with category or yes/no facts';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    let n = ANSWERS.includes(+opts.answers) ? +opts.answers : 4;
    if (kids) n = 3;
    const usable = packs.map(p => ({ p, s: sources(p, n, difficulty, kids) })).filter(x => x.s.length);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, s } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + 1));
      return make(rng, p, pick(rng, s), n, difficulty, kids);
    }, avoid);
  },
  render(el, q, api) {
    const imgs = q.data?.layout === 'images';
    const { answersEl } = layout(el, { prompt: q.prompt, compact: imgs });
    const grid = choiceGrid(answersEl, q.options, {
      images: imgs,
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

