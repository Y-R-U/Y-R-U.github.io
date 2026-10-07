import {
  register, poolItems, packQuestions, pickPack, distractors, byDifficulty, imageOf, hasImg, fill, factText,
  spreadApart, placeAnswer, collect, pick, shuffle, sample, factAllowed, nested, nameArgs, catAsk, boolAsk, numAsk,
} from './registry.js?v=202610071438';
import { layout, choiceGrid } from '../ui/kit.js?v=202610071438';

const PROMPTS = { nameImg: 'Which of these is {aName}?', imgName: 'What is this?' };

// Which question sources a pack can feed, given loaded pack data.
function sources(pack, n, src, gate = {}) {
  const items = pack.items || [];
  const out = [];
  const want = s => src === 'mix' || src === s;
  if (want('questions') && (pack.questions || []).some(q => (q.kind || 'mc') === 'mc' && (q.wrong || []).length >= Math.min(n - 1, 2))) out.push(['q', 3]);
  const imgs = items.filter(hasImg).length;
  if (want('pictures') && imgs >= n) out.push(['imgName', 2], ['nameImg', 1.5]);
  if (want('facts')) {
    for (const [key, m] of Object.entries(pack.factsMeta || {})) {
      if (!factAllowed(m, gate)) continue;
      const has = items.filter(it => it.facts && it.facts[key] != null);
      if (m.type === 'cat' && m.exclusive !== false && new Set(has.map(it => String(it.facts[key]))).size >= n) {
        if (catAsk(m)) out.push([`cat:${key}`, 1.5]);
        if (m.askReverse) out.push([`rev:${key}`, 1]);
      } else if (m.type === 'bool' && boolAsk(m) && has.some(it => it.facts[key] === true) && has.filter(it => it.facts[key] === false).length >= n - 1) {
        out.push([`bool:${key}`, 1]);
      } else if ((m.type === 'num' || m.type === 'year') && numAsk(m) && has.length >= n) {
        out.push([`num:${key}`, 0.8]);
      }
    }
  }
  return out;
}

function fromQuestion(rng, pack, n, difficulty) {
  // kids-bank questions carry only 2 wrong answers: a 4-answer game falls back to 3 rather than finding nothing
  const mcs = (pack.questions || []).filter(q => (q.kind || 'mc') === 'mc');
  const full = mcs.filter(q => (q.wrong || []).length >= n - 1);
  const qs = byDifficulty(full.length ? full : mcs.filter(q => (q.wrong || []).length >= 2), difficulty, 1);
  if (!qs.length) return null;
  const q = pick(rng, qs);
  const { options, answer } = placeAnswer(rng, q.answer, sample(rng, q.wrong, Math.min(n - 1, q.wrong.length)));
  return {
    format: 'mc', id: `mc:${pack.id}/q:${q.id}`, prompt: q.prompt, media: q.media && Object.keys(q.media).length ? q.media : undefined,
    options: options.map(t => ({ text: String(t) })), answer, answerText: String(q.answer),
    explain: q.explain, refs: [`${pack.id}/q:${q.id}`], hint: `It starts with “${String(q.answer).charAt(0)}”`,
  };
}

