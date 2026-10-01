// Station panels (DOM). Reuses lane 5's glass look (.sw-inv*, .sw-slot, .sw-btn) plus css/stations.css.
import { h, click, toast } from '../../ui/dom.js';
import { iconURL, fmtCount } from '../../ui/icons.js';
import { available, almost, make, smeltResult, fuelValue } from '../../data/recipes.js';
import { HOTBAR, SIZE } from '../inventory.js';

function ensureCss() {
  if (document.getElementById('sw-stations-css')) return;
  const l = document.createElement('link');
  l.id = 'sw-stations-css';
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/stations.css', import.meta.url).href;
  document.head.append(l);
}

const TITLES = { fabricator: 'Fabricator', hand: 'Hand Fabrication', oven: 'Reflow Oven', cache: 'Cache' };

function slotView(items, s, infinite = false) {
  if (!s) return null;
  const item = items.get(s.id);
  return { item, count: s.n, frac: (s.f || 0) / 64, dur: s.dur, maxDur: item?.tool?.durability, infinite };
}

function slotEl(v, attrs = {}) {
  const el = h('div.sw-slot', attrs, h('img', { alt: '', draggable: false }), h('span.n'), h('div.dur', {}, h('b')));
  paint(el, v);
  return el;
}
function paint(el, v) {
  const img = el.querySelector('img');
  const d = el.querySelector('.dur');
  if (!v?.item) { img.style.visibility = 'hidden'; el.querySelector('.n').textContent = ''; d.style.display = 'none'; el.title = ''; return; }
  img.src = iconURL(v.item); img.style.visibility = '';
  el.title = v.item.fullName || v.item.name;
  el.querySelector('.n').textContent = v.infinite || (v.count <= 1 && !v.frac) ? '' : fmtCount(v);
  if (v.maxDur && v.dur < v.maxDur) { d.style.display = ''; d.firstChild.style.width = (v.dur / v.maxDur) * 100 + '%'; } else d.style.display = 'none';
}

// A compact view of the player's 36 slots; onTap(i).
function invGrid(game, onTap) {
  const inv = game.inv;
  const els = [];
  const wrap = h('div.sw-st-inv');
  const bag = h('div.sw-grid'), hot = h('div.sw-grid.hot');
  for (let i = 0; i < SIZE; i++) {
    const el = slotEl(null, { 'data-i': i, onpointerup: () => onTap(i) });
    els[i] = el;
    (i < HOTBAR ? hot : bag).append(el);
  }
  wrap.append(h('div.lab', {}, 'Backpack'), bag, h('div.lab', {}, 'Hotbar'), hot);
  const refresh = () => { for (let i = 0; i < SIZE; i++) paint(els[i], inv.view(i)); };
  refresh();
  return { el: wrap, refresh };
}

// ---------- Fabrication list (hand or fabricator) ----------
export function mountFab(ctx, game, container, station = null) {
  ensureCss();
  const { items, inv } = game;
  const list = h('div.sw-fab-list');
  container.append(list);
  function ingr(k, n, short = 0) {
    const it = items.get(k);
    return h('span.ing' + (short ? '.short' : ''), { title: it?.name }, h('img', { src: iconURL(it), alt: '' }), short ? `${n - short}/${n}` : `×${n}`);
  }
  function card(r, ok, need = []) {
    const it = items.get(r.out);
    const short = Object.fromEntries(need.map((x) => [x.key, x.n]));
    return h('button.sw-fab-card' + (ok ? '' : '.dim'), {
      disabled: !ok,
      onclick: () => {
        if (!ok) return;
        const res = make(items, inv, r);
        if (res) {
          click('place');
          if (res.overflow > 0) game.drops.spawnItem(r.out, res.overflow, ctx.player.pos.x, ctx.player.pos.y + 1, ctx.player.pos.z);
          ctx.bus?.emit?.('item:fabricate', { key: r.out, n: r.n });
        }
        refresh();
      },
    },
    h('img.out', { src: iconURL(it), alt: '' }),
    h('span.nm', {}, it?.fullName || it?.name || r.out, r.n > 1 ? h('em', {}, ` ×${r.n}`) : null),
    h('span.ings', {}, Object.entries(r.in).map(([k, n]) => ingr(k, n, short[k] || 0))));
  }
  function refresh() {
    const can = available(items, inv, station);
    const seen = new Set();
    const ready = can.filter((r) => !seen.has(r.out) && seen.add(r.out));
    const near = almost(items, inv, station).filter((a) => !seen.has(a.r.out));
    const kids = [];
    kids.push(h('div.lab', {}, ready.length ? 'Tap to make' : 'Nothing to make yet'));
    if (!ready.length) kids.push(h('p.hint', {}, station
      ? 'Gather more: logs, stone, ore. Everything you can build shows up here.'
      : 'Punch a carbon-bark tree for logs. Logs make planks, and 4 planks make a Fabricator.'));
    for (const r of ready) kids.push(card(r, true));
    if (near.length) {
      kids.push(h('div.lab', {}, 'Almost'));
      for (const a of near) kids.push(card(a.r, false, a.need));
    }
    if (!station) kids.push(h('p.hint', {}, 'Tools, Caches, Ovens and Sleep Pods need a Fabricator: place one and use it.'));
    list.replaceChildren(...kids);
  }
  refresh();
  const off = ctx.bus?.on?.('inv:change', refresh);
  return { refresh, destroy: () => { off?.(); list.remove(); } };
}

