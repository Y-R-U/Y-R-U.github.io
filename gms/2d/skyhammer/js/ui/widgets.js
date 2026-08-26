// Small DOM helpers shared by every screen. Popups only — never alert() (house rule).

import { buzz } from './prefs.js';
import { getMoney } from './model.js';
import { cash, group } from './units.js';

/** el('div.row.tight', { onclick }, child, 'text') */
export function el(spec, attrs, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const node = document.createElement(m[1] || 'div');
  for (const t of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (t[0] === '.') node.classList.add(t.slice(1));
    else node.id = t.slice(1);
  }
  if (attrs && attrs.nodeType) { kids.unshift(attrs); attrs = null; }
  if (typeof attrs === 'string') { kids.unshift(attrs); attrs = null; }
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('data')) node.setAttribute(k.replace(/([A-Z])/g, '-$1').toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const k of kids.flat(3)) {
    if (k == null || k === false) continue;
    node.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return node;
}

/** A tappable button that also fires haptics and never lets the touch reach the play area. */
export function btn(cls, label, onTap, opts = {}) {
  const b = el('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), {
    type: 'button',
    disabled: opts.disabled ? 'disabled' : null,
    'aria-label': opts.aria || (typeof label === 'string' ? label : undefined),
  });
  if (label != null) b.appendChild(label.nodeType ? label : document.createTextNode(String(label)));
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (b.disabled) return;
    buzz(opts.buzz ?? 10);
    onTap && onTap(e, b);
  });
  return b;
}

/** Grouped digits only. Anything the player reads as MONEY uses cash() from units.js. */
export function money(n) {
  return group(Math.max(0, n || 0));
}

export { cash } from './units.js';
export { secs } from './units.js';

/* -------------------------------------------------------------------- popup */

let popRoot = null;

/**
 * popup({ title, body, actions:[{label, kind, act}] }) — the only modal in the game.
 * Returns a close() you can call yourself.
 */
export function popup(opts) {
  closePopup();
  const host = document.getElementById('ui') || document.body;
  const buttons = (opts.actions && opts.actions.length ? opts.actions : [{ label: 'OK' }]).map((a) =>
    btn('pop-btn ' + (a.kind || ''), a.label, () => {
      closePopup();
      a.act && a.act();
    })
  );
  const card = el('div.pop-card', {},
    opts.title ? el('h3.pop-title', {}, opts.title) : null,
    opts.body != null ? (opts.body.nodeType ? opts.body : el('p.pop-body', {}, opts.body)) : null,
    el('div.pop-actions', {}, buttons)
  );
  popRoot = el('div.pop-scrim', { onclick: (e) => { if (e.target === popRoot && opts.dismissable !== false) closePopup(); } }, card);
  host.appendChild(popRoot);
  requestAnimationFrame(() => popRoot && popRoot.classList.add('in'));
  return closePopup;
}

export function closePopup() {
  if (popRoot && popRoot.parentNode) popRoot.parentNode.removeChild(popRoot);
  popRoot = null;
}

/* ------------------------------------------------------------------- toasts */

let toastHost = null;

export function toast(msg, kind = '') {
  const host = document.getElementById('ui') || document.body;
  if (!toastHost || !toastHost.parentNode) {
    toastHost = el('div.toast-host');
    host.appendChild(toastHost);
  }
  const t = el('div.toast' + (kind ? '.' + kind : ''), {}, msg);
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.parentNode && t.parentNode.removeChild(t), 260);
  }, 1600);
}

/* ------------------------------------------------------------- common chrome */

export function topbar(ctx, title, opts = {}) {
  const kids = [];
  if (opts.back) kids.push(btn('icon back', '', () => opts.back(), { aria: 'Back' }));
  kids.push(el('div.topbar-title', {}, title));
  kids.push(el('div.spacer'));
  if (opts.money !== false) kids.push(coinChip(ctx));
  if (opts.cog !== false) kids.push(btn('icon cog', '', () => ctx.go('settings', { from: opts.screen }), { aria: 'Settings' }));
  return el('header.topbar', {}, kids);
}

export function coinChip(ctx) {
  const chip = el('div.chip.coin', {}, el('span.coin-dot'), el('span.coin-val', {}, cash(getMoney(ctx.save))));
  chip.dataset.role = 'coin';
  return chip;
}

/** Repaint every coin chip on screen after a purchase, without remounting. */
export function refreshCoins(ctx) {
  const v = cash(getMoney(ctx.save));
  for (const n of document.querySelectorAll('.chip.coin .coin-val')) {
    if (n.textContent !== v) { n.textContent = v; n.parentNode.classList.remove('pulse'); void n.offsetWidth; n.parentNode.classList.add('pulse'); }
  }
}