function fromItems(rng, pack, kind, n, difficulty) {
  const all = poolItems([pack]);
  const [type, key] = kind.split(':');
  const meta = key ? pack.factsMeta[key] : null;
  const fv = it => it.facts?.[key];

  if (type === 'imgName' || type === 'nameImg') {
    const pool = all.filter(c => hasImg(c.item));
    const t = pick(rng, byDifficulty(pool, difficulty, n, c => c.item.difficulty || 2));
    const wrong = distractors(rng, t, pool, n - 1);
    if (!wrong) return null;
    const right = t;
    const { options, answer } = placeAnswer(rng, right, wrong);
    const asImages = type === 'nameImg';
    const tpl = asImages ? (t.item.imgPrompt || pack.imgPrompt || PROMPTS.nameImg) : (t.item.nameImgPrompt || pack.nameImgPrompt || PROMPTS.imgName);
    return {
      format: 'mc', id: `mc:${type}:${t.ref}`, prompt: fill(tpl, nameArgs(t.item, pack)),
      media: asImages ? undefined : { img: [imageOf(t.item, rng)] },
      options: options.map(c => (asImages ? { text: c.item.name, img: imageOf(c.item, rng) } : { text: c.item.name })),
      answer, answerText: t.item.name, explain: t.item.blurb, refs: [t.ref, ...wrong.map(c => c.ref)],
      data: { layout: asImages ? 'images' : 'text' }, hint: hintFor(t.item, pack),
    };
  }

  const pool = all.filter(c => fv(c.item) != null);
  if (type === 'cat' || type === 'rev') {
    const t = pick(rng, byDifficulty(pool, difficulty, n, c => c.item.difficulty || 2));
    const vals = [].concat(fv(t.item)).map(String);
    const value = pick(rng, vals);
    if (type === 'cat') {
      const others = shuffle(rng, [...new Set(pool.flatMap(c => [].concat(fv(c.item)).map(String)))].filter(v => !vals.includes(v) && !vals.some(x => nested(x, v))));
      if (others.length < n - 1) return null;
      const { options, answer } = placeAnswer(rng, value, others.slice(0, n - 1));
      return {
        format: 'mc', id: `mc:cat:${key}:${t.ref}`, prompt: fill(catAsk(meta), { name: t.item.name, lname: t.item.lname, label: meta.label, value }),
        media: hasImg(t.item) && meta.showImg ? { img: [imageOf(t.item, rng)] } : undefined,
        options: options.map(text => ({ text })), answer, answerText: value,
        explain: t.item.blurb, refs: [t.ref], hint: `It starts with “${value.charAt(0)}”`,
      };
    }
    const wrong = distractors(rng, t, pool, n - 1, { reject: it => [].concat(fv(it)).map(String).includes(value) });
    if (!wrong) return null;
    const { options, answer } = placeAnswer(rng, t, wrong);
    return {
      format: 'mc', id: `mc:rev:${key}:${t.ref}`, prompt: fill(meta.askReverse, { name: t.item.name, lname: t.item.lname, label: meta.label, value }),
      options: options.map(c => ({ text: c.item.name })), answer, answerText: t.item.name,
      explain: t.item.blurb, refs: [t.ref, ...wrong.map(c => c.ref)], hint: `It starts with “${t.item.name.charAt(0)}”`,
    };
  }

  if (type === 'bool') {
    const yes = pool.filter(c => fv(c.item) === true), no = pool.filter(c => fv(c.item) === false);
    if (!yes.length || no.length < n - 1) return null;
    const t = pick(rng, yes);
    const wrong = sample(rng, no, n - 1);
    const { options, answer } = placeAnswer(rng, t, wrong);
    const pics = options.every(c => hasImg(c.item)) && rng() < 0.5;
    return {
      format: 'mc', id: `mc:bool:${key}:${t.ref}:${wrong.map(c => c.item.id).sort().join(',')}`,
      prompt: fill(boolAsk(meta), { label: meta.label }),
      options: options.map(c => (pics ? { text: c.item.name, img: imageOf(c.item, rng) } : { text: c.item.name })),
      answer, answerText: t.item.name, explain: t.item.blurb, refs: [t.ref, ...wrong.map(c => c.ref)],
      data: { layout: pics ? 'images' : 'text' }, hint: hintFor(t.item, pack),
    };
  }

  if (type === 'num') {
    const set = spreadApart(pool, c => fv(c.item), n, meta.minRatio || 1.5, rng);
    if (!set) return null;
    const low = rng() < 0.35 && !!numAsk(meta, true);
    const sorted = set.slice().sort((a, b) => fv(b.item) - fv(a.item));
    const t = low ? sorted[sorted.length - 1] : sorted[0];
    const prompt = fill(numAsk(meta, low), { label: meta.label });
    const order = shuffle(rng, set);
    return {
      format: 'mc', id: `mc:num:${key}:${low ? 'lo' : 'hi'}:${order.map(c => c.item.id).sort().join(',')}`,
      prompt, options: order.map(c => ({ text: c.item.name })), answer: order.indexOf(t), answerText: t.item.name,
      explain: order.map(c => `${c.item.name}: ${factText(meta, fv(c.item))}`).join(' · '), refs: order.map(c => c.ref),
      hint: hintFor(t.item, pack),
    };
  }
  return null;
}

