// Check alert (checkalert agent, Aaron 2026-10-31): "when in check a check popup shows up to make it
// super obvious, after a few seconds move it above or below the board".
//
// The board draws the red king square, the checker tint and the red links itself (board.js
// refreshOverlays) and emits 'check' {king, color, checkers[], double, key, popup} once the move
// animation / battle has landed, and null when the check is gone. This module (attached once to
// the shared board in boardhost.js, so bot games, online games, puzzles and lessons all get it)
// turns that into:
//   1. a big gold-bordered "CHECK" card over the centre of the board (quick pop-in),
//   2. after HOLD_MS it flies to a compact badge on the board's top or bottom edge nearest the
//      king in check — in the gap outside the 8×8 area when the view leaves room (3D / Tilt),
//      else hugging the outer edge (over the frame), in the half of the board away from the king — and stays there
//      until the check is resolved, then fades.
//   Checkmate: no card or badge (the result sheet / puzzle celebration takes over); board visuals stay.
// Setting `checkAlerts` (default on) turns the card + badge off; the board visuals always show.
// prefers-reduced-motion: app.css already zeroes transitions; here the pop-in skips its scale too.
import { getSettings, onSettings } from './store.js';
import { deps } from './deps.js';

export const HOLD_MS = 2000;      // big card time before it docks
const POP_DELAY = 90;             // let the landed piece settle for a frame or two first

const CSS = `
.gb-chk{position:absolute;left:0;top:0;z-index:4;pointer-events:none;opacity:0;will-change:transform,opacity;
  transition:transform .32s cubic-bezier(.2,1.5,.4,1),opacity .18s ease-out;
  padding:12px 30px 13px;border-radius:16px;text-align:center;white-space:nowrap;
  background:radial-gradient(120% 140% at 50% 0%,rgba(92,14,10,.94),rgba(22,8,9,.94) 70%);
  border:2px solid #e3b760;box-shadow:0 0 0 1px rgba(255,214,140,.25) inset,0 0 0 4px rgba(255,40,24,.55),0 10px 36px rgba(0,0,0,.55),0 0 46px rgba(255,36,20,.45)}
.gb-chk.dock{transition:transform .5s cubic-bezier(.55,0,.25,1),opacity .5s ease-in}
.gb-chk b{display:block;font:800 clamp(30px,10.5cqw,54px)/1 'Cinzel',Georgia,'Times New Roman',serif;letter-spacing:.16em;padding-left:.16em;
  color:#fff0d0;text-shadow:0 0 14px rgba(255,60,30,.85),0 2px 0 #5a0c06}
.gb-chk small{display:block;margin-top:7px;font:700 12px/1.1 'Cinzel',Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#f1c98a}
.gb-chk-badge{position:absolute;left:0;top:0;z-index:4;pointer-events:none;opacity:0;display:flex;align-items:center;gap:6px;
  transition:opacity .25s ease-out;padding:3px 12px 4px 9px;border-radius:999px;white-space:nowrap;
  background:linear-gradient(180deg,rgba(150,18,12,.95),rgba(84,8,6,.95));border:1.5px solid #e3b760;
  box-shadow:0 0 0 2px rgba(255,40,24,.35),0 3px 12px rgba(0,0,0,.45);color:#fff0d0;
  font:800 13px/1.2 'Cinzel',Georgia,'Times New Roman',serif;letter-spacing:.14em}
.gb-chk-badge i{font-style:normal;font-size:15px;letter-spacing:0;line-height:1;color:#ffd7a0;text-shadow:0 0 6px rgba(255,80,40,.9)}
.gb-chk-badge.flush{padding:2px 9px 2px 7px;font-size:11px;gap:5px}.gb-chk-badge.flush i{font-size:12px}
.gb-chk-badge.on{opacity:1}
.gb-chk-badge.on.pulse{animation:gbChkPulse 1.6s ease-in-out 2}
@keyframes gbChkPulse{50%{box-shadow:0 0 0 4px rgba(255,40,24,.6),0 0 18px rgba(255,40,24,.7)}}
.board-host{container-type:inline-size}`;
let cssDone = false;
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const NAME = { w: 'White', b: 'Black' };

