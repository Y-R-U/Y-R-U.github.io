import { register, poolItems, pickPack, byDifficulty, imageOf, hasImg, fill, collect, distractors, pick, factAllowed, nested } from './registry.js?v=202610071324';
import { layout, choiceGrid } from '../ui/kit.js?v=202610071324';

function sources(pack, gate) {
  const out = [];
  const items = pack.items || [];
  if ((pack.questions || []).some(q => q.kind === 'tf')) out.push(['q', 3]);
  if (items.filter(hasImg).length >= 3) out.push(['img', 1.5]);
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if (!factAllowed(m, gate)) continue;
    const has = items.filter(it => it.facts && it.facts[key] != null);
    if (m.type === 'bool' && has.length >= 2 && (m.stmt || m.yes)) out.push([`bool:${key}`, 1]);
    if (m.type === 'cat' && m.exclusive !== false && new Set(has.map(it => String(it.facts[key]))).size >= 2) out.push([`cat:${key}`, 1.2]);
  }
  return out;
}

function make(rng, pack, kind, difficulty) {
  if (kind === 'q') {
    const qs = byDifficulty((pack.questions || []).filter(q => q.kind === 'tf'), difficulty, 1);
    const q = pick(rng, qs);
    return {
      format: 'tf', id: `tf:${pack.id}/q:${q.id}`, prompt: q.prompt, media: q.media && Object.keys(q.media).length ? q.media : undefined,
      answer: !!q.answer, answerText: q.answer ? 'True' : 'False', explain: q.explain, refs: [`${pack.id}/q:${q.id}`],
    };
  }
  const all = poolItems([pack]);
  if (kind === 'img') {
    const pool = all.filter(c => hasImg(c.item));
    const t = pick(rng, byDifficulty(pool, difficulty, 3, c => c.item.difficulty || 2));
    const truth = rng() < 0.5;
    let shown = t;
    if (!truth) {
      const w = distractors(rng, t, pool, 1);
      if (!w) return null;
      shown = w[0];
    }
    const tpl = t.item.tfImgPrompt || pack.tfImgPrompt || 'This is {aName}.';
    return {
      format: 'tf', id: `tf:img:${t.ref}:${shown.item.id}`, prompt: fill(tpl, { name: t.item.name, lname: t.item.lname }),
      media: { img: [imageOf(shown.item, rng)] }, answer: truth,
      answerText: truth ? 'True' : `False: this is ${shown.item.name}`, explain: shown.item.blurb, refs: [t.ref, shown.ref],
    };
  }
  const [type, key] = kind.split(':');
  const meta = pack.factsMeta[key];
  const pool = all.filter(c => c.item.facts?.[key] != null);
  const t = pick(rng, byDifficulty(pool, difficulty, 2, c => c.item.difficulty || 2));
  const v = t.item.facts[key];
  if (type === 'bool') {
    const stmt = meta.stmt || `{name}: ${String(meta.yes).toLowerCase()}.`;
    return {
      format: 'tf', id: `tf:bool:${key}:${t.ref}`, prompt: fill(stmt, { name: t.item.name, lname: t.item.lname, label: meta.label }),
      answer: v === true, answerText: v ? 'True' : 'False', explain: t.item.blurb, refs: [t.ref],
    };
  }
  const vals = [].concat(v).map(String);
  const truth = rng() < 0.5;
  let value = pick(rng, vals);
  if (!truth) {
    const others = [...new Set(pool.flatMap(c => [].concat(c.item.facts[key]).map(String)))].filter(x => !vals.includes(x) && !vals.some(y => nested(x, y)));
    if (!others.length) return null;
    value = pick(rng, others);
  }
  const stmt = meta.stmt || `{name}: {llabel} is {value}.`;
  return {
    format: 'tf', id: `tf:cat:${key}:${t.ref}:${value}`, prompt: fill(stmt, { name: t.item.name, lname: t.item.lname, label: meta.label, value }),
    answer: truth, answerText: truth ? 'True' : `False: ${vals.join(', ')}`, explain: t.item.blurb, refs: [t.ref],
  };
}

export default register({
  id: 'tf', title: 'True or false', icon: '⚖️', blurb: 'Quick-fire true or false', tags: ['choice', 'quick'], kids: true,
  options: [],
  supports(info) {
    const c = info.caps || {};
    if ((c.qkinds?.tf || 0) > 0 || (c.img || 0) >= 3) return true;
    if (Object.values(c.facts || {}).some(t => t === 'bool' || t === 'cat')) return true;
    return 'Needs true/false questions, pictures or category facts';
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
      if (q) q.pack = p.id;
      return q;
    }, avoid);
  },
  render(el, q, api) {
    const { answersEl } = layout(el, { prompt: q.prompt, media: q.media, big: true });
    const opts = [{ text: 'True', cls: 'tf-true', icon: '✔' }, { text: 'False', cls: 'tf-false', icon: '✘' }];
    const right = q.answer ? 0 : 1;
    const grid = choiceGrid(answersEl, opts, {
      tf: true,
      onPick(i) { grid.lock(); grid.mark(right, i); api.answer({ correct: i === right, given: i === 0 }); },
    });
    return {
      destroy: () => grid.destroy(),
      timeout() { grid.lock(); grid.mark(right, -1); },
      choose(x) { grid.pick(x === 'correct' ? right : x === 'wrong' ? 1 - right : x === true || x === 'true' || x === 0 ? 0 : 1); },
    };
  },
});
