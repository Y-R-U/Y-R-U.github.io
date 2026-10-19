// Light first-session hints: a pulsing ring around a real control plus a short callout. Each hint shows once
// (remembered in settings.hints) and only while the player is in the first three contracts.
import { h } from './dom.js';

const EARLY = ['m1_l1', 'm1_l2', 'm1_l3'];
let cur = null;

export function tutorialActive(store) {
  if (store.settings.hints === false) return false;
  return EARLY.some((id) => !store.levelStars(id));
}
export const hintSeen = (store, key) => !!store.settings.hintsSeen?.[key];
function markSeen(store, key) { store.setSetting('hintsSeen', { ...(store.settings.hintsSeen || {}), [key]: true }); }

// hint(store, key, anchor (element|selector), text, {place:'above'|'below', delay}) -> close()
export function hint(store, key, anchor, text, { place = 'above', delay = 350, force = false, life = 0, compact = false, width = 300 } = {}) {
  if (!force && (!tutorialActive(store) || hintSeen(store, key))) return () => {};
  let closed = false, timer = 0, ring = null, tip = null, raf = 0;
  const close = (seen = true) => {
    if (closed) return; closed = true;
    clearTimeout(timer); cancelAnimationFrame(raf);
    ring?.remove(); tip?.remove();
    removeEventListener('pointerdown', onDown, true);
    if (seen) markSeen(store, key);
    if (cur === close) cur = null;
  };
  const onDown = (e) => { if (!tip?.contains(e.target)) close(); };
  timer = setTimeout(() => {
    const el = typeof anchor === 'string' ? document.querySelector(anchor) : anchor;
    if (!el?.isConnected) { closed = true; return; }
    cur?.(false); cur = close;
    const host = document.getElementById('overlay-root');
    ring = h('div.tut-ring' + (compact ? '.nodim' : ''));
    tip = h('div.tut-tip.' + place + (compact ? '.compact' : ''), { onclick: () => close() }, h('div.tut-k', 'Field manual'), h('div.tut-t', text), h('small', 'Tap to dismiss'));
    host.append(ring, tip);
    const place_ = () => {
      if (closed) return;
      if (!el.isConnected) return close(false);
      const a = document.getElementById('app').getBoundingClientRect(), r = el.getBoundingClientRect();
      const x = r.left - a.left, y = r.top - a.top;
      Object.assign(ring.style, { left: x - 4 + 'px', top: y - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      const tw = Math.min(a.width - 24, width);
      const cx = Math.max(12, Math.min(a.width - tw - 12, x + r.width / 2 - tw / 2));
      tip.style.width = tw + 'px'; tip.style.left = cx + 'px';
      tip.style.setProperty('--ax', Math.max(14, Math.min(tw - 14, x + r.width / 2 - cx)) + 'px');
      const below = place === 'below' || y - tip.offsetHeight - 16 < 8;
      tip.classList.toggle('below', below); tip.classList.toggle('above', !below);
      tip.style.top = (below ? y + r.height + 14 : y - tip.offsetHeight - (compact ? 10 : 14)) + 'px';
      raf = requestAnimationFrame(place_);
    };
    place_();
    addEventListener('pointerdown', onDown, true);
    if (life) timer = setTimeout(() => close(), life);
  }, delay);
  return close;
}

export function closeHints() { cur?.(false); }
