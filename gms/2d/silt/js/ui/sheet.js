import { h, tap, icon } from './dom.js';
import { GLYPH } from './icons.js';

/**
 * A bottom sheet. Scrim closes it, the grabber can be dragged down to close it,
 * and it never covers more than 88% of the screen so the sand behind stays part
 * of the picture.
 */
export function createSheet(title, sub, onClose) {
  const body = h('div', { class: 'sheet-body' });
  const close = tap(h('button', { class: 'gb gb--icon', 'aria-label': 'Close' }, icon(GLYPH.close)), () => wrap.hide());
  const grab = h('div', { class: 'grabber' });
  const titleEl = h('div', { class: 'sheet-title', text: title });
  const subEl = h('div', { class: 'sheet-sub', text: sub || '' });

  const panel = h('div', { class: 'sheet' },
    grab,
    h('div', { class: 'sheet-head' }, h('div', {}, titleEl, subEl), close),
    body);

  const scrim = h('div', { class: 'sheet-scrim' });
  const el = h('div', { class: 'sheet-wrap' }, scrim, panel);
  scrim.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  scrim.addEventListener('click', () => wrap.hide());

  // Drag the grabber down to dismiss. Anything less feels like a web page.
  let y0 = 0, dragging = false;
  panel.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target !== grab && !grab.contains(e.target) && body.scrollTop > 0) return;
    dragging = true; y0 = e.clientY; panel.style.transition = 'none';
  });
  panel.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = Math.max(0, e.clientY - y0);
    if (dy > 2 && body.scrollTop <= 0) panel.style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';
    panel.style.transform = '';
    if (e.clientY - y0 > 90) wrap.hide();
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);

  const wrap = {
    el, body, panel,
    setTitle(t, s) { titleEl.textContent = t; if (s != null) subEl.textContent = s; },
    show() { el.classList.add('is-on'); body.scrollTop = 0; },
    hide() { el.classList.remove('is-on'); onClose && onClose(); },
    get open() { return el.classList.contains('is-on'); },
  };
  return wrap;
}
