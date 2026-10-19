// Story scene overlay (DATA.story.scenes[id] = [{who, text}], cast = {who: {name, title, color}}). Tap to advance.
import { h } from './dom.js';
import { data } from '../app/data.js';

let skipAll = false;
export const setSkipScenes = (b) => { skipAll = !!b; };   // dev mode: story scenes resolve immediately

export function playScene(id) {
  if (skipAll) return Promise.resolve(false);
  const lines = data().story?.scenes?.[id];
  if (!lines?.length) return Promise.resolve(false);
  const cast = data().story?.cast || {};
  return new Promise((resolve) => {
    let i = 0, typing = null, full = '';
    const name = h('div.dl-name'), title = h('small.dl-title'), text = h('div.dl-text'), face = h('div.dl-face');
    const box = h('div.dl-box.vp-panel', { '--cut': '14px' }, h('div.dl-head', face, h('div', name, title)), text, h('div.dl-next', '▼'));
    const skip = h('button.dl-skip', { type: 'button', onclick: (e) => { e.stopPropagation(); done(); } }, 'Skip ››');
    const wrap = h('div.dl-wrap', { onclick: next }, skip, box);
    document.getElementById('overlay-root').appendChild(wrap);
    function show() {
      const l = lines[i], c = cast[l.who] || {};
      const sys = l.who === 'sys' || !cast[l.who];
      box.classList.toggle('sys', sys);
      box.style.setProperty('--bc', c.color || 'var(--cyan)');
      name.textContent = sys ? (l.who === 'sys' ? 'SYSTEM' : String(l.who).toUpperCase()) : c.name;
      title.textContent = sys ? '' : (c.title || '');
      face.textContent = sys ? '>_' : (c.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
      full = l.text; text.textContent = '';
      let k = 0; clearInterval(typing);
      typing = setInterval(() => { k += 2; text.textContent = full.slice(0, k); if (k >= full.length) { clearInterval(typing); typing = null; } }, 16);
    }
    function next() {
      if (typing) { clearInterval(typing); typing = null; text.textContent = full; return; }
      if (++i >= lines.length) return done();
      show();
    }
    function done() { clearInterval(typing); wrap.remove(); resolve(true); }
    show();
  });
}
