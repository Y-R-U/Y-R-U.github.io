// Result banner (results-banner agent, Aaron 2026-11-01): "When you win/lose, you want to see the board
// to either enjoy your victory or see what happened ... a semi transparent simple message that can be
// minimised ... default is you can still see the board".
//
// Shared by the bot game (screens/game.js) and the online game (screens/online_game.js).
// Three states, all reversible:
//   'banner'   — a translucent gold-bordered strip on the board's top or bottom edge (in the empty band
//                outside the 8×8 area when the view leaves room, else over the edge rank that hides the
//                least: never over the mated king / its checkers, then the fewest pieces). Title, key
//                number, and big (≥44 px) buttons: the screen's actions (Rematch …), Details, Hide.
//   'pill'     — just a small "▴ You win" pill in a corner: the whole board is visible. Tap → banner.
//   'expanded' — the screen's full results sheet is up (the banner hides under it); closing the sheet
//                calls setState('banner').
// A win pops the banner in over the board centre for ~1.5 s, then it docks (reduced motion: no pop).
// Action buttons carry data-act, so the screen's own delegated click handler runs them; Details is
// data-act="results" (the screen's showResults). Only Hide / the pill are handled here.
//
//   const rb = showResultBanner(stageEl, { board, kind: 'win'|'loss'|'draw', title, sub, short,
//                                          actions: [{act, label, icon, primary, disabled, pulse}], celebrate });
//   rb.setState('banner'|'pill'|'expanded'); rb.update({title, sub, actions}); rb.place(); rb.dispose();
import { icon, esc } from './ui.js';

export const CELEBRATE_MS = 1500;

// The big "back to the board" control at the top of the results sheet (replaces the small "View board"
// link Aaron missed). data-close → openSheet closes the sheet → its onClose puts the banner back.
export const resHideBtn = () => `<button type="button" class="res-hide" data-close aria-label="Hide details and show the board">${icon('chevron')}<span>Show board</span></button>`;

const CSS = `
.rb{position:absolute;inset:0;z-index:6;pointer-events:none;container-type:inline-size}
.rb-card,.rb-pill{position:absolute;left:0;top:0;pointer-events:auto;will-change:transform,opacity;
  transition:transform .5s cubic-bezier(.55,0,.25,1),opacity .3s ease-out}
.rb-card{display:flex;align-items:center;gap:8px;width:min(calc(100% - 12px),520px);box-sizing:border-box;padding:5px 5px 5px 8px;border-radius:14px;
  background:linear-gradient(180deg,rgba(18,22,32,.56),rgba(10,12,18,.5));border:1.5px solid rgba(227,183,96,.85);
  box-shadow:0 0 0 1px rgba(255,214,140,.14) inset,0 6px 22px rgba(0,0,0,.42);
  -webkit-backdrop-filter:blur(1px);backdrop-filter:blur(1px);color:#fff0d0}
.rb-card.cel{transition:transform .32s cubic-bezier(.2,1.5,.4,1),opacity .2s ease-out;background:radial-gradient(130% 160% at 50% 0%,rgba(70,52,16,.82),rgba(14,12,10,.78) 72%);
  box-shadow:0 0 0 1px rgba(255,214,140,.25) inset,0 0 0 4px rgba(224,182,96,.35),0 10px 36px rgba(0,0,0,.5),0 0 46px rgba(255,200,90,.4)}
.rb-ic{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);color:#e9cf98}
.rb-ic .ic{width:19px;height:19px}
.rb-card.k-win .rb-ic{background:linear-gradient(135deg,#f3d48d,#b98431);color:#1e1505;box-shadow:0 0 12px rgba(224,182,96,.5)}
.rb-card.k-loss .rb-ic{background:rgba(160,40,30,.45);color:#ffd9c8}
.rb-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;line-height:1.15}
.rb-txt b{font:800 clamp(12px,3.9cqw,17px)/1.15 'Cinzel',Georgia,'Times New Roman',serif;letter-spacing:.05em;color:#f6dfa6;text-shadow:0 1px 0 #000,0 0 8px rgba(0,0,0,.6);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rb-card.k-loss .rb-txt b,.rb-card.k-draw .rb-txt b{color:#f3ead8}
.rb-txt small{font:700 11.5px/1.2 system-ui,sans-serif;color:#d9cdb4;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rb-txt small .good{color:#8fe08a}.rb-txt small .bad{color:#ff9a8a}
.rb-acts{flex:none;display:flex;gap:4px}
.rb-btn{min-width:46px;height:46px;padding:0 6px;border-radius:10px;border:1px solid rgba(227,183,96,.4);background:rgba(255,255,255,.07);color:#f3e6c8;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font:700 10px/1 system-ui,sans-serif;letter-spacing:.02em;cursor:pointer}
.rb-btn .ic{width:18px;height:18px}
.rb-btn.primary{background:linear-gradient(180deg,#ecc875,#c0903e);color:#1e1505;border-color:#f3d48d}
.rb-btn:disabled{opacity:.5}
.rb-btn.pulse{animation:rbPulse 1.4s ease-in-out infinite}
@keyframes rbPulse{50%{box-shadow:0 0 0 3px rgba(240,200,110,.55)}}
.rb-btn.rb-hide .ic{transform:rotate(90deg)}
.rb-card.edge-top .rb-btn.rb-hide .ic{transform:rotate(-90deg)}
.rb-pill{display:flex;align-items:center;gap:6px;height:44px;padding:0 12px 0 8px;border-radius:999px;border:1.5px solid rgba(227,183,96,.85);
  background:rgba(12,14,20,.72);color:#f6dfa6;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer;
  font:800 13px/1 'Cinzel',Georgia,serif;letter-spacing:.06em;white-space:nowrap}
.rb-pill .ic{width:17px;height:17px}
.rb-pill .rb-chev{transform:rotate(-90deg);opacity:.85}
.rb-pill.edge-top .rb-chev{transform:rotate(90deg)}
.rb-pill.k-win .rb-pi{color:#ffd25e}
.rb[data-state="banner"] .rb-pill,.rb[data-state="pill"] .rb-card,.rb[data-state="expanded"] .rb-card,.rb[data-state="expanded"] .rb-pill{opacity:0!important;pointer-events:none!important}
@container (max-width:340px){.rb-btn{min-width:44px;padding:0 4px}.rb-ic{width:28px;height:28px}.rb-card{gap:6px}}
@media (prefers-reduced-motion: reduce){.rb-card,.rb-pill{transition:none}.rb-btn.pulse{animation:none}}`;
let cssDone = false;
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const KIND_ICON = { win: 'trophy', loss: 'flag', draw: 'handshake', abort: 'x' };
const FILES = 'abcdefgh';

