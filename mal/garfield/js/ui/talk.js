import { h } from './util.js';

// Speech bubbles (Jon), thought clouds (Garfield) and a subtitle fallback strip.
// anchor: {x,y} in CSS px, or a function returning {x,y} | null each frame (null/offscreen → subtitle).
export function createTalk(ui) {
  const layer = h('div.talk-layer');
  const subs = h('div.subs');
  let alive = [];
  let raf = 0;

  function readAnchor(b) {
    const a = typeof b.anchor === 'function' ? safe(b.anchor) : b.anchor;
    if (!a || !isFinite(a.x) || !isFinite(a.y)) return null;
    const W = innerWidth, H = innerHeight;
    if (a.x < 0 || a.x > W || a.y < 0 || a.y > H || a.behind) return null;
    return a;
  }
  const safe = (f) => { try { return f(); } catch { return null; } };

  function place(b) {
    const a = readAnchor(b);
    if (!a) {
      b.el.classList.add('off');
      b.sub.classList.toggle('hide', !ui.settings.get().subtitles);
      b.sub.classList.add('show');
      return;
    }
    b.el.classList.remove('off');
    b.sub.classList.remove('show');
    const W = innerWidth, bw = b.el.offsetWidth, bh = b.el.offsetHeight;
    const half = bw / 2, pad = 10;
    const x = Math.max(half + pad, Math.min(W - half - pad, a.x));
    const top = document.documentElement.classList.contains('ui-cutscene') ? innerHeight * 0.12 : 0;
    const y = Math.max(top + bh + pad + 24, a.y);
    b.el.style.left = x + 'px';
    b.el.style.top = y + 'px';
    b.el.style.setProperty('--tail', (a.x - x) + 'px');
  }

  function loop() {
    raf = 0;
    for (const b of alive) place(b);
    if (alive.length) raf = requestAnimationFrame(loop);
  }

  function say({ who = 'jon', text = '', thought = who === 'garfield', dur, anchor = null, until = null } = {}) {
    const name = ui.names.get(who);
    const msg = ui.names.fill(text);
    if (dur == null) dur = Math.min(7, 1.6 + msg.length * 0.055);
    for (const o of alive.filter((o) => o.who === who)) o.close();

    const kind = thought ? 'thought' : 'speech';
    const el = h(`div.bubble.${kind}.who-${who}`, {},
      h('div.bubble-name', {}, name),
      h('div.bubble-text', {}, msg),
      thought ? h('div.thought-dots', {}, h('i'), h('i'), h('i')) : h('div.speech-tail'),
    );
    const sub = h(`div.sub-line.who-${who}${thought ? '.thought' : ''}`, {}, h('b', {}, name + (thought ? ' (thinks)' : '') + ':'), ' ', msg);
    if (!anchor) el.classList.add('off');
    layer.append(el);
    subs.append(sub);

    let resolve;
    const p = new Promise((r) => (resolve = r));
    const b = { who, el, sub, anchor, close: null };
    let closed = false;
    b.close = () => {
      if (closed) return; closed = true;
      alive = alive.filter((o) => o !== b);
      el.classList.add('bye'); sub.classList.add('bye');
      setTimeout(() => { el.remove(); sub.remove(); }, 260);
      resolve();
    };
    alive.push(b);
    place(b);
    requestAnimationFrame(() => { el.classList.add('in'); });
    const timer = setTimeout(b.close, dur * 1000);
    if (until?.then) until.then(() => { clearTimeout(timer); b.close(); }, () => {});
    if (!raf) raf = requestAnimationFrame(loop);
    p.close = b.close;
    return p;
  }

  function clear() { for (const b of [...alive]) b.close(); }
  return { layer, subs, say, clear };
}
