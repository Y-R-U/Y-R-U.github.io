import { h, sleep, pressable } from './util.js';

export function createFx(ui) {
  const fadeEl = h('div.fade');
  const skipBtn = pressable(h('button.skip-btn', {}, 'Skip ', h('span.skip-arrows', {}, '▸▸')), () => { ui.emit('sfx', 'click'); ui.emit('skip'); });
  const lbTop = h('div.lb.lb-top'), lbBot = h('div.lb.lb-bot');
  const letterboxEl = h('div.letterbox', {}, lbTop, lbBot, skipBtn);
  const toasts = h('div.toasts');

  let fadeRes = null;
  function fade(toBlack = true, dur = 0.5) {
    fadeRes?.();
    fadeEl.style.transitionDuration = dur + 's';
    void fadeEl.offsetWidth;
    fadeEl.classList.toggle('on', !!toBlack);
    return new Promise((r) => {
      fadeRes = r;
      setTimeout(() => { if (fadeRes === r) { fadeRes = null; r(); } }, dur * 1000 + 30);
    });
  }

  function letterbox(on = true, { skippable = true } = {}) {
    letterboxEl.classList.toggle('on', !!on);
    skipBtn.classList.toggle('show', !!on && skippable);
    document.documentElement.classList.toggle('ui-cutscene', !!on);
    if (!on) ui.talk.clear?.();
  }

  function toast(text, { dur = 2.4, icon = '' } = {}) {
    const t = h('div.toast', {}, icon ? h('span.toast-ico', { html: icon }) : null, h('span', {}, ui.names.fill(text)));
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 350); }, dur * 1000);
  }

  const skip = { show(on = true) { skipBtn.classList.toggle('show', !!on); letterboxEl.classList.toggle('skip-only', !!on && !letterboxEl.classList.contains('on')); } };
  return { fadeEl, letterboxEl, toasts, fade, letterbox, toast, skip };
}

const CONF_COLS = ['#f7931e', '#ffc83d', '#e8452c', '#5fae3a', '#fffaf0', '#5a3418', '#ff8fb1'];
export function confetti(host, { count = 140, dur = 3.2 } = {}) {
  const c = h('canvas.confetti');
  host.append(c);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const ps = Array.from({ length: count }, (_, i) => ({
    x: W * (0.2 + Math.random() * 0.6), y: H * 0.42 + Math.random() * 20,
    vx: (Math.random() - 0.5) * W * 1.1, vy: -H * (0.7 + Math.random() * 0.9),
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
    w: 7 + Math.random() * 8, hh: 4 + Math.random() * 5, col: CONF_COLS[i % CONF_COLS.length],
    paw: Math.random() < 0.12,
  }));
  let t0 = performance.now(), last = t0, stop = false;
  function frame(now) {
    if (stop) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const age = (now - t0) / 1000;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, Math.min(1, (dur - age) / 0.6));
    for (const p of ps) {
      p.vy += H * 1.5 * dt; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.col;
      if (p.paw) {
        g.beginPath(); g.ellipse(0, 2, 6, 5, 0, 0, 7); g.fill();
        for (const [ax, ay] of [[-6, -4], [-2, -7], [2, -7], [6, -4]]) { g.beginPath(); g.arc(ax, ay, 2.2, 0, 7); g.fill(); }
      } else {
        g.scale(1, Math.cos(p.r * 2.3));
        g.beginPath(); g.roundRect ? g.roundRect(-p.w / 2, -p.hh / 2, p.w, p.hh, 2) : g.rect(-p.w / 2, -p.hh / 2, p.w, p.hh); g.fill();
      }
      g.restore();
    }
    if (age < dur) requestAnimationFrame(frame); else c.remove();
  }
  requestAnimationFrame(frame);
  return () => { stop = true; c.remove(); };
}

export { sleep };
