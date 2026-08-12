/* SUNDERFALL UI — where everything sits, in CSS pixels.
 *
 * Recomputed only on resize/orientation change. Every rect is a stable object so the input zone
 * callbacks and the draw code can hold references and nothing allocates per frame.
 *
 * Portrait is not a squeezed landscape: the resource cluster shrinks, the cast circles become a
 * thumb arc pinned to the bottom-right, and the whole right flank becomes jump/aim.
 */

const R = () => ({ x: 0, y: 0, w: 0, h: 0 });
/* `pipDir` is the screen-space angle (deg, y-down) the rank pips fan out along.
   It points at whatever open space this circle has, which is not always down. */
const CIRC = () => ({ x: 0, y: 0, r: 0, pipDir: 90, hit: R() });

export function createLayout() {
  const L = {
    mode: 'landscape',
    w: 0, h: 0,
    pad: 22,
    touch: false,

    crest: { x: 0, y: 0, r: 28 },
    hp: R(),
    focus: R(),
    xpRing: { x: 0, y: 0, r: 0 },

    boss: R(),
    toast: { x: 0, y: 0, yBoss: 0, dir: 1, w: 250 },

    circles: [CIRC(), CIRC(), CIRC(), CIRC(), CIRC()],
    circleScale: 1,

    stickZone: R(),
    actZone: R(),        // jump on tap / aim on drag
    castZone: R(),       // slot 1's real tap target — see below
    pauseBtn: R(),

    bubbleClamp: R(),    // speech bubbles are kept inside this
  };

  /**
   * @param {{mode,w,h,safe}} view
   * @param {boolean} touch  show the on-screen controls
   */
  L.update = function (view, touch, leftHanded) {
    const sf = view.safe || { top: 0, right: 0, bottom: 0, left: 0 };
    const w = L.w = view.w, h = L.h = view.h;
    const portrait = (L.mode = view.mode) === 'portrait';
    L.touch = !!touch;
    const pad = L.pad = (portrait ? 13 : 20);
    const l = pad + sf.left, r = pad + sf.right, t = pad + sf.top, b = pad + sf.bottom;

    /* ---- resource cluster, top-left ---- */
    const cr = L.crest.r = portrait ? 22 : 28;
    L.crest.x = l + cr + 2;
    L.crest.y = t + cr + 2;
    L.xpRing.x = L.crest.x; L.xpRing.y = L.crest.y; L.xpRing.r = cr + (portrait ? 6 : 8);

    const bx = L.crest.x + cr + (portrait ? 16 : 22);
    L.hp.x = bx; L.hp.w = portrait ? Math.min(178, w - bx - r - 46) : 300;
    L.hp.h = portrait ? 13 : 16;
    L.hp.y = L.crest.y - (portrait ? 15 : 19);

    L.focus.x = bx; L.focus.w = portrait ? L.hp.w * 0.84 : 252;
    L.focus.h = portrait ? 8 : 10;
    L.focus.y = L.hp.y + L.hp.h + (portrait ? 7 : 9);

    /* ---- boss bar ----
     * Portrait: under the resource cluster. Landscape: top centre, but centred in the space that
     * is actually free — centring it on the screen puts it straight through the health bar. */
    if (portrait) {
      L.boss.w = w - l - r;
      L.boss.x = l;
      // 34 put the bar's own title — drawBoss stacks name and subtitle 24px above
      // the bar — straight across the focus readout's value text.
      L.boss.y = L.focus.y + L.focus.h + 54;
      L.boss.h = 12;
    } else {
      const availL = L.hp.x + L.hp.w + 96;
      const availR = w - r - 56;
      L.boss.w = Math.min(760, Math.max(240, availR - availL));
      L.boss.x = availL + (availR - availL - L.boss.w) * 0.5;
      L.boss.y = t + 30;
      L.boss.h = 15;
    }

    /* ---- pause button ---- */
    const pb = portrait ? 34 : 32;
    L.pauseBtn.w = L.pauseBtn.h = pb;
    L.pauseBtn.x = w - r - pb;
    L.pauseBtn.y = t;

    /* ---- cast circles ----
     * Circles 2-5 auto-cast: in play they are a readout, and you only ever press
     * one to swap the spell in it. They used to be spread on a 112px arc with a
     * gap between each, which put circle 2 a clear 138px straight up from the
     * big one — directly over the patch of screen a right thumb reaches for to
     * jump. They are packed tight against circle 1 now, overlapping slightly and
     * drawn under it, which is what buys that space back. */
    const C = L.circles;
    if (portrait) {
      const s = L.circleScale = Math.min(1, w / 390);
      const ax = leftHanded ? l + 62 * s : w - r - 62 * s;
      const ay = h - b - 92 * s;
      C[0].x = ax; C[0].y = ay; C[0].r = 44 * s;
      // leaned off vertical so the far end of its own pip arc misses the last
      // circle in the fan, which sits down and to the side of it
      C[0].pipDir = leftHanded ? 112 : 68;
      // 63 against 44 + 21 = a 2px overlap on the big circle, and 30° apart is
      // ~9px of overlap on each other: a chain, with no gap anywhere in it.
      const RAD = 63 * s;
      const ANG = [120, 150, 180, 210];
      for (let i = 1; i < 5; i++) {
        const deg = leftHanded ? 180 - ANG[i - 1] : ANG[i - 1];
        const a = deg * Math.PI / 180;
        C[i].x = ax + Math.cos(a) * RAD;
        C[i].y = ay - Math.sin(a) * RAD;
        C[i].r = 21 * s;
        /* Straight out from the arc's centre. On this fan every neighbour — and
           the big circle — sits 105° or more off that heading, which is the only
           direction with room for the pips now the discs touch. */
        C[i].pipDir = -deg;
      }
    } else {
      L.circleScale = 1;
      const by = h - b - 60;
      C[0].x = w - r - 54; C[0].y = by; C[0].r = 46;
      // same idea in a row: 74 against 46 + 31, then 59 against 31 + 31
      for (let i = 1; i < 5; i++) {
        C[i].x = C[0].x - 74 - (i - 1) * 59;
        C[i].y = by + 3;
        C[i].r = 31;
      }
      // a row: down is the free side, and the big one leans away from it so its
      // end pip does not land on circle 2's rim
      for (let i = 1; i < 5; i++) C[i].pipDir = 90;
      C[0].pipDir = 78;
    }
    for (let i = 0; i < 5; i++) {
      const c = C[i], pad2 = i === 0 ? 10 : 7;
      c.hit.x = c.x - c.r - pad2; c.hit.y = c.y - c.r - pad2;
      c.hit.w = c.hit.h = (c.r + pad2) * 2;
    }

    /* ---- the cast zone ----
     * Circle 1's tap target is not circle 1.
     *
     * A thumb's contact point sits lower than the player believes it does, so a
     * press aimed at the bottom half of the circle lands a few px outside it —
     * and outside meant nothing at all happened, because the cluster swallowed
     * the miss so it could not even fall through to jump. Everything to the
     * right of the circle and everything below it, out to the corner of the
     * screen, casts. Above it stays jump, which is where the thumb wants it. */
    const c0 = C[0];
    const cpad = portrait ? 12 : 10;
    const outer = c0.r + cpad;
    if (leftHanded) { L.castZone.x = 0; L.castZone.w = c0.x + outer; }
    else { L.castZone.x = c0.x - outer; L.castZone.w = w - L.castZone.x; }
    L.castZone.y = c0.y - outer;
    L.castZone.h = h - L.castZone.y;

    /* ---- touch regions ---- */
    const split = leftHanded ? w * 0.56 : w * 0.44;
    if (leftHanded) {
      L.stickZone.x = split; L.stickZone.w = w - split;
      L.actZone.x = 0; L.actZone.w = split;
    } else {
      L.stickZone.x = 0; L.stickZone.w = split;
      L.actZone.x = split; L.actZone.w = w - split;
    }
    L.stickZone.y = t + 70; L.stickZone.h = h - L.stickZone.y;
    L.actZone.y = t + 110; L.actZone.h = h - L.actZone.y - 0;

    /* ---- toasts ----
     * `yBoss` is where the column starts while a boss bar is up. In portrait the two
     * were laid out independently — toasts at `focus + 22`, the bar at `focus + 34` —
     * so the stack grew straight down through the bar. Nothing ever caught it because
     * nothing in the game had ever spawned a boss until act two. Publishing both
     * positions keeps the arithmetic here and lets the renderer lerp between them by
     * the bar's own reveal, so they slide rather than jump. */
    if (portrait) {
      L.toast.x = l; L.toast.y = L.focus.y + L.focus.h + 22; L.toast.dir = 1;
      L.toast.w = Math.min(260, w - l - r);
      L.toast.yBoss = L.boss.y + L.boss.h + 26;
    } else {
      L.toast.x = l; L.toast.y = h - b - 30; L.toast.dir = -1;
      L.toast.w = 280;
      // landscape stacks up from the bottom and the bar is at the top: no conflict
      L.toast.yBoss = L.toast.y;
    }

    L.bubbleClamp.x = l + 8;
    L.bubbleClamp.y = t + (portrait ? 80 : 56);
    L.bubbleClamp.w = w - l - r - 16;
    L.bubbleClamp.h = (portrait ? h - b - 300 : h - b - 130) - L.bubbleClamp.y;
    if (L.bubbleClamp.h < 80) L.bubbleClamp.h = 80;

    return L;
  };

  /**
   * Index of the cast circle under a CSS-pixel point, or -1. This is what a
   * spell is dropped on in the loadout, so it keeps its slack even though the
   * small circles are smaller than they were — and it has to be nearest-wins
   * for the same reason `clusterAt` is: they overlap, and first-wins would hand
   * the shared strip to whichever index came first.
   */
  L.circleAt = function (x, y) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < 5; i++) {
      const c = L.circles[i];
      const dx = x - c.x, dy = y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= c.r + (i === 0 ? 10 : 12) && d < bestD) { best = i; bestD = d; }
    }
    return best;
  };

  /** True if a point casts slot 1 by being beside or under the big circle. */
  L.inCastZone = function (x, y) {
    const k = L.castZone;
    return x >= k.x && y >= k.y && x <= k.x + k.w && y <= k.y + k.h;
  };

  /**
   * Cluster hit test: a circle index, or -1 for "not ours, let it jump".
   *
   * Nearest-wins rather than first-wins, so the slack on circles that now
   * overlap each other splits the join down the middle instead of letting
   * whichever is earlier in the array claim it.
   *
   * This has to agree with the zones registered in ui/touch.js, because those
   * are what actually fire the cast — all this side does is the presentation.
   * They did not agree before: this granted 16px of slack past a circle the
   * engine only knew as a 108px square, so a press in the ring between the two
   * lit the button up and cast nothing.
   */
  L.clusterAt = function (x, y) {
    const slack = L.mode === 'portrait' ? 16 : 12;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < 5; i++) {
      const c = L.circles[i];
      const dx = x - c.x, dy = y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= c.r + slack && d < bestD) { best = i; bestD = d; }
    }
    if (best >= 0) return best;
    return L.inCastZone(x, y) ? 0 : -1;
  };

  return L;
}
