export const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const num = (n) => Math.round(n).toLocaleString('en-US');
export const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export const UI_ICON = {
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4.2" height="15" rx="1.4"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"/></svg>',
  coin: '<svg viewBox="0 0 24 24" class="coin"><circle cx="12" cy="12" r="10" fill="#ffc21a" stroke="#a86200" stroke-width="2"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#ffe680" stroke-width="1.6"/><path d="M12 7.6v8.8" stroke="#a86200" stroke-width="2.2" stroke-linecap="round"/></svg>',
  locker: '<svg viewBox="0 0 24 24"><path d="M8 3.5L4 5.5 2 10l3 1.5V21h14v-9.5L22 10l-2-4.5-4-2c-.6 1.8-2 2.8-4 2.8S8.6 5.3 8 3.5z"/></svg>',
  ladder: '<svg viewBox="0 0 24 24"><path d="M3 21v-7h5v7zM9.5 21V4h5v17zM16 21V9.5h5V21z"/></svg>',
  daily: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M2 6.5h20V10H2z"/><path d="M12 6.5V21" stroke="#0d1226" stroke-width="2.2"/><path d="M12 6.5C10 2 6 2.5 6.5 5 7 6.5 12 6.5 12 6.5zM12 6.5c2-4.5 6-4 5.5-1.5C17 6.5 12 6.5 12 6.5z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" fill-rule="evenodd"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 5l7 8h-4.5v6h-5v-6H5z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 19l7-8h-4.5V5h-5v6H5z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z"/></svg>',
};

// Sheets: in-game popups that never trap the player. Backdrop tap, the X and Escape all close.
export function createSheets(root, { onOpen = () => {}, onClose = () => {} } = {}) {
  const layer = h('<div class="sheet-layer hidden"><div class="sheet-back"></div></div>');
  root.appendChild(layer);
  let current = null;

  function close() {
    if (!current) return;
    const c = current;
    current = null;
    c.el.classList.add('out');
    layer.classList.add('closing');
    setTimeout(() => { c.el.remove(); if (!current) layer.classList.add('hidden'); layer.classList.remove('closing'); }, 180);
    try { c.onClose && c.onClose(); } catch (e) { console.error(e); }
    onClose(c.id);
  }

  function open(id, { title, cls = '', render, onClose: oc }) {
    if (current) { current.el.remove(); current = null; }
    const el = h(`<section class="sheet ${cls}" role="dialog" aria-label="${esc(title)}" data-sheet="${id}">
      <header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="sheet-x round" aria-label="Close">${UI_ICON.close}</button></header>
      <div class="sheet-body"></div></section>`);
    layer.appendChild(el);
    layer.classList.remove('hidden', 'closing');
    current = { id, el, onClose: oc };
    el.querySelector('.sheet-x').addEventListener('click', close);
    render(el.querySelector('.sheet-body'), { close, rerender: () => { const b = el.querySelector('.sheet-body'); b.innerHTML = ''; render(b, { close }); } });
    onOpen(id);
    return current;
  }

  layer.querySelector('.sheet-back').addEventListener('click', close);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) { e.preventDefault(); close(); } });
  return { open, close, get current() { return current && current.id; } };
}

// A button that asks once more before doing something irreversible, inside the same spot.
export function twoStep(btn, label2, action, ms = 3200) {
  const label1 = btn.innerHTML;
  let armed = 0;
  btn.addEventListener('click', () => {
    if (armed) { clearTimeout(armed); armed = 0; btn.classList.remove('armed'); btn.innerHTML = label1; action(); return; }
    btn.classList.add('armed');
    btn.innerHTML = label2;
    armed = setTimeout(() => { armed = 0; btn.classList.remove('armed'); btn.innerHTML = label1; }, ms);
  });
}

export function countUp(el, from, to, ms = 900, fmt = num, onDone) {
  const t0 = performance.now();
  const stepF = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(stepF); else if (onDone) onDone();
  };
  if (ms <= 0) { el.textContent = fmt(to); if (onDone) onDone(); } else requestAnimationFrame(stepF);
}
