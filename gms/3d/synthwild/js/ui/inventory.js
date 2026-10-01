// Slide-over inventory: backpack + hotbar (tap-to-move or drag), a Fabricate placeholder, and the Build-mode block catalog.
import { h, click } from './dom.js';
import { g } from './glyphs.js';
import { iconURL, fmtCount } from './icons.js';

const HOT = 9, SIZE = 36;

export function openInventory(ctx, root, { onClose } = {}) {
  const inv = ctx.game?.inv, items = ctx.game?.items;
  if (!inv) return null;
  const build = ctx.session?.mode === 'build';
  let held = -1;           // tap-to-move source slot
  let tab = build ? 'blocks' : 'bag';
  let focus = inv.sel;
  let fab = null;

  const tabsEl = h('div.sw-tabs');
  const bodyEl = h('div.body');
  const panel = h('div.sw-inv.glass', {},
    h('header', {}, tabsEl, h('button.sw-icon-btn', { title: 'Close (E)', onclick: () => close() }, g('close', 18))),
    bodyEl);
  const wrap = h('div.sw-inv-wrap', { onpointerdown: (e) => { if (e.target === wrap) close(); } }, panel);
  const stop = (e) => e.stopPropagation();
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel', 'contextmenu']) wrap.addEventListener(ev, stop, { passive: ev !== 'contextmenu' });
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());

  const TABS = [
    ...(build ? [['blocks', 'All blocks', 'cube']] : []),
    ['bag', 'Backpack', 'bag'],
    ['fab', 'Fabricate', 'wrench'],
  ];
  function drawTabs() {
    tabsEl.replaceChildren(...TABS.map(([id, lb, ic]) => h('button', { class: tab === id ? 'on' : '', onclick: () => { click(); tab = id; held = -1; draw(); } },
      h('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } }, g(ic, 16), lb))));
  }

  const slotEls = new Array(SIZE);
  function slotEl(i) {
    const s = h('div.sw-slot', { 'data-i': i }, h('img', { alt: '', draggable: false }), h('span.n'), h('div.dur', {}, h('b')));
    slotEls[i] = s;
    paintSlot(i);
    return s;
  }
  function paintSlot(i) {
    const s = slotEls[i]; if (!s) return;
    const v = inv.view(i), img = s.querySelector('img');
    s.classList.toggle('held', i === held);
    s.classList.toggle('sel', i === inv.sel && i < HOT);
    if (!v) { img.style.visibility = 'hidden'; s.querySelector('.n').textContent = ''; s.querySelector('.dur').style.display = 'none'; return; }
    img.src = iconURL(v.item); img.style.visibility = '';
    s.querySelector('.n').textContent = v.infinite || (v.count <= 1 && !v.frac) ? '' : fmtCount(v);
    const d = s.querySelector('.dur');
    if (v.maxDur && v.dur < v.maxDur) { d.style.display = ''; d.firstChild.style.width = (v.dur / v.maxDur) * 100 + '%'; } else d.style.display = 'none';
  }

  const detail = h('div.detail');
  function drawDetail() {
    const v = inv.view(focus);
    if (!v) {
      detail.replaceChildren(h('p.hint', {}, build
        ? 'Tap a block, then tap a hotbar slot to put it there. Or drag it straight onto the hotbar.'
        : 'Tap an item, then tap another slot to move it. Drag works too. Hold (or right-click) a stack to split it in half.'));
      return;
    }
    const it = v.item || {};
    detail.replaceChildren(...[
      h('img.big', { src: iconURL(it), alt: '' }),
      h('h4', {}, it.fullName || it.name || 'Item'),
      h('p', {}, it.desc || (it.kind === 'block' ? 'A building block.' : it.kind === 'food' ? `Food: restores ${it.food?.charge ?? '?'} Charge.` : it.kind === 'tool' ? `${it.tool.tier} tool` : 'Material')),
      v.infinite ? null : h('p.hint', {}, `You have ${fmtCount({ count: Math.floor(inv.count(v.id)), frac: inv.count(v.id) % 1 })}`),
      v.maxDur ? h('p.hint', {}, `Wear: ${v.dur} / ${v.maxDur}`) : null].filter(Boolean));
  }

  // drag + tap handling on a grid of slots
  let drag = null;
  function bindSlots(container, getSource) {
    container.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('.sw-slot'); if (!s) return;
      const src = getSource(s);
      if (!src) return;
      e.preventDefault();
      drag = { src, x: e.clientX, y: e.clientY, ghost: null, moved: false, t: performance.now(), id: e.pointerId };
      drag.lp = setTimeout(() => { if (drag && !drag.moved && src.slot != null) { inv.split(src.slot); click('tick'); drag = null; refresh(); } }, 480);
      if (e.button === 2 && src.slot != null) { clearTimeout(drag.lp); inv.split(src.slot); click('tick'); drag = null; refresh(); }
    });
  }
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
      drag.moved = true; clearTimeout(drag.lp);
      const it = drag.src.slot != null ? inv.view(drag.src.slot)?.item : items?.get(drag.src.id);
      if (!it) { drag = null; return; }
      drag.ghost = h('img.sw-ghost', { src: iconURL(it) });
      document.body.append(drag.ghost);
    }
    if (drag.ghost) { drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px'; }
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    clearTimeout(drag.lp);
    const d = drag; drag = null;
    if (d.ghost) {
      d.ghost.remove();
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sw-slot[data-i]');
      if (under) dropOn(d.src, +under.dataset.i);
      return;
    }
    tapOn(d.src);
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);

  function dropOn(src, to) {
    if (src.slot != null) { if (src.slot !== to) { inv.move(src.slot, to); click('place'); } }
    else { inv.setSlot(to, src.id, items?.get(src.id)?.stack ?? 64); click('place'); }
    held = -1; focus = to; refresh();
  }
  function tapOn(src) {
    if (src.slot == null) {        // catalog: put it in the selected hotbar slot
      held = -1;
      inv.setSlot(inv.sel, src.id, items?.get(src.id)?.stack ?? 64);
      click('select'); focus = inv.sel; refresh(); return;
    }
    const i = src.slot;
    if (held >= 0 && held !== i) { inv.move(held, i); held = -1; focus = i; click('place'); }
    else if (held === i) { held = -1; click('back'); }
    else if (inv.slots[i]) { held = i; focus = i; click('select'); }
    else if (i < HOT) { inv.select(i); focus = i; click('select'); }
    refresh();
  }

  function refresh() { for (let i = 0; i < SIZE; i++) paintSlot(i); drawDetail(); }

  function draw() {
    drawTabs();
    fab?.destroy?.(); fab = null;
    if (tab === 'fab') {
      bodyEl.style.gridTemplateColumns = '1fr';
      const st = ctx.game?.stations;
      if (st?.mountFab) {
        const box = h('div.sw-fab-host', { style: { overflowY: 'auto', minHeight: 0 } });
        bodyEl.replaceChildren(box);
        try { fab = st.mountFab(box); return; } catch (e) { console.warn('[inv] mountFab failed', e); }
      }
      bodyEl.replaceChildren(h('div.sw-fab', {},
        h('div.card', {}, h('b', {}, 'The Fabricator is warming up. '),
          'Soon it will show everything you can make from what you are carrying. One tap builds it, so there are no recipes to remember.')));
      return;
    }
    bodyEl.style.gridTemplateColumns = '';
    const grids = h('div.grids');
    if (tab === 'blocks') {
      const cat = h('div.sw-catalog');
      for (const id of items?.palette?.() || []) {
        const it = items.get(id);
        cat.append(h('div.sw-slot', { 'data-cat': id, title: it.name }, h('img', { src: iconURL(it), alt: '', draggable: false })));
      }
      bindSlots(cat, (s) => (s.dataset.cat ? { id: +s.dataset.cat } : null));
      grids.append(h('div.lab', {}, 'Every block'), cat);
    } else {
      const bag = h('div.sw-grid');
      for (let i = HOT; i < SIZE; i++) bag.append(slotEl(i));
      bindSlots(bag, (s) => ({ slot: +s.dataset.i }));
      grids.append(h('div.lab', {}, 'Backpack'), bag);
    }
    const hot = h('div.sw-grid.hot');
    for (let i = 0; i < HOT; i++) hot.append(slotEl(i));
    bindSlots(hot, (s) => ({ slot: +s.dataset.i }));
    grids.append(h('div.lab', {}, 'Hotbar'), hot);
    bodyEl.replaceChildren(grids, detail);
    refresh();
  }

  const offs = [ctx.bus?.on('inv:change', () => { refresh(); fab?.refresh?.(); }), ctx.bus?.on('inv:select', () => refresh())];
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (/^[1-9]$/.test(e.key)) {
      e.stopPropagation();
      const n = +e.key - 1;
      if (held >= 0) { inv.move(held, n); held = -1; refresh(); } else inv.select(n);
    }
  };
  document.addEventListener('keydown', onKey, true);

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    click('close');
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
    document.removeEventListener('keydown', onKey, true);
    offs.forEach((f) => f && f());
    fab?.destroy?.(); fab = null;
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 200);
    onClose?.();
  }

  root.append(wrap);
  draw();
  click('open');
  return { close, el: wrap };
}
