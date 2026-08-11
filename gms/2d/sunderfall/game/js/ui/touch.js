/* SUNDERFALL UI — on-screen controls.
 *
 * The engine owns hit-testing (`input.registerZone`) and this owns everything you can see plus the
 * tap-versus-drag arbitration the engine deliberately does not do.
 *
 * Layout, portrait (DESIGN.md §6):
 *   left flank    analog stick that materialises wherever the thumb lands
 *   right flank   press = jump for as long as it is held, drag = aim (overriding auto-aim)
 *   bottom right  the cast circles, slot 1 largest, on a thumb arc
 *
 * Zones are registered stick -> act -> circles, because the engine resolves overlaps
 * last-registered-first and the circles must win.
 */

import { C, A, clamp01, easeOutCubic, txt } from './theme.js';

const TAU = Math.PI * 2;
const TAP_PX = 14;
// how far off horizontal the movement stick has to be before it takes aim, and
// how far it must come back before it gives it up again
const STICK_AIM_ON = 0.50, STICK_AIM_OFF = 0.34;

export function createTouch(ctx, L, hooks) {
  const input = ctx.input;
  const surface = (ctx.R && ctx.R.canvas) || document.getElementById('game') || document.body;
  const offs = [];

  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0, r: 60, k: 0, id: -1 };
  const act = { id: -1, x: 0, y: 0, x0: 0, y0: 0, t0: 0, moved: false, flash: 0 };
  /* `dx, dy` is a unit direction, not a screen point — see input.setAimVector.
   * `from` says which thumb owns it, because both can aim and the right one wins. */
  const aim = { active: false, x: 0, y: 0, dx: 0, dy: 0, from: '' };
  /* Jump is pressed on touch-DOWN and held for as long as the finger is down.
   *
   * It used to fire on touch-UP, from a tap/drag arbitration, and hold for three
   * ticks — so every mobile jump was 50ms long, which the variable-height cut in
   * player.js then chopped to 42%. Mobile could clear ~78px where the keyboard
   * cleared 196, and the level is built for 185. That is why "jump it" was a lie.
   * jumpMin keeps a flick-tap alive long enough for the fixed step to see it. */
  let jumpMin = 0, jumpDown = false, jumpRelease = false;
  let enabled = true;

  /* ---- zones ---- */
  const rects = {
    stick: () => L.stickZone,
    act: () => L.actZone,
    cast: () => L.castZone,
  };
  function mount() {
    unmount();
    if (L.touch) {
      offs.push(input.registerZone('ui.stick', rects.stick, 'move'));
      offs.push(input.registerZone('ui.act', rects.act, 'ui'));
    }
    // Slot 0 claims the whole cast zone, not its own circle: it is the one zone
    // here that fires a real action, and a press that misses the circle by a few
    // px used to land on `ui.act` — an action nothing listens to — and silently
    // do nothing at all. The later registrations win where they overlap, so the
    // small circles still sit on top of the corner of it.
    for (let i = 0; i < 5; i++) {
      const geo = L.circles[i];
      offs.push(input.registerZone('ui.slot' + i, i === 0 ? rects.cast : () => geo.hit, i === 0 ? 'cast' : 'ui'));
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
    // The swap picker floats over the circles it belongs to, so it gets first
    // refusal on every press — including the one that dismisses it.
    if (hooks.onPointerDown && hooks.onPointerDown(p.x, p.y)) return;
    // Beside or under the big circle is a cast, not a jump — "I tapped the
    // button and he jumped" was every miss of a 44px target. Above it is jump,
    // and the circles are packed tight enough now to leave room for it.
    const ci = L.clusterAt(p.x, p.y);
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
      act.flash = 1;
      jumpDown = true; jumpRelease = false; jumpMin = 3;
      input.setAction('jump', true);
    }
  }

  function onMove(e) {
    if (e.pointerId === stick.id) {
      const p = local(e);
      stick.x = p.x; stick.y = p.y;
    } else if (e.pointerId === act.id) {
      const p = local(e);
      act.x = p.x; act.y = p.y;
      if (!act.moved && (Math.abs(p.x - act.x0) > TAP_PX || Math.abs(p.y - act.y0) > TAP_PX)) {
        act.moved = true;
        // A drag is an aim, not a jump. Letting the hold stand meant every
        // attempt to aim also launched him — and aiming DOWN launched him up.
        jumpRelease = true;
      }
      if (act.moved) {
        aim.active = true; aim.x = p.x; aim.y = p.y; aim.from = 'act';
        aim.dx = p.x - act.x0; aim.dy = p.y - act.y0;
      }
    }
  }

  function onUp(e) {
    if (e.pointerId === stick.id) { stick.active = false; stick.id = -1; }
    if (e.pointerId === act.id) {
      jumpRelease = true;
      act.id = -1;
      if (aim.from === 'act') { aim.active = false; aim.from = ''; }
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
      act.id = -1; aim.active = false; aim.from = '';
      jumpDown = false; jumpRelease = false; jumpMin = 0;
      input.setAction('jump', false);
      if (input.clearAimVector) input.clearAimVector();
    },

    update() {
      if (jumpDown) {
        if (jumpMin > 0) jumpMin--;
        if (jumpRelease && jumpMin <= 0) { jumpDown = false; input.setAction('jump', false); }
      }

      /* Aiming down.
       *
       * The movement stick's vertical axis drove nothing at all — `up` and
       * `down` were set and never read — while the only way to aim was a drag
       * on the far side of the screen, which is the thumb that is also holding
       * jump. So: push the stick down and the shot goes down. It only claims
       * aim once the stick is properly off horizontal, so running left and
       * right never steals auto-aim off an enemy, and it releases with
       * hysteresis so a wobbling thumb does not flicker between the two. */
      if (stick.active && L.touch && aim.from !== 'act') {
        let dx = stick.x - stick.ox, dy = stick.y - stick.oy;
        const m = Math.hypot(dx, dy);
        if (m > stick.r) { dx = dx / m * stick.r; dy = dy / m * stick.r; }
        const vy = dy / stick.r;
        const on = aim.from === 'stick' ? Math.abs(vy) > STICK_AIM_OFF : Math.abs(vy) > STICK_AIM_ON;
        if (on) { aim.active = true; aim.from = 'stick'; aim.dx = dx; aim.dy = dy; }
        else if (aim.from === 'stick') { aim.active = false; aim.from = ''; }
      } else if (aim.from === 'stick') {
        aim.active = false; aim.from = '';
      }

      if (aim.active && input.setAimVector) {
        input.setAimVector(aim.dx, aim.dy, aim.from);
      } else if (input.clearAimVector) {
        input.clearAimVector();
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

      // Aim is a direction now, so the readout is an arrow out of the thumb that
      // owns it — a crosshair sitting under the finger said "the shot goes
      // HERE", which was exactly the lie that made aiming down feel broken.
      if (aim.active) {
        const m = Math.hypot(aim.dx, aim.dy) || 1;
        const ux = aim.dx / m, uy = aim.dy / m;
        const ox = aim.from === 'stick' ? stick.ox : act.x0;
        const oy = aim.from === 'stick' ? stick.oy : act.y0;
        const len = 54;
        c.save();
        c.globalAlpha = 0.9;
        c.lineWidth = 2.2;
        c.strokeStyle = A(C.ember, 0.85);
        c.beginPath();
        c.moveTo(ox + ux * 22, oy + uy * 22);
        c.lineTo(ox + ux * len, oy + uy * len);
        c.stroke();
        const hx = ox + ux * (len + 9), hy = oy + uy * (len + 9);
        c.beginPath();
        c.moveTo(hx, hy);
        c.lineTo(hx - ux * 13 - uy * 8, hy - uy * 13 + ux * 8);
        c.lineTo(hx - ux * 13 + uy * 8, hy - uy * 13 - ux * 8);
        c.closePath();
        c.fillStyle = A(C.emberL, 0.9); c.fill();
        if (aim.from === 'act') {
          c.beginPath(); c.arc(ox, oy, 16, 0, TAU);
          c.lineWidth = 1.4; c.strokeStyle = A(C.ember, 0.35); c.stroke();
        }
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
      const sx = L.stickZone.x + L.stickZone.w * 0.5;
      txt(c, 'HOLD TO MOVE', sx, y, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      txt(c, 'PULL DOWN TO', sx, y + 16, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      txt(c, 'AIM DOWN', sx, y + 32, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      const ax = L.actZone.x + L.actZone.w * 0.5;
      // three short lines, not two long ones — at 9.5px with tracking, anything
      // over ~20 characters runs off the right edge of a 390px portrait
      txt(c, 'HOLD TO JUMP', ax, L.actZone.y + 30, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      txt(c, 'TAP AGAIN IN THE AIR', ax, L.actZone.y + 46, 9.5, C.dim,
        { align: 'center', base: 'middle', track: 2, weight: 700 });
      txt(c, 'AIMS ITSELF · DRAG TO AIM', ax, L.actZone.y + 62, 9.5, C.dim,
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
