// Small DOM helpers shared by all screens: escaping, toasts, dialogs, sheets.
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const fmtInt = n => Math.round(n).toLocaleString('en-US');

// Avatar: emoji / short text, or an image URL.
// Heraldic lion crest (ui-2): swirling two-layer mane, ears, gold face with dark detailing.
export const LION = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor" stroke="#0c162b" stroke-width=".45" stroke-linejoin="round"><path d="M9.72 7.19Q11.49 2.19 15.67 1.93Q16.27 5.18 14.28 7.19ZM12.58 6.73Q16.62 3.29 20.36 5.15Q19.26 8.27 16.53 9.01ZM15.29 7.77Q20.50 6.81 22.82 10.29Q20.30 12.44 17.57 11.72ZM17.11 10.02Q22.11 11.79 22.37 15.97Q19.12 16.57 17.11 14.58ZM17.57 12.88Q21.01 16.92 19.15 20.66Q16.03 19.56 15.29 16.83ZM16.53 15.59Q17.49 20.80 14.01 23.12Q11.86 20.60 12.58 17.87ZM14.28 17.41Q12.51 22.41 8.33 22.67Q7.73 19.42 9.72 17.41ZM11.42 17.87Q7.38 21.31 3.64 19.45Q4.74 16.33 7.47 15.59ZM8.71 16.83Q3.50 17.79 1.18 14.31Q3.70 12.16 6.43 12.88ZM6.89 14.58Q1.89 12.81 1.63 8.63Q4.88 8.03 6.89 10.02ZM6.43 11.72Q2.99 7.68 4.85 3.94Q7.97 5.04 8.71 7.77ZM7.47 9.01Q6.51 3.80 9.99 1.48Q12.14 4.00 11.42 6.73Z"/><path d="M11.31 7.35Q13.72 4.29 16.74 4.77Q16.90 7.37 15.07 8.36ZM13.88 7.67Q17.49 6.23 19.87 8.15Q18.71 10.48 16.63 10.42ZM15.94 9.23Q19.79 9.79 20.89 12.64Q18.72 14.07 16.95 12.99ZM16.95 11.61Q20.01 14.02 19.53 17.04Q16.93 17.20 15.94 15.37ZM16.63 14.18Q18.07 17.79 16.15 20.17Q13.82 19.01 13.88 16.93ZM15.07 16.24Q14.51 20.09 11.66 21.19Q10.23 19.02 11.31 17.25ZM12.69 17.25Q10.28 20.31 7.26 19.83Q7.10 17.23 8.93 16.24ZM10.12 16.93Q6.51 18.37 4.13 16.45Q5.29 14.12 7.37 14.18ZM8.06 15.37Q4.21 14.81 3.11 11.96Q5.28 10.53 7.05 11.61ZM7.05 12.99Q3.99 10.58 4.47 7.56Q7.07 7.40 8.06 9.23ZM7.37 10.42Q5.93 6.81 7.85 4.43Q10.18 5.59 10.12 7.67ZM8.93 8.36Q9.49 4.51 12.34 3.41Q13.77 5.58 12.69 7.35Z"/></g><circle cx="12" cy="12.3" r="6.1" fill="currentColor"/><path fill="currentColor" stroke="#0c162b" stroke-width=".35" d="M8.3 8.1c-.7-.9-.6-2 .4-2.3.8-.2 1.4.4 1.6 1.1M15.7 8.1c.7-.9.6-2-.4-2.3-.8-.2-1.4.4-1.6 1.1"/><path fill="currentColor" stroke="#0c162b" stroke-width=".4" d="M12 6.6c2.5 0 4.3 1.8 4.3 4.2 0 1.3-.4 2.3-1 3.2l-.8 2.4c-.4 1-1.3 1.6-2.5 1.6s-2.1-.6-2.5-1.6l-.8-2.4c-.6-.9-1-1.9-1-3.2 0-2.4 1.8-4.2 4.3-4.2z"/><g fill="#0c162b"><path d="M9 10.1q1.2-.5 2.2.4-1.2.5-2.2-.4zM15 10.1q-1.2-.5-2.2.4 1.2.5 2.2-.4z"/><path d="M10.6 13.4h2.8l-1.4 1.5z"/></g><g fill="none" stroke="#0c162b" stroke-width=".42" stroke-linecap="round"><path d="M8.7 9.1q1.3-.8 2.6.1M15.3 9.1q-1.3-.8-2.6.1M11.3 10.9l-.5 2.4M12.7 10.9l.5 2.4M12 14.9v.9M10.5 15.9q1.5 1.1 3 0"/></g><g fill="#0c162b"><circle cx="10.2" cy="14.9" r=".22"/><circle cx="13.8" cy="14.9" r=".22"/></g></svg>';
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

// ---------- promotion picker (shared by bot game, online game, puzzles) ----------
// Drawn over the board stage; anchored next to the promotion square when the board can
// project it (board.squareToScreen), so the dragged pawn stays visible on its target.
// Resolves 'q'|'r'|'b'|'n', or null on cancel / tap outside.
const PROMO_GLYPH = { q: '♛', r: '♜', b: '♝', n: '♞' };
const PROMO_NAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
export function promotionPicker(stage, { color = 'w', to = null, board = null } = {}) {
  return new Promise(resolve => {
    if (!stage) { resolve('q'); return; }
    const o = h(`<div class="promo" role="dialog" aria-label="Promote to">
      <div class="promo-card"><small>Promote to</small><div class="promo-row">
      ${['q', 'r', 'b', 'n'].map(p => `<button data-p="${p}" class="pc-${color}" aria-label="${PROMO_NAME[p]}">${PROMO_GLYPH[p]}</button>`).join('')}
      </div><button class="link" data-p="">Cancel</button></div></div>`);
    let pt = null;
    try { if (to && board && board.squareToScreen) pt = board.squareToScreen(to); } catch { pt = null; }
    const done = v => { o.remove(); resolve(v); };
    o.addEventListener('click', e => {
      const b = e.target.closest('[data-p]');
      if (b) done(b.dataset.p || null);
      else if (e.target === o) done(null);
    });
    stage.appendChild(o);
    if (pt) {
      o.classList.add('anchored');
      const card = o.querySelector('.promo-card');
      const W = stage.clientWidth, H = stage.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight;
      const sq = W / 8;
      // sit on the board side of the square (below a top-edge square, above a bottom-edge one)
      let y = pt.y < H / 2 ? pt.y + sq * 0.7 : pt.y - sq * 0.7 - ch;
      let x = pt.x - cw / 2;
      x = Math.max(6, Math.min(W - cw - 6, x)); y = Math.max(6, Math.min(H - ch - 6, y));
      card.style.left = `${Math.round(x)}px`; card.style.top = `${Math.round(y)}px`;
    }
  });
}
