import { register, poolItems, pickPack, byDifficulty, placeAnswer, collect, pick, sample } from './registry.js?v=202610081134';
import { layout, choiceGrid } from '../ui/kit.js?v=202610081134';
import { uniqueByName, norm, packNoun } from './fkit.js?v=202610081134';

function fakesOf(pack) {
  const real = new Set((pack.items || []).flatMap(it => [it.name, ...(it.alt || [])]).map(norm));
  return [...new Set((pack.fakes || []).map(String))].filter(f => f.trim() && !real.has(norm(f)));
}

function make(rng, pack, n, difficulty, used) {
  const fakes = fakesOf(pack);
  if (!fakes.length) return null;
  const fresh = fakes.filter(f => !used.has(`${pack.id}:${norm(f)}`));
  const fake = pick(rng, fresh.length ? fresh : fakes);
  const pool = byDifficulty(poolItems([pack]), difficulty === 0 ? 1 : difficulty, n + 2, c => c.item.difficulty || 2);
  const real = sample(rng, uniqueByName(pool).filter(c => norm(c.item.name) !== norm(fake)), n - 1);
  if (real.length < n - 1) return null;
  const reuse = !fresh.length;
  used.add(`${pack.id}:${norm(fake)}`);
  const { options, answer } = placeAnswer(rng, fake, real);
  const noun = packNoun(pack);
  return {
    format: 'fake',
    id: `fake:${pack.id}:${norm(fake)}${reuse ? ':' + real.map(c => c.item.id).sort().join(',') : ''}`,
    prompt: pack.fakePrompt || `Which of these ${noun} is made up?`,
    options: options.map(o => ({ text: typeof o === 'string' ? o : o.item.name })),
    answer, answerText: fake,
    explain: `“${fake}” doesn’t exist. ${real.map(c => c.item.name).join(', ')} ${real.length > 1 ? 'are all real' : 'is real'}.`,
    refs: real.map(c => c.ref), pack: pack.id,
  };
}

const ANSWERS = [3, 4];

export default register({
  id: 'fake', title: 'Spot the fake', icon: '🕵️', blurb: 'One of these doesn’t exist', tags: ['choice'],
  options: [{ key: 'answers', label: 'Answers', type: 'choice', values: ANSWERS, default: 4, kidsValues: [3], kidsDefault: 3 }],
  supports(info) {
    return (info.caps?.fakes || 0) >= 1 && info.items >= 3 ? true : 'Needs a list of made-up names';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 3 : ANSWERS.includes(+opts.answers) ? +opts.answers : 4;
    const usable = packs.filter(p => fakesOf(p).length && (p.items || []).length >= n - 1);
    if (!usable.length) return [];
    const used = new Set();
    return collect(count, () => make(rng, pickPack(rng, usable, p => Math.sqrt(fakesOf(p).length)), n, difficulty, used), avoid);
  },
  render(el, q, api) {
    const { answersEl } = layout(el, { prompt: q.prompt });
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
