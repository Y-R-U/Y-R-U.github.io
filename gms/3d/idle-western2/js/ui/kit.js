import { el, btn, setText } from './dom.js?v=20261004b';
import { fmtCash } from '../state/format.js?v=20261004b';

export function section(body, title) {
  const s = el('section', 'sec');
  if (title) s.appendChild(el('h3', 'sec-t', title));
  body.appendChild(s);
  return s;
}

export function stat(parent, icon, value, label) {
  const s = el('div', 'stat');
  const v = el('b', 'stat-v', value);
  s.append(el('span', 'stat-i', icon), v);
  if (label) s.appendChild(el('small', 'stat-l', label));
  parent.appendChild(s);
  return (t) => setText(v, t);
}

// A purchasable row: glyph, short label, cost button. quote() and run() are re-read live.
export function buyRow(parent, ctx, { icon, label, sub = '', quote, run, after, done }) {
  const r = el('div', 'buy-row');
  const i = el('span', 'buy-i', icon);
  const txt = el('div', 'buy-txt');
  const l = el('b', 'buy-l', label);
  const s = el('small', 'buy-s', sub);
  txt.append(l, s);
  const b = btn('buy-btn', '', (e) => {
    e.stopPropagation();
    const res = run();
    if (res?.ok) {
      ctx.audio.sfx.pop();
      ctx.buzz(8);
      ctx.juice.ring(b);
      after?.(res);
      ctx.textNow();
    } else if (res?.code === 'funds') {
      b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
      ctx.audio.sfx.nope();
    } else if (res?.msg) ctx.toast(res.msg);
  });
  r.append(i, txt, b);
  parent.appendChild(r);
  const update = () => {
    const isDone = done?.();
    r.classList.toggle('done', !!isDone);
    if (isDone) { setText(b, '✓'); b.disabled = true; return; }
    const q = quote();
    b.disabled = false;
    setText(b, q.lock || (isFinite(q.cost) ? fmtCash(q.cost) : '—'));
    b.classList.toggle('can', !!q.affordable);
    b.classList.toggle('locked', !!q.lock);
    if (typeof sub === 'function') setText(s, sub());
    if (typeof label === 'function') setText(l, label());
    if (typeof icon === 'function') setText(i, icon());
  };
  if (typeof sub === 'function') s.textContent = sub();
  if (typeof label === 'function') l.textContent = label();
  if (typeof icon === 'function') i.textContent = icon();
  update();
  update.row = r;
  return update;
}

export function toggle(parent, { icon, label, get, set }) {
  const r = el('label', 'tog-row');
  const inp = el('input');
  inp.type = 'checkbox';
  inp.checked = !!get();
  inp.addEventListener('change', () => set(inp.checked));
  r.append(el('span', 'buy-i', icon), el('span', 'tog-l', label), inp, el('i', 'tog'));
  parent.appendChild(r);
  return () => { inp.checked = !!get(); };
}

export function seg(parent, { icon, label, options, get, set }) {
  const r = el('div', 'seg-row');
  r.append(el('span', 'buy-i', icon), el('span', 'tog-l', label));
  const g = el('div', 'seg');
  const bs = options.map(([v, t]) => {
    const b = btn('seg-b', t, () => { set(v); paint(); });
    b.dataset.v = v;
    g.appendChild(b);
    return b;
  });
  const paint = () => bs.forEach((b) => b.classList.toggle('on', b.dataset.v === String(get())));
  paint();
  r.appendChild(g);
  parent.appendChild(r);
  return paint;
}

export function empty(parent, icon, text) {
  const e = el('div', 'empty');
  e.append(el('div', 'empty-i', icon), el('div', 'empty-t', text));
  parent.appendChild(e);
  return e;
}

// Volume row: mute toggle + range. get() returns 0..1; preview() plays a sample on release.
export function slider(parent, { icon, label, get, set, muted, mute, preview }) {
  const r = el('div', 'vol-row');
  const m = btn('vol-mute', icon, () => { mute(!muted()); paint(); }, 'Mute ' + label);
  const inp = el('input');
  inp.type = 'range';
  inp.min = '0'; inp.max = '1'; inp.step = '0.05';
  inp.setAttribute('aria-label', label + ' volume');
  inp.addEventListener('input', () => set(+inp.value));
  inp.addEventListener('change', () => preview?.());
  r.append(m, el('span', 'tog-l', label), inp);
  parent.appendChild(r);
  const paint = () => { const v = get(); if (document.activeElement !== inp) inp.value = String(v); r.classList.toggle('muted', !!muted()); };
  paint();
  return paint;
}
