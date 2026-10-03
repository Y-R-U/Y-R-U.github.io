import { el, btn } from './dom.js?v=20261004d';

export function createSheets(root, { onChange } = {}) {
  const scrim = el('div', 'sheet-scrim');
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  const grip = el('div', 'sheet-grip');
  const head = el('div', 'sheet-head');
  const back = btn('sheet-back', '‹', () => pop(), 'Back');
  const title = el('h2', 'sheet-title');
  const close = btn('sheet-close', '✕', () => closeAll(), 'Close');
  const body = el('div', 'sheet-body');
  head.append(back, title, close);
  sheet.append(grip, head, body);
  root.append(scrim, sheet);
  scrim.addEventListener('click', () => closeAll());

  const stack = [];
  let live = null;

  function render() {
    const top = stack[stack.length - 1];
    sheet.className = 'sheet' + (top?.cls ? ' ' + top.cls : '');
    if (!top) { sheet.classList.remove('open'); scrim.classList.remove('open'); live = null; onChange?.(null); return; }
    title.textContent = top.title;
    back.hidden = stack.length < 2;
    body.replaceChildren();
    body.scrollTop = 0;
    live = top.fill(body, api) || null;
    sheet.classList.add('open');
    scrim.classList.add('open');
    onChange?.(top.id);
  }

  function open(spec, { push = false } = {}) {
    if (!push) stack.length = 0;
    stack.push(spec);
    render();
  }
  function pop() { stack.pop(); render(); }
  function closeAll() { if (!stack.length) return; stack.length = 0; render(); }

  let y0 = null, dy = 0;
  grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    sheet.style.transform = '';
    if (dy > 90) closeAll();
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  const api = {
    open,
    push: (spec) => open(spec, { push: true }),
    pop,
    close: closeAll,
    refill() { if (stack.length) render(); },
    update() { if (live) try { live(); } catch (e) { console.error(e); } },
    get top() { return stack[stack.length - 1]?.id || null; },
    get isOpen() { return stack.length > 0; },
    el: sheet,
  };
  return api;
}
