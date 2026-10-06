export function h(tag, attrs = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

export function emitter() {
  const map = new Map();
  return {
    on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); return () => map.get(ev)?.delete(fn); },
    off(ev, fn) { map.get(ev)?.delete(fn); },
    emit(ev, ...args) { for (const fn of [...(map.get(ev) || [])]) { try { fn(...args); } catch (e) { console.error('[ui]', ev, e); } } },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function animEnd(el, fallbackMs = 1200) {
  return new Promise((r) => {
    let done = false;
    const fin = () => { if (!done) { done = true; el.removeEventListener('animationend', fin); r(); } };
    el.addEventListener('animationend', fin);
    setTimeout(fin, fallbackMs);
  });
}

// Press feedback that works for mouse + touch and fires on pointerdown (snappier for kids).
export function pressable(el, onPress, { sfx } = {}) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    el.classList.add('is-pressed');
  });
  const up = () => el.classList.remove('is-pressed');
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('click', (e) => { if (!el.disabled && !el.classList.contains('is-locked')) onPress?.(e); });
  return el;
}
