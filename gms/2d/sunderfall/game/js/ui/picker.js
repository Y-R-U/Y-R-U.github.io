/* SUNDERFALL UI — the swap picker.
 *
 * Tapping a cast circle used to open the whole pause overlay: the loadout tab,
 * every circle, the economy panel, settings one tab away. To change one spell in
 * one circle. On a phone that is four taps and a full stop to the run.
 *
 * We already know which circle was tapped, so this shows exactly one thing —
 * what could go in THAT circle — as a grid over the thumb cluster. The circle's
 * current spell is in the grid too, marked, so "what have I got in here?" and
 * "put something else in here" are the same gesture. Tap outside to leave.
 *
 * Canvas, not DOM: it must sit in the same space as the circles it belongs to,
 * follow the same portrait/landscape geometry, and never reflow the page.
 */

import { C, A, rr, txt, clamp01, easeOutCubic, schoolOf } from './theme.js';
import { blitIcon } from './circles.js';

const TAU = Math.PI * 2;

export function createPicker(ctx, L, st, hooks) {
  const p = {
    open: false,
    slot: -1,
    t: 0,
    items: [],          // {id, spell, x, y, r, current}
    panel: { x: 0, y: 0, w: 0, h: 0 },
  };

  const SPELLS = () => hooks.spells() || {};

  function build(slot) {
    p.items.length = 0;
    const all = SPELLS();
    const known = st.known && st.known.length ? st.known : [];
    const cur = st.slots[slot].spellId;
    const ids = known.slice();
    if (cur && ids.indexOf(cur) < 0) ids.unshift(cur);

    const s = L.circleScale || 1;
    const portrait = L.mode === 'portrait';
    const cell = (portrait ? 56 : 62) * (portrait ? s : 1);
    const gap = cell * 0.24;
    const cols = Math.max(1, Math.min(portrait ? 4 : 6, ids.length));
    const rows = Math.ceil(ids.length / cols);
    const padX = cell * 0.5, padTop = cell * 0.82, padBot = cell * 0.42;

    const w = cols * cell + (cols - 1) * gap + padX * 2;
    const h = rows * cell + (rows - 1) * gap + padTop + padBot;

    // Sit above the circle that was tapped, then clamp so the whole panel is on
    // screen. The clamp has to be against the viewport, not against the toast
    // row: toasts live at the top in portrait and at the BOTTOM in landscape, so
    // keeping clear of them put the panel at y=890 in a 900px-tall window — the
    // desktop picker was opening entirely below the bottom edge.
    const geo = L.circles[slot];
    const vw = L.w || 390, vh = L.h || 844;
    const pad = (L.pad || 12) + 4;
    let x = geo.x - w * 0.5;
    let y = geo.y - geo.r - 18 - h;
    x = Math.max(pad, Math.min(Math.max(pad, vw - w - pad), x));
    const top = pad + (portrait ? 70 : 56);          // clear of the resource cluster
    y = Math.max(top, Math.min(vh - h - pad, y));
    p.panel.x = x; p.panel.y = y; p.panel.w = w; p.panel.h = h;

    for (let i = 0; i < ids.length; i++) {
      const col = i % cols, row = (i / cols) | 0;
      p.items.push({
        id: ids[i], spell: all[ids[i]] || null,
        x: x + padX + col * (cell + gap) + cell * 0.5,
        y: y + padTop + row * (cell + gap) + cell * 0.5,
        r: cell * 0.5,
        current: ids[i] === cur,
      });
    }
  }

  return {
    state: p,
    get isOpen() { return p.open; },

    show(slot) {
      if (p.open && p.slot === slot) { p.open = false; return; }
      build(slot);
      p.slot = slot; p.open = true; p.t = 0;
    },
    close() { p.open = false; p.slot = -1; },

    /** True if the point was consumed — the caller must not treat it as a cast. */
    hit(x, y) {
      if (!p.open) return false;
      for (let i = 0; i < p.items.length; i++) {
        const it = p.items[i];
        const dx = x - it.x, dy = y - it.y;
        if (dx * dx + dy * dy <= it.r * it.r) {
          if (!it.current) hooks.assign(p.slot, it.id);
          this.close();
          return true;
        }
      }
      this.close();          // anywhere else dismisses, including on the panel
      return true;
    },

    update(dt) { if (p.open) p.t = Math.min(1, p.t + dt * 6); },

    draw(c, env) {
      if (!p.open) return;
      const k = easeOutCubic(clamp01(p.t));
      const pan = p.panel;
      const slot = st.slots[p.slot];

      // scrim — also the "tap anywhere to leave" affordance
      c.save();
      c.globalAlpha = k * 0.55;
      c.fillStyle = A('#05050a', 1);
      c.fillRect(0, 0, L.w || 4000, L.h || 4000);
      c.restore();

      c.save();
      c.globalAlpha = k;
      c.translate(pan.x + pan.w * 0.5, pan.y + pan.h * 0.5);
      c.scale(0.94 + 0.06 * k, 0.94 + 0.06 * k);
      c.translate(-(pan.x + pan.w * 0.5), -(pan.y + pan.h * 0.5));

      rr(c, pan.x, pan.y, pan.w, pan.h, 10);
      c.fillStyle = A('#0b0b14', 0.96); c.fill();
      c.strokeStyle = A(C.void, 0.9); c.lineWidth = 3; c.stroke();
      c.strokeStyle = A(C.brass, 0.5); c.lineWidth = 1.2; c.stroke();

      const title = 'CIRCLE ' + (p.slot + 1) + (slot.manual ? ' · TAP TO CAST' : ' · AUTO');
      txt(c, title, pan.x + 12, pan.y + 15, 9.5, A(C.brassL, 0.9),
        { base: 'middle', weight: 800, track: 2, caps: true });

      for (let i = 0; i < p.items.length; i++) {
        const it = p.items[i];
        const col = schoolOf(it.spell && it.spell.school).css || C.ink;
        c.beginPath(); c.arc(it.x, it.y, it.r, 0, TAU);
        c.fillStyle = A('#14141f', 0.95); c.fill();
        c.lineWidth = it.current ? 2.6 : 1.4;
        c.strokeStyle = A(col, it.current ? 1 : 0.45); c.stroke();
        if (it.current) {
          c.beginPath(); c.arc(it.x, it.y, it.r + 4.5, 0, TAU);
          c.lineWidth = 1; c.strokeStyle = A(col, 0.35); c.stroke();
        }
        blitIcon(c, it.spell, it.x, it.y - it.r * 0.12, it.r * 1.05, env.dpr, it.current ? 1 : 0.82);
        const name = (it.spell && it.spell.name) || it.id;
        txt(c, name, it.x, it.y + it.r * 0.72, 8, A(it.current ? C.ink : C.dim, 0.95),
          { align: 'center', base: 'middle', weight: 700, caps: true, track: 0.4 });
        // rank matters more than the name once you have two of the same school
        const rank = (st.ranks && st.ranks[it.id]) || 1;
        if (rank > 1) {
          txt(c, 'R' + rank, it.x + it.r * 0.74, it.y - it.r * 0.66, 8.5, A(C.gold, 0.95),
            { align: 'center', base: 'middle', weight: 800 });
        }
        // where it already is, so you cannot silently swap two circles' spells
        const inSlot = st.slots.findIndex((s2) => s2.spellId === it.id);
        if (inSlot >= 0 && !it.current) {
          txt(c, String(inSlot + 1), it.x - it.r * 0.74, it.y - it.r * 0.66, 8.5, A(C.brassL, 0.8),
            { align: 'center', base: 'middle', weight: 800 });
        }
      }
      c.restore();
      c.globalAlpha = 1;
    },
  };
}
