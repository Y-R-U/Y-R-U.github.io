import { register, poolItems, pickPack, byDifficulty, distractors, imageOf, fill, placeAnswer, collect, pick } from './registry.js?v=202610081215';
import { h, choiceGrid } from '../ui/kit.js?v=202610081215';
import { injectCSS, baseCSS, once, hasImg, timedZoom, zoomStart, fullAtOf, zoomOption } from './fkit.js?v=202610081215';

const CSS = `
.rx-pic{position:relative;flex:1 1 0;min-height:170px;border:var(--line) solid var(--ink);border-radius:var(--r);overflow:hidden;background:#1f1a4d;box-shadow:var(--shadow)}
.rx-pic::before{content:'';position:absolute;inset:-20px;background:var(--fill) center/cover;filter:blur(22px) saturate(1.2);opacity:.55}
.rx-pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.rx-q .q-body{flex:none}
@media (orientation:landscape) and (max-height:520px){.rx-q{flex-direction:row}.rx-q .rx-pic{flex:1 1 50%;min-height:0}.rx-q .q-body{flex:1 1 50%;justify-content:center}}
@media (min-width:900px) and (min-height:560px){.rx-q{flex-direction:row;max-width:1000px;align-items:center;gap:28px}.rx-q .rx-pic{flex:1 1 55%;height:min(62vh,540px)}.rx-q .q-body{flex:1 1 45%}}
`;

const MODES = ['full', 'zoom'];

const modeOf = m => (MODES.includes(m) ? m : 'full'); // old 'mix' | 'pixel' | 'tiles' → full

function make(rng, pack, mode, fullAt, n, difficulty) {
  const all = poolItems([pack]).filter(c => hasImg(c.item));
  const t = pick(rng, byDifficulty(all, difficulty, n, c => c.item.difficulty || 2));
  if (!t) return null;
  const wrong = distractors(rng, t, all, n - 1);
  if (!wrong) return null;
  const { options, answer } = placeAnswer(rng, t, wrong);
  return {
    format: 'reveal', id: `reveal:${t.ref}`, prompt: fill(t.item.nameImgPrompt || pack.nameImgPrompt || 'What is this?', { name: t.item.name }),
    options: options.map(c => ({ text: c.item.name })), answer, answerText: t.item.name, explain: t.item.blurb,
    refs: [t.ref, ...wrong.map(c => c.ref)], pack: pack.id,
    data: { img: imageOf(t.item, rng), mode, ...(mode === 'zoom' ? { fullAt } : {}) },
  };
}

export default register({
  id: 'reveal', title: 'Picture round', icon: '🖼️', blurb: 'Name the picture, fast', tags: ['kids'], kids: true,
  options: [
    { key: 'mode', label: 'Picture', type: 'choice', values: MODES, labels: ['Full image', 'Zoom'], default: 'full' },
    zoomOption(o => o.mode === 'zoom'),
    { key: 'answers', label: 'Answers', type: 'choice', values: [3, 4], default: 4, kidsValues: [3], kidsDefault: 3 },
  ],
  supports(info) {
    return (info.caps?.img || 0) >= 4 && info.items >= 4 ? true : 'Needs pictures';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 3 : +opts.answers === 3 ? 3 : 4;
    const mode = modeOf(opts.mode);
    const usable = packs.filter(p => (p.items || []).filter(hasImg).length >= n);
    if (!usable.length) return [];
    return collect(count, () => make(rng, pickPack(rng, usable), mode, fullAtOf(opts.fullAt), n, difficulty), avoid);
  },
  render(el, q, api) {
    injectCSS('f-reveal-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data;
    const answer = once(api);
    const pic = h('div.rx-pic');
    pic.style.setProperty('--fill', `url("${d.img.src.replace(/"/g, '%22')}")`);
    const im = h('img', { src: d.img.src, alt: '', referrerpolicy: 'no-referrer', draggable: 'false' });
    pic.append(im);
    const body = h('div.q-body', {}, h('h2.q-prompt', {}, q.prompt));
    const answersEl = h('div.q-answers');
    body.append(answersEl);
    el.append(h('div.q.has-media.rx-q', {}, pic, body));
    const zoom = modeOf(d.mode) === 'zoom'
      ? timedZoom(pic, im, d.img.src, api, { z0: zoomStart(q, api.kids), fullAt: d.fullAt, tag: '🔍 Zooming out' }) : null;
    const grid = choiceGrid(answersEl, q.options, {
      onPick(i) {
        grid.lock(); grid.mark(q.answer, i); done();
        answer({ correct: i === q.answer, given: i });
      },
    });
    function done() { pic.classList.add('done'); zoom?.finish(); }
    return {
      destroy() { zoom?.stop(); grid.destroy(); },
      timeout() { grid.lock(); grid.mark(q.answer, -1); done(); },
      eliminate(k = 2) { grid.eliminate(q.answer, k, api.rng || Math.random); },
      choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x); },
      // test hook
      zoomState: () => ({ zoom: !!zoom?.active, focus: zoom?.focus || null, transform: im.style.transform }),
    };
  },
});
