import { register, poolItems, pickPack, byDifficulty, distractors, imageOf, fill, placeAnswer, collect, pick, shuffle } from './registry.js?v=1';
import { h, choiceGrid } from '../ui/kit.js?v=1';
import { injectCSS, baseCSS, stages, stretchTimer, once, hasImg } from './fkit.js?v=1';

const CSS = `
.rx-pic{position:relative;flex:1 1 0;min-height:170px;border:var(--line) solid var(--ink);border-radius:var(--r);overflow:hidden;background:#1f1a4d;box-shadow:var(--shadow)}
.rx-pic::before{content:'';position:absolute;inset:-20px;background:var(--fill) center/cover;filter:blur(22px) saturate(1.2);opacity:.55}
.rx-pic canvas,.rx-pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.rx-pic canvas{image-rendering:pixelated}
.rx-pic img.zoom{transition:transform .6s cubic-bezier(.3,1,.4,1),filter .4s}
.rx-tiles{position:absolute;inset:0;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr)}
.rx-tiles i{background:linear-gradient(135deg,var(--grape),#5a3fe0);border:1px solid rgba(255,255,255,.25);transition:opacity .35s,transform .35s}
.rx-tiles i:nth-child(3n){background:linear-gradient(135deg,var(--coral),#e04545)}
.rx-tiles i:nth-child(4n+1){background:linear-gradient(135deg,var(--sky),#2d82d6)}
.rx-tiles i.off{opacity:0;transform:scale(.6) rotate(8deg)}
.rx-meter{position:absolute;left:10px;top:10px;z-index:2;display:flex;gap:4px;padding:4px 6px;background:rgba(255,255,255,.88);border:2px solid var(--ink);border-radius:999px}
.rx-meter i{width:10px;height:10px;border-radius:50%;background:#ddd;border:2px solid var(--ink)}
.rx-meter i.on{background:var(--sun)}
.rx-pic .f-more{position:absolute;right:10px;bottom:10px;z-index:2}
.rx-pic.done img.zoom{transform:none!important;filter:none!important}
.rx-q .q-body{flex:none}
@media (orientation:landscape) and (max-height:520px){.rx-q{flex-direction:row}.rx-q .rx-pic{flex:1 1 50%;min-height:0}.rx-q .q-body{flex:1 1 50%;justify-content:center}}
@media (min-width:900px) and (min-height:560px){.rx-q{flex-direction:row;max-width:1000px;align-items:center;gap:28px}.rx-q .rx-pic{flex:1 1 55%;height:min(62vh,540px)}.rx-q .q-body{flex:1 1 45%}}
`;

const STAGES = 6;
const PIX = [12, 18, 26, 38, 56, 90];    // cells across the image, per stage (then full)
const ZOOM = [7, 4.6, 3, 2, 1.45, 1.12];
const TILES = [2, 4, 6, 9, 12, 14];

function make(rng, pack, mode, n, difficulty, kids) {
  const all = poolItems([pack]).filter(c => hasImg(c.item));
  const t = pick(rng, byDifficulty(all, difficulty, n, c => c.item.difficulty || 2));
  if (!t) return null;
  const wrong = distractors(rng, t, all, n - 1);
  if (!wrong) return null;
  const { options, answer } = placeAnswer(rng, t, wrong);
  const m = mode === 'mix' ? pick(rng, kids ? ['tiles', 'pixel'] : ['pixel', 'zoom', 'tiles']) : mode;
  return {
    format: 'reveal', id: `reveal:${t.ref}`, prompt: fill(t.item.nameImgPrompt || pack.nameImgPrompt || 'What is this?', { name: t.item.name }),
    options: options.map(c => ({ text: c.item.name })), answer, answerText: t.item.name, explain: t.item.blurb,
    refs: [t.ref, ...wrong.map(c => c.ref)], pack: pack.id, stages: STAGES,
    data: { img: imageOf(t.item, rng), mode: m, focus: [0.3 + rng() * 0.4, 0.3 + rng() * 0.4], order: shuffle(rng, [...Array(16).keys()]) },
  };
}

// Loads with CORS when the host allows it; otherwise plain (drawing a tainted image to a canvas still displays fine).
function loadImg(src) {
  return new Promise(res => {
    const a = new Image();
    a.crossOrigin = 'anonymous';
    a.referrerPolicy = 'no-referrer';
    a.onload = () => res(a);
    a.onerror = () => {
      const b = new Image();
      b.referrerPolicy = 'no-referrer';
      b.onload = () => res(b);
      b.onerror = () => res(null);
      b.src = src;
    };
    a.src = src;
  });
}

