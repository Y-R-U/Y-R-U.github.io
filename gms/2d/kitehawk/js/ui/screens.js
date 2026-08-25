/**
 * The scene chrome — title, map, brief, pause, debrief, and the "again" card.
 *
 * NEW FILE, not an edit: every element here is composed out of `theme.js`'s
 * exported marks and `layout.js`'s safe rect, so P7's HUD files are untouched.
 * Raised as REQUEST-2 in `docs/P10_NOTES.md` because `js/ui/` is P7's.
 *
 * Two rules from the brief are structural rather than stylistic and they are
 * why this is a canvas and not a stack of DOM panels:
 *
 * - **NO MODALS, EVER** (§10 rule 2, D-brief §3). Nothing here is a dialog,
 *   nothing steals focus, and there is no `alert`. A menu is a painted screen
 *   with tap targets; a pause is the same screen dimmed. A modal that opens
 *   under a thumb also eats the `pointerup` and permanently deadens whatever is
 *   beneath it, which is a bug this project has already paid for once.
 * - **Restart is a 1.2 s card** (§9.4), so the "again" affordance is a timed
 *   painted card and not a menu you have to navigate back out of.
 *
 * Tap targets are `>= 44 px` on the short side and are hit-tested against the
 * SAME rects that were drawn — `buttons()` returns the list the renderer just
 * emitted, so a button can never be somewhere other than where it looks.
 */

import { resolveLayout } from './layout.js';
import { INK, mark, label, font, rgba } from './theme.js';

const TAP_MIN = 44;      // §2's thumb minimum, in css px

export const SCREEN_TIMING = Object.freeze({
  again: 1.2,            // §9.4, the "again" card
  brief: 3.6,            // a brief auto-advances; a tap skips it
  fade: 0.22,
});

export function createScreens(ctx, opts = {}) {
  const view = ctx.view;
  const canvas = document.createElement('canvas');
  canvas.id = 'screens';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  (opts.mount || (ctx.dom && ctx.dom.ui) || document.body).appendChild(canvas);
  const g = canvas.getContext('2d');

  const L = {};
  const hits = [];         // the rects actually drawn this frame

  function relayout() {
    resolveLayout(view, L);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
  }
  relayout();
  const off = ctx.bus ? ctx.bus.on('view:change', relayout) : null;

  function begin(dim) {
    relayoutIfStale();
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);
    hits.length = 0;
    if (dim > 0) { g.fillStyle = rgba('#05080e', dim); g.fillRect(0, 0, view.w, view.h); }
  }

  let lastW = 0, lastH = 0, lastD = 0;
  function relayoutIfStale() {
    if (view.w === lastW && view.h === lastH && view.dpr === lastD) return;
    lastW = view.w; lastH = view.h; lastD = view.dpr;
    relayout();
  }

  /** The centred column every screen is laid out in. Landscape is the target. */
  function column() {
    const w = Math.min(L.play.w - 32, view.mode === 'portrait' ? 340 : 560);
    return { x: L.play.x + (L.play.w - w) / 2, y: L.play.y, w, h: L.play.h };
  }

  function heading(text, y, size) {
    const c = column();
    g.font = font(size || (view.mode === 'portrait' ? 30 : 34), 700);
    label(g, text, c.x + c.w / 2, y, { align: 'center', col: INK.bright });
  }

  function line(text, y, o = {}) {
    const c = column();
    g.font = font(o.size || 15, o.weight || 500);
    label(g, text, c.x + c.w / 2, y, { align: 'center', col: o.col || INK.ink, a: o.a });
  }

  /**
   * A tap target. Drawn as a rule and a word — never a rounded rectangle, which
   * ART §10 forbids anywhere in `js/ui/` — and registered for hit-testing at the
   * same moment it is drawn.
   */
  function button(id, text, x, y, w, o = {}) {
    const h = Math.max(TAP_MIN, o.h || TAP_MIN);
    const r = { id, x: x - w / 2, y: y - h / 2, w, h, data: o.data };
    hits.push(r);
    const col = o.col || (o.primary ? INK.brass : INK.ink);
    mark(g, (p) => { p.moveTo(r.x, r.y + h); p.lineTo(r.x + w, r.y + h); },
         { col, a: o.disabled ? 0.22 : 0.62, w: o.primary ? 2 : 1, cap: 'butt' });
    g.font = font(o.size || 17, 700);
    label(g, text, x, y, { align: 'center', col, a: o.disabled ? 0.30 : 1 });
    return r;
  }

  /** Three star pips, filled for earned. `got` is a boolean list. */
  function stars(got, x, y, r = 9) {
    for (let i = 0; i < got.length; i++) {
      const cx = x + (i - (got.length - 1) / 2) * (r * 3.2);
      mark(g, (p) => {
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + k * Math.PI * 2 / 5;
          const b = a + Math.PI / 5;
          const fx = cx + Math.cos(a) * r, fy = y + Math.sin(a) * r;
          if (k === 0) p.moveTo(fx, fy); else p.lineTo(fx, fy);
          p.lineTo(cx + Math.cos(b) * r * 0.45, y + Math.sin(b) * r * 0.45);
        }
        p.closePath();
      }, { col: got[i] ? INK.brass : INK.ink, a: got[i] ? 1 : 0.22, fill: !!got[i], w: 1 });
    }
  }

  /** Which button a css-px point is inside, or null. Topmost wins. */
  function hit(x, y) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const r = hits[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  return {
    canvas, g, layout: L,
    begin, column, heading, line, button, stars, hit,
    get buttons() { return hits; },
    relayout,
    destroy() { if (off) off(); canvas.remove(); },
  };
}

export default createScreens;
