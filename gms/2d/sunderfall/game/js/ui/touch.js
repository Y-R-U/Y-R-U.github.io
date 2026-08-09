/* SUNDERFALL UI — on-screen controls.
 *
 * The engine owns hit-testing (`input.registerZone`) and this owns everything you can see plus the
 * tap-versus-drag arbitration the engine deliberately does not do.
 *
 * Layout, portrait (DESIGN.md §6):
 *   left flank    analog stick that materialises wherever the thumb lands
 *   right flank   tap = jump, drag = aim (overriding the sim's auto-aim)
 *   bottom right  the cast circles, slot 1 largest, on a thumb arc
 *
 * Zones are registered stick -> act -> circles, because the engine resolves overlaps
 * last-registered-first and the circles must win.
 */

import { C, A, clamp01, easeOutCubic, txt } from './theme.js';

const TAU = Math.PI * 2;
const TAP_MS = 300;
const TAP_PX = 14;

export function createTouch(ctx, L, hooks) {
  const input = ctx.input;
  const surface = (ctx.R && ctx.R.canvas) || document.getElementById('game') || document.body;
  const offs = [];

  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0, r: 60, k: 0, id: -1 };
  const act = { id: -1, x: 0, y: 0, x0: 0, y0: 0, t0: 0, moved: false, flash: 0 };
  const aim = { active: false, x: 0, y: 0 };
  let jumpTicks = 0;
  let enabled = true;

  /* ---- zones ---- */
  const rects = {
    stick: () => L.stickZone,
    act: () => L.actZone,
  };
  function mount() {
    unmount();
    if (L.touch) {
      offs.push(input.registerZone('ui.stick', rects.stick, 'move'));
      offs.push(input.registerZone('ui.act', rects.act, 'ui'));
    }
    for (let i = 0; i < 5; i++) {
      const geo = L.circles[i];
      offs.push(input.registerZone('ui.slot' + i, () => geo.hit, i === 0 ? 'cast' : 'ui'));
    }
  }
  function unmount() { for (const o of offs) o(); offs.length = 0; }

  /* ---- raw pointer tracking, for visuals and tap/drag only ---- *
   * The engine gives us no way to see WHERE a stick pointer landed, and the difference between a
   * tap and a drag is a UI decision, not an engine one. Listeners are passive and never
   * preventDefault, so they cannot interfere with core/input.js.
   */
  function local(e) {
    const r = surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function onDown(e) {
    if (!enabled) return;
    const p = local(e);
    const ci = L.circleAt(p.x, p.y);
    if (ci >= 0) { hooks.onCirclePress(ci, p.x, p.y); return; }
    if (!L.touch) return;
    if (inRect(L.stickZone, p.x, p.y)) {
      stick.active = true; stick.id = e.pointerId;
      stick.ox = stick.x = p.x; stick.oy = stick.y = p.y;
      stick.r = Math.max(36, Math.min(L.stickZone.w, L.stickZone.h) * 0.36);
    } else if (inRect(L.actZone, p.x, p.y)) {
      act.id = e.pointerId;
      act.x = act.x0 = p.x; act.y = act.y0 = p.y;
      act.t0 = performance.now(); act.moved = false;
    }
  }

  function onMove(e) {
    if (e.pointerId === stick.id) {
      const p = local(e);
      stick.x = p.x; stick.y = p.y;
    } else if (e.pointerId === act.id) {
      const p = local(e);
      act.x = p.x; act.y = p.y;
      if (!act.moved && (Math.abs(p.x - act.x0) > TAP_PX || Math.abs(p.y - act.y0) > TAP_PX)) act.moved = true;
      if (act.moved) { aim.active = true; aim.x = p.x; aim.y = p.y; }
    }
  }

  function onUp(e) {
    if (e.pointerId === stick.id) { stick.active = false; stick.id = -1; }
    if (e.pointerId === act.id) {
      const dt = performance.now() - act.t0;
      if (!act.moved && dt < TAP_MS) {
        jumpTicks = 3;                       // held across a couple of fixed ticks so it registers
        act.flash = 1;
      }
      act.id = -1;
      aim.active = false;
    }
    for (let i = 0; i < 5; i++) hooks.onCircleRelease(i);
  }

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);

  return {
    stick, aim,
    remount: mount,
    setEnabled(v) {
      enabled = v;
      // clear on BOTH transitions — re-enabling with a stale stick.id meant the
      // knob stayed stuck to a finger that had long since lifted
      stick.active = false; stick.id = -1;
      act.id = -1; aim.active = false; jumpTicks = 0;
      input.setAction('jump', false);
    },

    update() {
      if (jumpTicks > 0) {
        input.setAction('jump', true);
        if (--jumpTicks === 0) input.setAction('jump', false);
      }
      // A drag on the right flank must beat auto-aim. core/input.js rebuilds `aim` from
      // `pointerScreen` every tick, so writing that is the supported way in.
      if (aim.active) {
        input.pointerScreen.x = aim.x;
        input.pointerScreen.y = aim.y;
        // take aim authority off the sim's auto-aim for as long as the drag lasts
        if (input.holdAim) input.holdAim();
      }
    },

    render(c, dt, now) {
      stick.k = clamp01(stick.k + (stick.active ? dt * 7 : -dt * 6));
      act.flash = Math.max(0, act.flash - dt * 3.2);
      if (!L.touch) return;

      if (stick.k > 0.01) {
        let dx = stick.x - stick.ox, dy = stick.y - stick.oy;
        const m = Math.hypot(dx, dy);
        if (m > stick.r) { dx = dx / m * stick.r; dy = dy / m * stick.r; }
        const a = easeOutCubic(stick.k);
        c.save();
        c.globalAlpha = a * 0.9;
        c.translate(stick.ox, stick.oy);
        // seat
        c.beginPath(); c.arc(0, 0, stick.r, 0, TAU);
        c.fillStyle = A(C.void, 0.28); c.fill();
        c.lineWidth = 2; c.strokeStyle = A(C.brass, 0.35); c.stroke();
        c.save();
        c.setLineDash([4, 7]);
        c.beginPath(); c.arc(0, 0, stick.r * 0.66, 0, TAU);
        c.lineWidth = 1; c.strokeStyle = A(C.ink, 0.18); c.stroke();
        c.restore();
        // knob
        c.beginPath(); c.arc(dx, dy, 21, 0, TAU);
        c.fillStyle = A('#12111c', 0.85); c.fill();
        c.lineWidth = 2.2; c.strokeStyle = A(C.arc, 0.75); c.stroke();
        c.beginPath(); c.arc(dx, dy, 6, 0, TAU);
        c.fillStyle = A(C.arc, 0.8); c.fill();
        c.restore();
        c.globalAlpha = 1;
      }

      if (act.flash > 0.01) {
        c.save();
        c.globalAlpha = act.flash * 0.5;
        c.beginPath(); c.arc(act.x0, act.y0, 20 + (1 - act.flash) * 26, 0, TAU);
        c.lineWidth = 2.5 * act.flash + 0.5;
        c.strokeStyle = A(C.goldL, 0.9); c.stroke();
        c.restore();
        c.globalAlpha = 1;
      }

      if (aim.active) {
        c.save();
        c.globalAlpha = 0.85;
        c.beginPath(); c.arc(aim.x, aim.y, 17, 0, TAU);
        c.lineWidth = 1.8; c.strokeStyle = A(C.ember, 0.9); c.stroke();
        c.beginPath();
        c.moveTo(aim.x - 25, aim.y); c.lineTo(aim.x - 9, aim.y);
        c.moveTo(aim.x + 9, aim.y); c.lineTo(aim.x + 25, aim.y);
        c.moveTo(aim.x, aim.y - 25); c.lineTo(aim.x, aim.y - 9);
        c.moveTo(aim.x, aim.y + 9); c.lineTo(aim.x, aim.y + 25);
        c.lineWidth = 1.4; c.strokeStyle = A(C.emberL, 0.75); c.stroke();
        c.restore();
        c.globalAlpha = 1;
      }
    },

    /** A one-line reminder of the controls, faded in for the first few seconds of a run. */
    hint(c, k) {
      if (k <= 0.01 || !L.touch) return;
      c.save();
      c.globalAlpha = k * 0.55;
      const y = L.stickZone.y + L.stickZone.h * 0.55;
      txt(c, 'HOLD TO MOVE', L.stickZone.x + L.stickZone.w * 0.5, y, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      const ax = L.actZone.x + L.actZone.w * 0.5;
      txt(c, 'TAP TO JUMP', ax, L.actZone.y + 30, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      txt(c, 'AIMS ITSELF · DRAG TO OVERRIDE', ax, L.actZone.y + 46, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      c.restore();
      c.globalAlpha = 1;
    },

    destroy() {
      unmount();
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    },
  };
}
