/**
 * The one-thumb control surface, visible half — DESIGN §2.2/§2.4, §6.4.
 *
 * `js/core/input.js` already owns the gesture: hold-and-slide anywhere in the
 * profile's `stickZone`, no input on touchdown, the anchor slides so the player
 * can never run out of screen at the bottom bezel, and release eases to zero
 * over 0.18 s. P2 built and falsified all of that. **This file adds nothing to
 * the gesture** — it draws it, and it wires the two things that are UI rather
 * than input: the special tap and the crate-engagement toggle.
 *
 * The stick ring is deliberately faint. A bright ring under the thumb is the
 * fastest way to make a painted game look like a control demo, and the thumb is
 * already there — the ring's job is to say where the ANCHOR is after a slide,
 * which is the one thing the thumb hides.
 */

import { METRICS } from './layout.js';
import { INK, mark, label, font, rgba } from './theme.js';

const LONG_PRESS = 0.5;          // DESIGN §2.4's long-press, in seconds

export function createStick(ctx, opts = {}) {
  const input = ctx.input;
  const view = ctx.view;
  const subs = [];
  let onSpecial = opts.onSpecial || null;
  let onEngage = opts.onEngage || null;

  // §6.4: a tap OUTSIDE the stick zone fires the loaded special. The flying
  // thumb never moves; that is the whole reason there is exactly one slot.
  subs.push(input.onTap((t) => {
    if (t.inStick) return;
    if (holdFired) { holdFired = false; return; }     // the long-press already spoke
    if (onSpecial) onSpecial(t);
  }));

  const specialRect = () => ctx.layout.special;
  let holdT = 0, holding = false, holdFired = false;

  /** Called once per tick, after `input.update()`. */
  function update(dt) {
    const r = specialRect();
    const inSlot = input.pointerDown && r &&
      input.pointerScreen.x >= r.x && input.pointerScreen.x <= r.x + r.w &&
      input.pointerScreen.y >= r.y && input.pointerScreen.y <= r.y + r.h;
    if (!inSlot) { holding = false; holdT = 0; return; }
    if (!holding) { holding = true; holdT = 0; holdFired = false; }
    holdT += dt;
    if (holdT >= LONG_PRESS && !holdFired) {
      holdFired = true;
      // P6_NOTES §13.3 asked P7 how a one-thumb player chooses DENY over CUT.
      // This is the answer, and it costs no button: a long press on the special
      // slot flips the engagement policy. Long-press never FIRES (§2.4), so the
      // gesture was free. It collides with §2.4's "cycle owned specials" from
      // Act 4 onward and that collision is P13's to resolve — see P7_NOTES.
      if (onEngage) onEngage();
    }
  }

  function draw(g, L, st) {
    const s = input.stick;
    if (s.active) {
      // the anchor, and the track from anchor to thumb — the anchor is the part
      // the thumb is covering, so it is the part worth drawing
      mark(g, (p) => p.arc(s.ox, s.oy, s.r, 0, Math.PI * 2),
           { col: INK.bright, a: INK.stickA, w: METRICS.STICK_RING_W, outlineA: INK.stickA });
      mark(g, (p) => { p.moveTo(s.ox, s.oy); p.lineTo(s.x, s.y); },
           { col: INK.bright, a: INK.stickA, w: METRICS.STICK_TRACK_W, outlineA: INK.stickA });
      mark(g, (p) => p.arc(s.x, s.y, METRICS.STICK_THUMB_R, 0, Math.PI * 2),
           { col: INK.brass, a: INK.stickA, w: METRICS.STICK_TRACK_W });
    }

    // the special slot: a ring that is also the ammo count (DESIGN §2.4)
    const r = L.special;
    const n = st.specialAmmo | 0;
    const loaded = !!st.special && n > 0;
    mark(g, (p) => p.arc(r.cx, r.cy, r.r, 0, Math.PI * 2),
         { col: loaded ? INK.brass : INK.ink, a: loaded ? INK.glassA : INK.stickA, w: METRICS.SPECIAL_RING_W });
    if (loaded) {
      const frac = Math.min(1, n / Math.max(1, st.specialAmmoMax || n));
      g.beginPath();
      g.arc(r.cx, r.cy, r.r, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * frac);
      g.strokeStyle = rgba(INK.crate, INK.tapeMarkA);
      g.lineWidth = METRICS.SPECIAL_RING_W;
      g.stroke();
      g.font = font(METRICS.FONT_LABEL);
      label(g, st.specialGlyph || String(n), r.cx, r.cy, { col: INK.brass, align: 'center' });
    }
    // the engagement policy, so DENY is never a mode you are in without knowing
    if (st.engage) {
      g.font = font(METRICS.FONT_SMALL);
      label(g, st.engage.toUpperCase(), r.cx, r.y + r.h, { col: INK.crate, align: 'center' });
    }
  }

  return {
    update, draw,
    set onSpecial(fn) { onSpecial = fn; },
    set onEngage(fn) { onEngage = fn; },
    /** Every subscription this module made, released together. */
    destroy() { for (const u of subs) u(); subs.length = 0; void view; },
  };
}
