import { el, reducedMotion } from './dom.js?v=20261004c';
import { fmtCash } from '../state/format.js?v=20261004c';

export function createJuice({ root, target, audio }) {
  const layer = el('div', 'fx-layer');
  root.appendChild(layer);
  let live = 0;
  const floats = new Map();

  function targetPoint(node) {
    const r = (node || target()).getBoundingClientRect();
    return { x: r.left + Math.min(r.width, 120) * 0.35, y: r.top + r.height / 2 };
  }

  function coins(x, y, n = 3, { big = false, step = 0, to: toEl = null } = {}) {
    const to = targetPoint(toEl);
    if (reducedMotion()) { bump(toEl); return; }
    n = Math.min(n, 12 - live);
    for (let i = 0; i < n; i++) {
      const c = el('i', 'coin' + (big ? ' big' : ''));
      layer.appendChild(c);
      live++;
      const sx = x + (Math.random() - 0.5) * 24, sy = y + (Math.random() - 0.5) * 16;
      const lift = 60 + Math.random() * 60, dur = 520 + i * 45 + Math.random() * 80;
      const kf = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, e = t * t * (3 - 2 * t);
        const px = sx + (to.x - sx) * e, py = sy + (to.y - sy) * e - Math.sin(Math.PI * t) * lift;
        kf.push({ transform: `translate(${px}px, ${py}px) scale(${1 - 0.35 * t})`, opacity: t > 0.92 ? 0.4 : 1 });
      }
      const a = c.animate(kf, { duration: dur, delay: i * 40, easing: 'linear', fill: 'both' });
      a.onfinish = () => {
        c.remove();
        live--;
        bump(toEl);
        if (i === n - 1) audio?.sfx.tink(step);
      };
    }
  }

  function bump(node) {
    const t = node || target();
    t.classList.remove('bump');
    void t.offsetWidth;
    t.classList.add('bump');
  }

  function float(container, x, y, amount, { label = null, cls = '' } = {}) {
    let f = floats.get(container);
    const now = performance.now();
    if (f && now - f.t0 < 650 && f.cls === cls) {
      f.sum += amount || 0;
      f.n++;
      f.t0 = now;
      f.node.textContent = label ?? ('+' + fmtCash(f.sum) + (f.n > 1 ? ' ×' + f.n : ''));
      f.node.style.left = x + 'px';
      f.node.style.top = y + 'px';
      f.node.classList.remove('go');
      void f.node.offsetWidth;
      f.node.classList.add('go');
      clearTimeout(f.timer);
      f.timer = setTimeout(() => drop(container, f), 1000);
      return;
    }
    if (f) drop(container, f);
    const node = el('div', 'float ' + cls, label ?? '+' + fmtCash(amount));
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    container.appendChild(node);
    node.classList.add('go');
    f = { node, sum: amount || 0, n: 1, t0: now, cls };
    f.timer = setTimeout(() => drop(container, f), 1000);
    floats.set(container, f);
  }

  function drop(container, f) {
    clearTimeout(f.timer);
    f.node.classList.add('fade');
    setTimeout(() => f.node.remove(), 300);
    if (floats.get(container) === f) floats.delete(container);
  }

  function stamp(container, text, cls = '') {
    const s = el('div', 'stamp ' + cls, text);
    container.appendChild(s);
    audio?.sfx.stamp();
    setTimeout(() => s.remove(), cls ? 2300 : 1400);
  }

  function ring(node) {
    const r = el('i', 'ring-burst');
    node.appendChild(r);
    setTimeout(() => r.remove(), 500);
  }

  function shake(node) {
    if (reducedMotion()) return;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  return { coins, float, stamp, ring, shake, bump };
}
