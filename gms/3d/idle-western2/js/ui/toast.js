import { el } from './dom.js?v=20261004g';

// Hero toasts live in the band between the hero's central 50% box and the label/qty row (right-aligned, clear of
// the 🎹); with the hero away they move to the root, just under the HUD. At most 2, fewer if the band is short.
const LIFT = 60, GAP = 4, ROW = 26;

export function createToasts(root, hero) {
  const box = el('div', 'toasts');
  box.setAttribute('aria-live', 'polite');
  (hero || root).appendChild(box);

  let side = '', steerAt = 0;
  function setSide(k) {
    if (k === side) return;
    if (side) box.classList.remove(side);
    side = k;
    if (k) box.classList.add(k);
  }
  function remove(t) {
    t.classList.add('out');
    setTimeout(() => t.remove(), 350);
  }
  function cap() {
    if (box.parentNode !== hero) return 2;
    const band = hero.clientHeight * 0.25 - LIFT;
    return band >= ROW * 2 + GAP ? 2 : 1;
  }

  return {
    toast(text, { ms = 2000, cls = '' } = {}) {
      for (const t of box.children) if (t.textContent === text) remove(t);
      const live = () => [...box.children].filter((t) => !t.classList.contains('out'));
      while (live().length >= cap()) live()[0].remove();
      const t = el('div', 'toast ' + cls, text);
      box.appendChild(t);
      setTimeout(() => remove(t), ms);
      return t;
    },
    place(heroOn) {
      const want = heroOn && hero ? hero : root;
      if (box.parentNode !== want) want.appendChild(box);
    },
    // PT2#10: keep the hero stack off speech bubbles and chips (hero-px rects): bottom-right, else bottom-left (clear
    // of the 🎹), else hidden until the way is clear. Measured at most ~8×/s and only while a toast is up.
    steer(rectsFn) {
      const now = performance.now();
      if (now - steerAt < 120) return;
      steerAt = now;
      if (box.parentNode !== hero || !box.children.length) { setSide(''); return; }
      const obs = rectsFn().filter(Boolean);
      if (!obs.length) { setSide(''); return; }
      const W = hero.clientWidth, H = hero.clientHeight, bw = box.offsetWidth, bh = box.offsetHeight, b = H - LIFT;
      const at = { '': { l: W - 10 - bw, r: W - 10 }, left: { l: 58, r: 58 + bw } };
      const hit = (k) => obs.some((o) => at[k].l < o.r && at[k].r > o.l && b - bh < o.b && b > o.t);
      for (const k of [side === 'hush' ? '' : side, '', 'left']) if (!hit(k)) { setSide(k); return; }
      setSide('hush');
    },
    cardToast(card, text) {
      const old = card.querySelector('.card-toast');
      if (old) old.remove();
      const t = el('div', 'card-toast', text);
      card.appendChild(t);
      setTimeout(() => t.remove(), 1700);
    },
  };
}
