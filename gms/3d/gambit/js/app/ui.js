// Small DOM helpers shared by all screens: escaping, toasts, dialogs, sheets.
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const fmtInt = n => Math.round(n).toLocaleString('en-US');

// Avatar: emoji / short text, or an image URL.
export const LION = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon fill="currentColor" points="12.00,0.80 13.91,3.62 16.86,1.91 17.36,5.28 20.76,5.02 19.75,8.27 22.92,9.51 20.60,12.00 22.92,14.49 19.75,15.73 20.76,18.98 17.36,18.72 16.86,22.09 13.91,20.38 12.00,23.20 10.09,20.38 7.14,22.09 6.64,18.72 3.24,18.98 4.25,15.73 1.08,14.49 3.40,12.00 1.08,9.51 4.25,8.27 3.24,5.02 6.64,5.28 7.14,1.91 10.09,3.62"/><path fill="#0c162b" d="M12 5.6c3.4 0 5.6 2.6 5.6 5.7 0 3.6-2.6 6.9-5.6 6.9s-5.6-3.3-5.6-6.9c0-3.1 2.2-5.7 5.6-5.7z"/><circle cx="9.7" cy="10.6" r=".95" fill="currentColor"/><circle cx="14.3" cy="10.6" r=".95" fill="currentColor"/><path fill="currentColor" d="M10.4 13.1h3.2L12 15.2z"/><path d="M10.2 16.3q1.8 1.1 3.6 0" stroke="currentColor" stroke-width=".9" fill="none" stroke-linecap="round"/></svg>';
export function avatar(av, { hue = 30, size = 'md', label = '' } = {}) {
  if (av === 'lion') return `<span class="av av-${size} av-lion" title="${esc(label)}">${LION}</span>`;
  const isImg = typeof av === 'string' && /\.(png|jpe?g|webp|svg)$|^data:/.test(av);
  const style = `--av-h:${hue}`;
  if (isImg) return `<span class="av av-${size}" style="${style}"><img src="${esc(av)}" alt=""></span>`;
  const text = av || (label ? label.slice(0, 2).toUpperCase() : '?');
  return `<span class="av av-${size}${av ? '' : ' av-txt'}" style="${style}">${esc(text)}</span>`;
}

// ---------- toast ----------
let toastTimer = null;
export function toast(msg, { ms = 2200, kind = '' } = {}) {
  let t = $('#toast');
  if (!t) { t = h('<div id="toast" role="status" aria-live="polite"></div>'); document.body.appendChild(t); }
  t.className = 'show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, ms);
}

// ---------- modal dialog ----------
// confirmDialog({title, body, ok, cancel, danger}) -> Promise<boolean>
export function confirmDialog({ title, body = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const m = h(`<div class="scrim dialog-scrim"><div class="dialog" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>${body ? `<p>${body}</p>` : ''}
      <div class="dialog-btns">
        ${cancel ? `<button class="btn btn-ghost" data-v="0">${esc(cancel)}</button>` : ''}
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v="1">${esc(ok)}</button>
      </div></div></div>`);
    const done = v => { m.classList.remove('in'); setTimeout(() => m.remove(), 180); resolve(v); };
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1');
      else if (e.target === m && cancel) done(false);
    });
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('in'));
    setTimeout(() => m.querySelector('[data-v="1"]')?.focus(), 50);
  });
}

// ---------- bottom sheet ----------
// openSheet(html, {onClose, dismissable}) -> {el, close}
export function openSheet(html, { onClose, dismissable = true, cls = '' } = {}) {
  const m = h(`<div class="scrim sheet-scrim"><div class="sheet ${cls}" role="dialog" aria-modal="true">
    <div class="sheet-grip"></div>${html}</div></div>`);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    m.classList.remove('in'); setTimeout(() => m.remove(), 240);
    onClose && onClose();
  };
  if (dismissable) m.addEventListener('click', e => { if (e.target === m) close(); });
  m.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add('in'));
  return { el: m.querySelector('.sheet'), close };
}

export function closeAllOverlays() { $$('.scrim').forEach(n => n.remove()); }

export function segmented(name, options, value) {
  return `<div class="seg" role="radiogroup" data-name="${name}">${options.map(o =>
    `<button role="radio" aria-checked="${String(o.value) === String(value)}" data-value="${esc(o.value)}" class="${String(o.value) === String(value) ? 'on' : ''}">${o.label}</button>`).join('')}</div>`;
}
export function bindSegmented(root, onChange) {
  root.addEventListener('click', e => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const seg = b.closest('.seg');
    seg.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    onChange(seg.dataset.name, b.dataset.value);
  });
}
export function toggle(name, on) {
  return `<button class="tgl ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" data-name="${name}"><span></span></button>`;
}

export { icon };