function hintFor(item, pack) {
  const clues = (item.clues || []).filter(c => !c.toLowerCase().includes(item.name.toLowerCase()));
  if (clues.length) return clues[clues.length - 1];
  const meta = pack.factsMeta || {};
  for (const [k, v] of Object.entries(item.facts || {})) if (meta[k] && meta[k].type !== 'num') return `${meta[k].label}: ${factText(meta[k], v)}`;
  return `It starts with “${item.name.charAt(0)}”`;
}

const ANSWERS = [2, 3, 4, 6];

export default register({
  id: 'mc', title: 'Multiple choice', icon: '🔤', blurb: 'Pick the right answer', tags: ['choice', 'quick'], kids: true,
  options: [
    { key: 'answers', label: 'Answers', type: 'choice', values: ANSWERS, default: 4, kidsValues: [2, 3], kidsDefault: 3 },
    { key: 'source', label: 'Question type', type: 'choice', values: ['mix', 'pictures', 'facts', 'questions'], labels: ['Mix', 'Pictures', 'Facts', 'Trivia'], default: 'mix', kidsDefault: 'pictures' },
  ],
  supports(info) {
    const c = info.caps || {};
    const facts = Object.values(c.facts || {}).filter(t => t !== 'text').length;
    if ((c.qkinds?.mc ?? info.questions ?? 0) > 0 || (c.img || 0) >= 4 || (facts && info.items >= 4)) return true;
    return 'Needs trivia questions, pictures or facts';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    let n = ANSWERS.includes(+opts.answers) ? +opts.answers : 4;
    if (kids) n = Math.min(n, 3);
    const src = opts.source || 'mix';
    const usable = packs.map(p => ({ p, s: sources(p, n, src, { kids, difficulty }).map(([k, w]) => [k, kids && /img|Img/.test(k) ? w * 3 : w]) }))
      .filter(x => x.s.length);
    if (!usable.length) return [];
    return collect(count, () => {
      const { p, s } = pickPack(rng, usable, x => Math.sqrt((x.p.items || []).length + (x.p.questions || []).length + 1));
      const [kind] = pickWeighted(rng, s);
      const q = kind === 'q' ? fromQuestion(rng, p, n, difficulty) : fromItems(rng, p, kind, n, difficulty);
      if (q) q.pack = p.id;
      return q;
    }, avoid);
  },
  render(el, q, api) {
    const imgs = q.data?.layout === 'images';
    const { answersEl } = layout(el, { prompt: q.prompt, media: q.media, compact: imgs });
    const grid = choiceGrid(answersEl, q.options, {
      images: imgs,
      onPick(i) {
        grid.lock();
        grid.mark(q.answer, i);
        api.answer({ correct: i === q.answer, given: i });
      },
    });
    return {
      destroy: () => grid.destroy(),
      timeout() { grid.lock(); grid.mark(q.answer, -1); },
      eliminate(k = 2) { grid.eliminate(q.answer, k, api.rng || Math.random); },
      choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x); },
    };
  },
});

function pickWeighted(rng, list) {
  const total = list.reduce((s, x) => s + x[1], 0);
  let r = rng() * total;
  for (const x of list) { r -= x[1]; if (r < 0) return x; }
  return list[list.length - 1];
}
