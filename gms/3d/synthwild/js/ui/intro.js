// Voiced, skippable intro: Ken Burns stills + crossfades + subtitles, timed by the VO clips.
import { h } from './dom.js';
import { g } from './glyphs.js';
import { settings } from './settings.js';

const ASSETS = new URL('../../assets/intro/', import.meta.url).href;
const VO = new URL('../../audio/vo/', import.meta.url).href;
const voDir = () => VO + (settings.get('narrator') === 'female' ? 'female' : 'male') + '/';

export const LINES = [
  ['i01', 'seed', 'Not so very long from now, people stopped building things... and started growing them.'],
  ['i02', 'seed', 'A tiny seed could hold a whole design. Plant it, and the land would grow into its shape, block by block by block.'],
  ['i03', 'forest', 'Nature and machines grew into each other. Trees grew bark of carbon lattice, and leaves of solar film that drank the sunlight.'],
  ['i04', 'shore', 'Vines carried data like little rivers of light. The beaches turned to mirror sand...'],
  ['i05', 'ocean', '...and deep in the ocean, the kelp grew into servers, humming softly in the blue.'],
  ['i06', 'quiet', 'Then, one day, the growers went quiet. Nobody is quite sure where they went.'],
  ['i07', 'quiet', 'But the wild kept on growing.'],
  ['i08', 'wake', "And now, you're awake. You have a fabricator kit, and a suit that runs on light."],
  ['i09', 'night', 'When the sun goes down, your power starts to droop, so build somewhere bright before the night comes.'],
  ['i10', 'vista', 'This whole world is waiting for someone to look after it. Go on, grower. Plant your seed.'],
];
// Ken Burns moves per shot: [scale0, scale1, x0%, y0%, x1%, y1%]
const MOVES = {
  seed: [1.18, 1.04, 0, 3, 0, -1], forest: [1.04, 1.16, -2, 0, 3, -2], shore: [1.12, 1.03, 3, 0, -3, 0],
  ocean: [1.05, 1.15, 0, -2, 0, 2], quiet: [1.15, 1.05, -2, 2, 1, 0], wake: [1.03, 1.14, 0, 0, 0, -3],
  night: [1.14, 1.04, 2, -1, -2, 1], vista: [1.02, 1.12, -3, 1, 2, -1],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const manifests = new Map();
async function durations() {
  const dir = voDir();
  if (manifests.has(dir)) return manifests.get(dir);
  let m = {};
  try { const r = await fetch(dir + 'manifest.json', { cache: 'no-cache' }); if (r.ok) m = await r.json(); } catch {}
  manifests.set(dir, m);
  return m;
}

export function preloadIntro() {
  for (const s of new Set(LINES.map((l) => l[1]))) { const i = new Image(); i.onerror = () => {}; i.src = ASSETS + s + '.webp'; }
  durations();
}

export function playIntro(root, audio) {
  return new Promise(async (resolve) => {
    const shots = new Map();
    const stage = h('div');
    const sub = h('div.sub');
    const prog = h('div.prog');
    const end = h('div.endmark', {}, h('h1', {}, 'SYNTHWILD'));
    const skipBtn = h('button.sw-btn.small.glass.skip', { onclick: (e) => { e.stopPropagation(); finish(); } }, g('skip', 16), 'Skip');
    const el = h('div.sw-intro', {}, stage, h('div.grade'), end, sub, prog, skipBtn);
    let done = false, anim = 0;
    const finish = () => {
      if (done) return; done = true;
      audio?.stopVo?.();
      document.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(anim);
      el.style.transition = 'opacity .6s'; el.style.opacity = '0';
      setTimeout(() => { el.remove(); resolve(); }, 600);
    };
    const onKey = (e) => { e.preventDefault(); e.stopPropagation(); finish(); };
    el.addEventListener('pointerdown', () => finish());
    document.addEventListener('keydown', onKey, true);
    root.append(el);

    const mf = await durations();
    const dur = (k, text) => (mf[k + '.mp3']?.duration || text.split(' ').length / 2.4) * 1000;
    const total = LINES.reduce((a, [k, , t]) => a + dur(k, t) + 500, 0) + 3500;
    const t0 = performance.now();

    function shot(name) {
      if (!shots.has(name)) {
        const img = h('img', { src: ASSETS + name + '.webp', alt: '', onerror: () => { if (!img.dataset.fb) { img.dataset.fb = 1; img.src = ASSETS + 'forest.webp'; } } });
        const s = h('div.shot', {}, img);
        stage.append(s);
        shots.set(name, { el: s, img, start: 0 });
      }
      return shots.get(name);
    }
    let curShot = null, shotLen = 8000;
    function tick() {
      const now = performance.now();
      prog.style.width = Math.min(100, ((now - t0) / total) * 100) + '%';
      for (const [name, s] of shots) {
        if (!s.start) continue;
        const m = MOVES[name] || MOVES.vista;
        const k = Math.min(1, (now - s.start) / (s.len || shotLen));
        const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
        const sc = m[0] + (m[1] - m[0]) * e, x = m[2] + (m[4] - m[2]) * e, y = m[3] + (m[5] - m[3]) * e;
        s.img.style.transform = `translate(${x}%, ${y}%) scale(${sc})`;
      }
      if (!done) anim = requestAnimationFrame(tick);
    }
    anim = requestAnimationFrame(tick);
    audio?.music?.('intro');

    for (let i = 0; i < LINES.length && !done; i++) {
      const [key, name, text] = LINES[i];
      if (curShot !== name) {
        let len = 0;
        for (let j = i; j < LINES.length && LINES[j][1] === name; j++) len += dur(LINES[j][0], LINES[j][2]) + 650;
        const s = shot(name);
        s.start = performance.now(); s.len = len + 1800;
        for (const o of shots.values()) o.el.classList.toggle('on', o === s);
        curShot = name;
        await sleep(i === 0 ? 900 : 350);
      }
      if (done) break;
      sub.textContent = text;
      sub.classList.toggle('on', settings.get('subtitles'));
      const minT = sleep(dur(key, text) * 0.9);
      const hasVo = !!mf[key + '.mp3'];
      await Promise.all([audio?.vo && hasVo ? audio.vo(key) : sleep(dur(key, text)), minT]);
      sub.classList.remove('on');
      await sleep(i === 1 || i === 4 || i === 6 || i === 8 ? 700 : 300);
    }
    if (!done) {
      end.classList.add('on');
      await sleep(2600);
      finish();
    }
  });
}
