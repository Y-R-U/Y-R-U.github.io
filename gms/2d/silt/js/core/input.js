/**
 * Relative drag, tap to rotate, swipe down to hard drop.
 *
 * Relative rather than absolute so the thumb never sits on top of the board —
 * this is a game about watching sand, and covering it with a finger defeats the
 * entire point.
 */
const TAP_SLOP = 14;     // css px of travel still counted as a tap
const TAP_MS = 260;
const SWIPE_V = 0.9;     // css px per ms downward that means "hard drop"
const HOLD_MS = 240;     // downward hold that means "soft drop"

export function createInput(el, view, handlers = {}) {
  const H = { onMove() {}, onRotate() {}, onHardDrop() {}, onSoftDrop() {}, onPaint: null, ...handlers };
  const st = { down: false, id: -1, x0: 0, y0: 0, lx: 0, ly: 0, t0: 0, travel: 0, carry: 0, soft: false, lastY: 0, lastT: 0 };
  let enabled = true;

  const local = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e) {
    if (!enabled || st.down) return;
    e.preventDefault();
    const p = local(e);
    st.down = true; st.id = e.pointerId;
    st.x0 = st.lx = p.x; st.y0 = st.ly = p.y;
    st.t0 = st.lastT = performance.now();
    st.lastY = p.y;
    st.travel = 0; st.carry = 0; st.soft = false;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    if (H.onPaint) H.onPaint(view.toGrain(p.x, p.y), true);
  }

  function move(e) {
    if (!st.down || e.pointerId !== st.id) return;
    e.preventDefault();
    const p = local(e);
    const dx = p.x - st.lx, dy = p.y - st.ly;
    st.travel += Math.abs(dx) + Math.abs(dy);
    st.lx = p.x; st.ly = p.y;

    if (H.onPaint) { H.onPaint(view.toGrain(p.x, p.y), false); return; }

    // Horizontal: accumulate sub-grain movement so slow drags still track.
    st.carry += dx / view.board.scale;
    const whole = Math.trunc(st.carry);
    if (whole !== 0) { st.carry -= whole; H.onMove(whole); }

    const now = performance.now();
    const vy = (p.y - st.lastY) / Math.max(1, now - st.lastT);
    st.lastY = p.y; st.lastT = now;
    if (vy > SWIPE_V && p.y - st.y0 > 40) {
      H.onHardDrop();
      st.down = false; st.soft = false; H.onSoftDrop(false);
      return;
    }
    if (!st.soft && p.y - st.y0 > 26 && now - st.t0 > HOLD_MS && Math.abs(p.x - st.x0) < 40) {
      st.soft = true; H.onSoftDrop(true);
    }
  }

  function up(e) {
    if (!st.down || (e.pointerId !== st.id && e.type !== 'pointercancel')) return;
    st.down = false;
    if (st.soft) { st.soft = false; H.onSoftDrop(false); }
    if (H.onPaint) { H.onPaint(null, false); return; }
    const dt = performance.now() - st.t0;
    if (st.travel < TAP_SLOP && dt < TAP_MS) H.onRotate();
  }

  el.addEventListener('pointerdown', down, { passive: false });
  el.addEventListener('pointermove', move, { passive: false });
  el.addEventListener('pointerup', up, { passive: false });
  el.addEventListener('pointercancel', up, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.key === 'ArrowLeft') H.onMove(-3);
    else if (e.key === 'ArrowRight') H.onMove(3);
    else if (e.key === 'ArrowUp' || e.key === 'x') H.onRotate();
    else if (e.key === ' ') { e.preventDefault(); H.onHardDrop(); }
    else if (e.key === 'ArrowDown') H.onSoftDrop(true);
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'ArrowDown') H.onSoftDrop(false); });

  return {
    setEnabled(v) { enabled = v; if (!v && st.down) { st.down = false; H.onSoftDrop(false); } },
    setPaint(fn) { H.onPaint = fn; },
    get touch() { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; },
  };
}