export function showResultBanner(stage, opts) {
  if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
  let o = { ...opts };
  const board = o.board;
  const root = document.createElement('div');
  root.className = 'rb';
  const card = document.createElement('div');
  card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
  const pill = document.createElement('button');
  pill.type = 'button'; pill.dataset.rb = 'banner';
  root.append(card, pill);
  stage.appendChild(root);

  let state = 'banner', edge = 'bottom', timers = [], disposed = false, celebrating = false;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function paint() {
    const k = o.kind || 'draw';
    card.className = `rb-card k-${k} edge-${edge}${celebrating ? ' cel' : ''}`;
    card.innerHTML = `<span class="rb-ic">${icon(KIND_ICON[k] || 'info')}</span>
      <div class="rb-txt"><b>${esc(o.title)}</b>${o.sub ? `<small>${o.sub}</small>` : ''}</div>
      <div class="rb-acts">${(o.actions || []).map(a => `<button type="button" class="rb-btn${a.primary ? ' primary' : ''}${a.pulse ? ' pulse' : ''}" data-act="${esc(a.act)}"${a.disabled ? ' disabled' : ''} aria-label="${esc(a.aria || a.label)}">${icon(a.icon)}<span>${esc(a.label)}</span></button>`).join('')}
        <button type="button" class="rb-btn" data-act="results" aria-label="Show full results">${icon('chart')}<span>Details</span></button>
        <button type="button" class="rb-btn rb-hide" data-rb="pill" aria-label="Hide the result banner">${icon('chevron')}<span>Hide</span></button></div>`;
    pill.className = `rb-pill k-${k} edge-${edge}`;
    pill.setAttribute('aria-label', `${o.title}: show the result`);
    pill.innerHTML = `<span class="rb-pi">${icon(KIND_ICON[k] || 'info')}</span><span>${esc(o.short || o.title)}</span><span class="rb-chev">${icon('chevron')}</span>`;
  }

  function xy(el, x, y, s = 1) { el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${s})`; }

  // occupied squares from the board's own placement (FEN field), plus the squares never to cover
  function squares() {
    const occ = [];
    try {
      const rows = board.placement().split('/');
      rows.forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { occ.push(FILES[f] + (8 - i)); f++; } } });
    } catch { /* no board */ }
    let avoid = [...(o.avoid || [])];
    try { const cs = board.checkState?.(); if (cs) avoid.push(cs.king, ...(cs.checkers || []).map(c => c.square || c)); } catch { /* ignore */ }
    return { occ, avoid };
  }

  /** dock target for the banner and the pill: {edge, cx, cy, px, py} in stage px */
  function target() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1, pad = 6;
    const ch = card.offsetHeight || 58;
    const pw = pill.offsetWidth || 130, ph = pill.offsetHeight || 44;
    let r = { left: 0, top: 0, right: w, bottom: h };
    try { if (board?.boardRect) r = board.boardRect(); } catch { /* ignore */ }
    const { occ, avoid } = squares();
    const sy = sq => { try { return board.squareToScreen(sq); } catch { return null; } };
    const occP = occ.map(sy).filter(Boolean), avP = avoid.filter(Boolean).map(sy).filter(Boolean);
    const sqH = Math.max(1, (r.bottom - r.top) / 8);
    const cost = (e, bandH) => {
      const gap = e === 'top' ? r.top : h - r.bottom;
      if (gap >= bandH + 4) return { gap: true, c: e === 'bottom' ? 0 : 0.1 };
      const lo = e === 'top' ? 0 : h - bandH - pad, hi = e === 'top' ? bandH + pad : h;
      const inside = p => p.y + sqH * 0.35 > lo && p.y - sqH * 0.35 < hi;
      return { gap: false, c: 1 + avP.filter(inside).length * 20 + occP.filter(inside).length };
    };
    const ct = cost('top', ch), cb = cost('bottom', ch);
    const e = cb.c <= ct.c ? 'bottom' : 'top';
    const info = e === 'top' ? ct : cb;
    let cy;
    if (info.gap) cy = e === 'top' ? r.top / 2 : (r.bottom + h) / 2;
    else cy = e === 'top' ? ch / 2 + pad : h - ch / 2 - pad;
    cy = Math.min(h - ch / 2 - 2, Math.max(ch / 2 + 2, cy));
    // pill: same edge, the corner that hides the least
    const pc = side => {
      const x0 = side === 'left' ? 0 : w - pw - pad * 2, x1 = x0 + pw + pad * 2;
      const lo = e === 'top' ? 0 : h - ph - pad * 2, hi = e === 'top' ? ph + pad * 2 : h;
      const inside = p => p.x > x0 - sqH * 0.3 && p.x < x1 + sqH * 0.3 && p.y + sqH * 0.35 > lo && p.y - sqH * 0.35 < hi;
      return avP.filter(inside).length * 20 + occP.filter(inside).length;
    };
    const right = pc('right') <= pc('left');
    const px = right ? w - pw / 2 - pad : pw / 2 + pad;
    let py;
    const pg = e === 'top' ? r.top : h - r.bottom;
    if (pg >= ph + 4) py = e === 'top' ? r.top / 2 : (r.bottom + h) / 2;
    else py = e === 'top' ? ph / 2 + pad : h - ph / 2 - pad;
    return { edge: e, cx: w / 2, cy, px, py };
  }

  function place() {
    if (disposed) return;
    const t = target();
    if (t.edge !== edge) { edge = t.edge; card.classList.toggle('edge-top', edge === 'top'); card.classList.toggle('edge-bottom', edge === 'bottom'); pill.classList.toggle('edge-top', edge === 'top'); }
    if (!celebrating) xy(card, t.cx, t.cy);
    xy(pill, t.px, t.py);
  }

  function setState(s) {
    if (disposed) return;
    state = s; root.dataset.state = s;
    if (s !== 'expanded') place();
  }

  paint();
  root.dataset.state = 'banner';
  // first placement + optional celebration (centre pop, then dock)
  const w0 = stage.clientWidth || 1, h0 = stage.clientHeight || 1;
  if (o.celebrate && !reduced()) {
    celebrating = true; paint();
    card.style.transition = 'none'; card.style.opacity = '0'; xy(card, w0 / 2, h0 / 2, 0.6);
    void card.offsetWidth;
    card.style.transition = ''; card.style.opacity = '1'; xy(card, w0 / 2, h0 / 2, 1);
    later(() => { celebrating = false; card.style.opacity = ''; card.classList.remove('cel'); paint(); place(); }, CELEBRATE_MS);
  } else {
    card.style.transition = 'none'; card.style.opacity = '0';
    place();
    void card.offsetWidth;
    card.style.transition = ''; card.style.opacity = '';
  }
  place();

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-rb]'); if (!b) return;
    e.stopPropagation();
    setState(b.dataset.rb);
  });
  const reflow = () => { if (!celebrating && state !== 'expanded') place(); };
  const offs = [];
  if (board?.on) { offs.push(board.on('view', () => setTimeout(reflow, 480))); offs.push(board.on('theme', reflow)); }
  const ro = new ResizeObserver(reflow); ro.observe(stage);
  const onUp = () => setTimeout(reflow, 60);
  stage.addEventListener('pointerup', onUp);

  const api = {
    el: root,
    get state() { return state; },
    get edge() { return edge; },
    get celebrating() { return celebrating; },
    setState, place,
    update(patch) { o = { ...o, ...patch }; paint(); place(); },
    dispose() {
      if (disposed) return; disposed = true;
      timers.forEach(clearTimeout); offs.forEach(f => { try { f?.(); } catch { /* ignore */ } });
      ro.disconnect(); stage.removeEventListener('pointerup', onUp); root.remove();
    },
  };
  return api;
}