// ---------- Panels ----------
export function openStation(ctx, game, { type, state, at, onClose }) {
  ensureCss();
  const { items, inv } = game;
  const root = ctx.uiRoot || document.getElementById('ui-root') || document.body;
  const body = h('div.sw-st-body');
  const panel = h('div.sw-inv.sw-st.glass', {},
    h('header', {}, h('div.sw-st-title', {}, TITLES[type] || type),
      h('button.sw-btn.ghost.sw-st-x', { title: 'Close (E)', onclick: () => close() }, '✕')),
    body);
  const wrap = h('div.sw-inv-wrap.sw-st-wrap', { onpointerdown: (e) => { if (e.target === wrap) close(); } }, panel);
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel', 'contextmenu']) wrap.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'contextmenu' });
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());

  const input = ctx.input;
  input?.releasePointer?.(); input?.releaseAll?.();
  if (input) input.enabled = false;

  let left = null, grid = null, fab = null, upd = null;
  if (type === 'fabricator' || type === 'hand') {
    left = h('div.sw-st-left');
    fab = mountFab(ctx, game, left, type === 'fabricator' ? 'fabricator' : null);
    grid = invGrid(game, () => {});
  } else if (type === 'cache') {
    const c = state.inv;
    const cEls = [];
    const cg = h('div.sw-grid');
    for (let i = 0; i < c.size; i++) {
      const el = slotEl(null, { onpointerup: () => { const s = c.slots[i]; if (!s) return; const left = inv.addSlot(s); c.slots[i] = left; click('place'); refresh(); } });
      cEls.push(el); cg.append(el);
    }
    left = h('div.sw-st-left', {}, h('div.lab', {}, 'Cache · tap to take'), cg, h('p.hint', {}, 'Tap anything in your backpack to store it here.'));
    grid = invGrid(game, (i) => {
      const s = inv.slots[i]; if (!s) return;
      const rest = c.addSlot(s);
      inv.slots[i] = rest; inv.changed(i); click('place'); refresh();
    });
    upd = () => cEls.forEach((el, i) => paint(el, slotView(items, c.slots[i])));
  } else if (type === 'oven') {
    const o = state;
    const sIn = slotEl(null, { onpointerup: () => takeBack('in') });
    const sFuel = slotEl(null, { onpointerup: () => takeBack('fuel') });
    const sOut = slotEl(null, { onpointerup: () => takeBack('out') });
    const flame = h('div.sw-oven-flame', {}, h('b'));
    const arrow = h('div.sw-oven-arrow', {}, h('b'));
    left = h('div.sw-st-left', {},
      h('div.lab', {}, 'Smelt & cook'),
      h('div.sw-oven', {},
        h('div.col', {}, h('span.cap', {}, 'Input'), sIn, flame, sFuel, h('span.cap', {}, 'Fuel')),
        arrow,
        h('div.col', {}, h('span.cap', {}, 'Output'), sOut)),
      h('p.hint', {}, 'Tap ore, sand, logs or raw food to load them, and carbon or wood as fuel. It keeps working when you walk away.'));
    function takeBack(k) {
      const s = o[k]; if (!s) return;
      const left = inv.add(s.id, s.n);
      o[k] = left > 0 ? { id: s.id, n: Math.round(left) } : null;
      if (k === 'in') o.prog = 0;
      click('place'); refresh();
    }
    grid = invGrid(game, (i) => {
      const s = inv.slots[i]; if (!s || s.n < 1) return;
      const k = smeltResult(items, s.id) != null && (!o.in || o.in.id === s.id) ? 'in'
        : fuelValue(items, s.id) && (!o.fuel || o.fuel.id === s.id) ? 'fuel' : null;
      if (!k) { if (!smeltResult(items, s.id) && !fuelValue(items, s.id)) toastMsg(`${items.get(s.id)?.name} can't go in the oven`); return; }
      const cur = o[k]?.n || 0;
      const put = Math.min(s.n, 64 - cur);
      if (put <= 0) return;
      inv.removeId(s.id, put, i);
      o[k] = { id: s.id, n: cur + put };
      click('place'); refresh();
    });
    upd = () => {
      paint(sIn, slotView(items, o.in)); paint(sFuel, slotView(items, o.fuel)); paint(sOut, slotView(items, o.out));
      flame.firstChild.style.height = (o.burnMax ? (o.burn / o.burnMax) * 100 : 0) + '%';
      flame.classList.toggle('on', o.burn > 0);
      arrow.firstChild.style.width = (o.prog / 5) * 100 + '%';
    };
  }
  const toastMsg = (t) => toast(t, { kind: 'warn' });

  body.append(left, grid.el);
  function refresh() { grid.refresh(); fab?.refresh(); upd?.(); }
  refresh();
  const off = ctx.bus?.on?.('inv:change', () => { grid.refresh(); upd?.(); });

  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  root.append(wrap);
  click('open');

  let closed = false;
  let tick = 0;
  function close() {
    if (closed) return;
    closed = true;
    click('close');
    off?.(); fab?.destroy();
    document.removeEventListener('keydown', onKey, true);
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 200);
    const shellPlaying = !ctx.ui?.shell || ctx.ui.shell.state === 'playing';
    if (input && shellPlaying && !ctx.ui?.panel) { input.enabled = true; input.requestPointer?.(); }
    ctx.bus?.emit?.('ui:close', { panel: 'station:' + type });
    onClose?.();
  }
  return {
    at, type, close,
    update(dt) { if ((tick += dt) > 0.15) { tick = 0; upd?.(); } },
  };
}
