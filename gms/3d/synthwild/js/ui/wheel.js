// Radial tool wheel: scale ring (0.25–8), brush mode, volume dims, view toggle.
import { h, click } from './dom.js';
import { svg } from './glyphs.js';
import { toast } from './dom.js';
import { settings } from './settings.js';

const SCALES = [0.25, 0.5, 1, 2, 4, 8];
const LABEL = { 0.25: '¼', 0.5: '½', 1: '1', 2: '2', 4: '4', 8: '8' };
const MODES = [['fill', 'Fill'], ['hollow', 'Hollow'], ['shell', 'Shell'], ['replace', 'Swap']];
const MODE_HINT = {
  fill: 'Solid box of the block.',
  hollow: 'Walls, floor and roof, empty inside.',
  shell: 'Only the outside walls. Inside is left alone.',
  replace: 'Swaps blocks that are already there.',
};

// Writes go through the brush's own setters when it has them.
export function setBrush(ctx, key, v) {
  const b = ctx.brush;
  if (!b) return;
  const fn = b['set' + key[0].toUpperCase() + key.slice(1)];
  if (typeof fn === 'function') { if (Array.isArray(v)) fn.apply(b, v); else fn.call(b, v); return; }
  else if (typeof b.set === 'function') b.set(key, v);
  else b[key] = v;
  ctx.bus?.emit('brush:change', { key, value: v });
}