export default register({
  id: 'reveal', title: 'Picture reveal', icon: '🖼️', blurb: 'Guess before it’s clear', tags: ['kids'], kids: true,
  options: [
    { key: 'mode', label: 'Reveal', type: 'choice', values: ['mix', 'pixel', 'zoom', 'tiles'], labels: ['Mix', 'Pixels', 'Zoom', 'Tiles'], default: 'mix' },
    { key: 'answers', label: 'Answers', type: 'choice', values: [3, 4], default: 4, kidsValues: [3], kidsDefault: 3 },
  ],
  supports(info) {
    return (info.caps?.img || 0) >= 4 && info.items >= 4 ? true : 'Needs pictures';
  },
  generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
    const n = kids ? 3 : +opts.answers === 3 ? 3 : 4;
    const mode = ['mix', 'pixel', 'zoom', 'tiles'].includes(opts.mode) ? opts.mode : 'mix';
    const usable = packs.filter(p => (p.items || []).filter(hasImg).length >= n);
    if (!usable.length) return [];
    return collect(count, () => make(rng, pickPack(rng, usable), mode, n, difficulty, kids), avoid);
  },
  render(el, q, api) {
    injectCSS('f-reveal-css', CSS); baseCSS();
    el.innerHTML = '';
    const d = q.data;
    const answer = once(api);
    const pic = h('div.rx-pic');
    pic.style.setProperty('--fill', `url("${d.img.src.replace(/"/g, '%22')}")`);
    const meter = h('div.rx-meter', {}, ...Array.from({ length: q.stages || STAGES }, () => h('i')));
    const body = h('div.q-body', {}, h('h2.q-prompt', {}, q.prompt));
    const answersEl = h('div.q-answers');
    body.append(answersEl);
    el.append(h('div.q.has-media.rx-q', {}, pic, body));
    pic.append(meter);
    let img = null, canvas = null, tiles = null, finished = false, cur = 0, loaded = false;
    const ready = loadImg(d.img.src).then(a => { img = a; loaded = true; build(); paint(cur); });
    function build() {
      if (d.mode === 'pixel' && img) {
        canvas = h('canvas');
        pic.prepend(canvas);
      } else {
        const el2 = h('img.zoom', { src: d.img.src, alt: '', referrerpolicy: 'no-referrer', draggable: 'false' });
        pic.prepend(el2);
        if (d.mode === 'tiles') { tiles = h('div.rx-tiles', {}, ...Array.from({ length: 16 }, () => h('i'))); el2.after(tiles); }
      }
    }
    function paint(s) {
      cur = s;
      [...meter.children].forEach((x, i) => x.classList.toggle('on', i <= s));
      const full = finished;
      if (d.mode === 'pixel') {
        if (canvas && img) {
          try {
            const box = pic.getBoundingClientRect();
            const dpr = Math.min(2, devicePixelRatio || 1);
            const W = Math.max(1, Math.round(box.width * dpr)), H = Math.max(1, Math.round(box.height * dpr));
            canvas.width = W; canvas.height = H;
            const g = canvas.getContext('2d');
            const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
            const dw = img.naturalWidth * k, dh = img.naturalHeight * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
            g.clearRect(0, 0, W, H);
            if (full) { g.imageSmoothingEnabled = true; g.drawImage(img, dx, dy, dw, dh); return; }
            const cells = PIX[Math.min(s, PIX.length - 1)];
            const sw = Math.max(1, cells), shh = Math.max(1, Math.round(cells * dh / dw));
            const off = document.createElement('canvas');
            off.width = sw; off.height = shh;
            off.getContext('2d').drawImage(img, 0, 0, sw, shh);
            g.imageSmoothingEnabled = false;
            g.drawImage(off, dx, dy, dw, dh);
          } catch (e) {
            canvas.remove(); canvas = null; d.mode = 'blur'; build(); paint(s);
          }
        } else if (loaded && !img) {
          d.mode = 'blur'; build(); paint(s);
        }
        return;
      }
      const im = pic.querySelector('img.zoom');
      if (!im) return;
      if (d.mode === 'zoom') {
        im.style.transformOrigin = `${d.focus[0] * 100}% ${d.focus[1] * 100}%`;
        im.style.transform = full ? 'none' : `scale(${ZOOM[Math.min(s, ZOOM.length - 1)]})`;
      } else if (d.mode === 'blur') {
        im.style.filter = full ? 'none' : `blur(${[28, 18, 11, 6, 3, 1.5][Math.min(s, 5)]}px)`;
        im.style.transform = full ? 'none' : 'scale(1.08)';
      } else if (tiles) {
        const open = full ? 16 : TILES[Math.min(s, TILES.length - 1)];
        [...tiles.children].forEach((t, i) => t.classList.toggle('off', d.order.indexOf(i) < open));
      }
    }
    const st = stages(api, q, el, s => { if (s > cur) api.sfx('reveal'); paint(s); });
    if (st.button) pic.append(st.button);
    if (!st.native) stretchTimer(api, el, 2);
    const onResize = () => paint(cur);
    addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paint(cur)) : null;
    ro && ro.observe(pic);
    const grid = choiceGrid(answersEl, q.options, {
      onPick(i) {
        grid.lock(); grid.mark(q.answer, i); st.lock(); done();
        answer({ correct: i === q.answer, given: i, detail: { stage: st.stage }, ...(i === q.answer ? st.points() : {}) });
      },
    });
    function done() { finished = true; pic.classList.add('done'); ready.then(() => paint(cur)); paint(cur); }
    return {
      destroy() { grid.destroy(); st.destroy(); removeEventListener('resize', onResize); ro && ro.disconnect(); },
      timeout() { grid.lock(); grid.mark(q.answer, -1); st.lock(); done(); },
      eliminate(k = 2) { grid.eliminate(q.answer, k, api.rng || Math.random); },
      choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x); },
    };
  },
});