export function attachCheckAlert(board, host) {
  if (!board || !host || host.__checkAlert) return host?.__checkAlert;
  if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
  const pop = document.createElement('div'); pop.className = 'gb-chk'; pop.setAttribute('role', 'status'); pop.setAttribute('aria-live', 'assertive');
  const badge = document.createElement('div'); badge.className = 'gb-chk-badge'; badge.setAttribute('aria-hidden', 'true');
  host.append(pop, badge);

  let cur = null;               // current check state from the board
  let phase = 'off';            // 'off' | 'pop' | 'dock' | 'mate'
  let timers = [], lastPopKey = '';
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const enabled = () => getSettings().checkAlerts !== false;

  const W = () => host.clientWidth || 1, H = () => host.clientHeight || 1;
  function place(el, x, y, s = 1) { el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${s})`; }

  function isMate(st) {
    try {
      const C = deps.chess?.Chess; if (!C) return false;
      return !!new C(`${board.placement()} ${st.color} - - 0 1`).isCheckmate();
    } catch { return false; }
  }

  /** Where the docked badge goes: {x, y} centre in host px. */
  function dockTarget() {
    const r = board.boardRect(), w = W(), h = H(), pad = 4;
    const k = cur ? board.squareToScreen(cur.king) : { x: w / 2, y: h / 2 };
    const midY = (Math.max(0, r.top) + Math.min(h, r.bottom)) / 2;
    const bottom = k.y > midY;
    const gap = bottom ? h - r.bottom : r.top;
    const roomy = gap >= 26 + pad * 2;               // full badge outside the 8×8 area, else the compact one on the edge
    badge.classList.toggle('flush', !roomy);
    const bw = badge.offsetWidth || 110, bh = badge.offsetHeight || 24;
    let x, y;
    if (roomy) {                       // room outside the 8×8 area: centred over the king's file
      y = bottom ? (r.bottom + h) / 2 : r.top / 2;
      x = k.x;
    } else {                                         // flush view (Top): hug the outer edge (over the frame where there
      y = bottom ? h - bh / 2 - 1 : bh / 2 + 1;      // is one), so it only clips the edge squares' rim, away from the king
      const L = Math.max(0, r.left), R = Math.min(w, r.right);
      x = k.x > (L + R) / 2 ? L + bw / 2 + pad + 4 : R - bw / 2 - pad - 4;
    }
    x = Math.min(w - bw / 2 - pad, Math.max(bw / 2 + pad, x));
    y = Math.min(h - bh / 2 - 1, Math.max(bh / 2 + 1, y));
    return { x, y, bw, bh };
  }
  function placeBadge() {
    if (!cur) return null;
    const t = dockTarget(); place(badge, t.x, t.y); return t;
  }

  function hideAll() {
    clear(); phase = 'off';
    pop.classList.remove('dock'); pop.style.opacity = '0';
    badge.classList.remove('on', 'pulse');
  }

  function showBadge(pulse = true) {
    phase = 'dock';
    placeBadge();
    badge.classList.toggle('pulse', pulse && !reduced());
    badge.classList.add('on');
  }

  function onCheck(st) {
    cur = st;
    if (!st) { hideAll(); return; }
    if (!enabled()) { hideAll(); return; }
    // checkmate: no card and no badge — the result sheet / puzzle celebration owns that moment
    // (a CHECKMATE card collided with the puzzle's "Brilliant!" card). The red king + link stay.
    if (isMate(st)) { hideAll(); phase = 'mate'; return; }
    badge.innerHTML = `<i>♚</i>${st.double ? 'Double check' : 'Check'}`;
    badge.title = `${NAME[st.color]} king in check`;
    if (!st.popup) { clear(); pop.style.opacity = '0'; showBadge(false); return; }   // review: badge only
    if (st.key === lastPopKey) { clear(); pop.style.opacity = '0'; showBadge(false); return; }   // same check again (back from review)
    lastPopKey = st.key;
    clear();
    badge.classList.remove('on', 'pulse');
    pop.innerHTML = `<b>${st.double ? 'Double<br>check' : 'Check'}</b><small>${NAME[st.color]} king under attack</small>`;
    if (st.double) pop.querySelector('b').style.lineHeight = '1.05';
    later(() => {
      if (cur !== st) return;
      phase = 'pop';
      pop.classList.remove('dock');
      const cx = W() / 2, cy = H() / 2;
      pop.style.transition = 'none'; pop.style.opacity = '0';
      place(pop, cx, cy, reduced() ? 1 : 0.55);
      void pop.offsetWidth;
      pop.style.transition = '';
      pop.style.opacity = '1'; place(pop, cx, cy, 1);
      later(() => dock(st), HOLD_MS);
    }, POP_DELAY);
  }

  function dock(st) {
    if (cur !== st || !enabled()) return;
    const t = placeBadge(); if (!t) return;
    const pw = pop.offsetWidth || 200;
    if (reduced()) { pop.style.opacity = '0'; showBadge(false); return; }
    pop.classList.add('dock');
    place(pop, t.x, t.y, Math.max(0.2, t.bw / pw)); pop.style.opacity = '0';
    later(() => { if (cur === st) showBadge(true); }, 260);
    later(() => pop.classList.remove('dock'), 520);
  }

  // keep the badge on the edge as the view / size changes
  const reflow = () => { if (phase === 'dock') placeBadge(); };
  const offs = [board.on('check', onCheck), board.on('view', () => setTimeout(reflow, 450)), board.on('theme', reflow)];
  const ro = new ResizeObserver(reflow); ro.observe(host);
  const onUp = () => setTimeout(reflow, 60);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('wheel', onUp, { passive: true });
  offs.push(onSettings((s, patch) => {
    if (!patch || !('checkAlerts' in patch)) return;
    if (s.checkAlerts === false) hideAll();
    else if (cur) showBadge(false);
  }));
  const api = {
    get phase() { return phase; },
    get state() { return cur; },
    els: { pop, badge },
    dispose() { hideAll(); offs.forEach(f => { try { f?.(); } catch { /* ignore */ } }); ro.disconnect(); host.removeEventListener('pointerup', onUp); host.removeEventListener('wheel', onUp); pop.remove(); badge.remove(); delete host.__checkAlert; },
  };
  host.__checkAlert = api;
  return api;
}