export function openWheel(ctx, root, { onClose } = {}) {
  const b = ctx.brush || {};
  const build = ctx.session?.mode === 'build';
  const maxScale = build ? 8 : (b.maxScale ?? 8);
  const R = 150, r0 = 50, r1 = 146;
  const segs = [];
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('viewBox', '-150 -150 300 300');
  const n = SCALES.length, gap = 0.035;
  SCALES.forEach((s, i) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n + gap, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n - gap;
    const p = (rad, a) => `${(Math.cos(a) * rad).toFixed(1)} ${(Math.sin(a) * rad).toFixed(1)}`;
    const d = `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
    const am = (a0 + a1) / 2, rm = (r0 + r1) / 2 + 4;
    const gEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gEl.setAttribute('class', 'seg' + (s > maxScale ? ' lock' : ''));
    gEl.innerHTML = `<path d="${d}"/><text x="${(Math.cos(am) * rm).toFixed(1)}" y="${(Math.sin(am) * rm).toFixed(1)}">${LABEL[s]}</text>`;
    gEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (s > maxScale) { click('deny'); return; }
      setBrush(ctx, 'scale', s); click('select'); paint();
    });
    segs.push([s, gEl]);
    svgEl.append(gEl);
  });
  const hubB = h('b'), hubS = h('span');
  const wheel = h('div.sw-wheel', {}, svgEl, h('div.hub.glass', {}, h('div', {}, hubB, hubS)));

  const modeBtns = MODES.map(([m, lb]) => h('button', { onclick: () => { setBrush(ctx, 'mode', m); click('select'); paint(); } },
    h('span', { html: svg(m, 20) }), lb));
  const modeHint = h('div.hint', { style: { fontSize: '12px', color: 'var(--ink-3)', minHeight: '2.6em' } });
  const dimVals = [];
  const dims = ['W', 'H', 'D'].map((lb, i) => {
    const v = h('b');
    dimVals.push(v);
    const step = (d) => {
      const cur = (ctx.brush?.dims || [1, 1, 1]).slice();
      cur[i] = Math.max(1, Math.min(8, (cur[i] || 1) + d));
      setBrush(ctx, 'dims', cur); click('tick'); paint();
    };
    return h('div.sw-step', {}, h('button', { onclick: () => step(-1) }, '−'), h('div', {}, v, h('span', {}, lb)), h('button', { onclick: () => step(1) }, '+'));
  });
  const viewSeg = h('div.sw-seg', { style: { width: '100%' } }, [['first', 'First person'], ['third', 'Third person']].map(([v, lb]) =>
    h('button', { 'data-v': v, style: { flex: 1 }, onclick: () => { settings.set('view', v); click(); paint(); } }, lb)));
  const acts = (ctx.brush?.actions || []);
  const actBtns = acts.map((a) => h('button', { 'data-id': a.id, title: a.key ? `${a.label} (${a.key})` : a.label, onclick: () => {
    const cur = (ctx.brush?.actions || []).find((x) => x.id === a.id);
    if (!cur?.enabled) { click('deny'); return; }
    click('select');
    let ok;
    try { ok = ctx.brush.run(a.id); } catch (e) { console.warn('[wheel] action', a.id, e); }
    if (ok !== false && (a.id === 'paste' || a.id === 'pick')) close(); else paint();
  } }, h('span', { html: svg(a.icon || a.id, 18) }), a.label));
  const side = h('div.sw-wheel-side.glass', {},
    actBtns.length ? h('div.lab', {}, 'Tools') : null, actBtns.length ? h('div.sw-acts', {}, actBtns) : null,
    h('div.lab', {}, 'Brush'), h('div.sw-modes', {}, modeBtns), modeHint,
    ...(build ? [h('div.lab', {}, 'Box size (W × H × D)'), h('div.sw-dims', {}, dims),
      h('button.sw-btn.small', { onclick: () => { setBrush(ctx, 'dims', [1, 1, 1]); click(); paint(); } }, 'Reset size to 1×1×1')]
      : [h('div.hint', { style: { fontSize: '12px', color: 'var(--ink-3)' } }, 'Big boxes (W×H×D) are a Build mode power. In Survival you place one block at a time.')]),
    h('div.lab', {}, 'Camera'), viewSeg);

  const wrap = h('div.sw-wheel-wrap', { onpointerdown: (e) => { if (e.target === wrap) close(); } }, wheel, side);
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel']) wrap.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  function paint() {
    const br = ctx.brush || {};
    const sc = br.scale ?? 1, md = br.mode ?? 'fill', dm = br.dims || [1, 1, 1];
    for (const [s, el] of segs) el.classList.toggle('on', s === sc);
    hubB.textContent = LABEL[sc] || sc;
    hubS.textContent = sc < 1 ? 'fine' : sc === 1 ? 'block' : `${sc}× block`;
    modeBtns.forEach((bt, i) => bt.classList.toggle('on', MODES[i][0] === md));
    modeHint.textContent = MODE_HINT[md] || '';
    dm.forEach((v, i) => { dimVals[i].textContent = v; });
    const st = ctx.brush?.actions || [];
    for (const b of actBtns) b.disabled = !st.find((x) => x.id === b.dataset.id)?.enabled;
    const view = settings.get('view');
    viewSeg.querySelectorAll('button').forEach((bt) => bt.classList.toggle('on', bt.dataset.v === view));
  }
  const onKey = (e) => {
    const k = e.key;
    if (k === 'Escape' || k === 'q' || k === 'Q') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (/^[1-6]$/.test(k)) { e.stopPropagation(); const s = SCALES[+k - 1]; if (s <= maxScale) { setBrush(ctx, 'scale', s); paint(); } }
  };
  const onWheel = (e) => {
    const sc = ctx.brush?.scale ?? 1;
    let i = SCALES.indexOf(sc) + (e.deltaY > 0 ? -1 : 1);
    i = Math.max(0, Math.min(SCALES.length - 1, i));
    if (SCALES[i] <= maxScale) { setBrush(ctx, 'scale', SCALES[i]); click('tick'); paint(); }
  };
  wrap.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('keydown', onKey, true);

  const tick = setInterval(paint, 300);
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    clearInterval(tick);
    document.removeEventListener('keydown', onKey, true);
    wrap.remove(); click('close'); onClose?.();
  }
  root.append(wrap);
  paint();
  click('open');
  return { close, el: wrap };
}
