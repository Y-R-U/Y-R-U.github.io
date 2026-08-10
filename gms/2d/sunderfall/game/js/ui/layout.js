/* SUNDERFALL UI — where everything sits, in CSS pixels.
 *
 * Recomputed only on resize/orientation change. Every rect is a stable object so the input zone
 * callbacks and the draw code can hold references and nothing allocates per frame.
 *
 * Portrait is not a squeezed landscape: the resource cluster shrinks, the cast circles become a
 * thumb arc pinned to the bottom-right, and the whole right flank becomes jump/aim.
 */

const R = () => ({ x: 0, y: 0, w: 0, h: 0 });
const CIRC = () => ({ x: 0, y: 0, r: 0, hit: R() });

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
    toast: { x: 0, y: 0, dir: 1, w: 250 },

    circles: [CIRC(), CIRC(), CIRC(), CIRC(), CIRC()],
    circleScale: 1,
    cluster: { kind: 'disc', x: 0, y: 0, r: 0, w: 0, h: 0 },

    stickZone: R(),
    actZone: R(),        // jump on tap / aim on drag
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
      L.boss.y = L.focus.y + L.focus.h + 34;
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

    /* ---- cast circles ---- */
    const C = L.circles;
    if (portrait) {
      const s = L.circleScale = Math.min(1, w / 390);
      const ax = leftHanded ? l + 62 * s : w - r - 62 * s;
      const ay = h - b - 92 * s;
      C[0].x = ax; C[0].y = ay; C[0].r = 44 * s;
      const RAD = 112 * s;
      const ANG = [98, 131, 164, 197];
      for (let i = 1; i < 5; i++) {
        const a = (leftHanded ? 180 - ANG[i - 1] : ANG[i - 1]) * Math.PI / 180;
        C[i].x = ax + Math.cos(a) * RAD;
        C[i].y = ay - Math.sin(a) * RAD;
        C[i].r = 27 * s;
      }
    } else {
      L.circleScale = 1;
      const by = h - b - 60;
      C[0].x = w - r - 54; C[0].y = by; C[0].r = 46;
      for (let i = 1; i < 5; i++) {
        C[i].x = C[0].x - 108 - (i - 1) * 76;
        C[i].y = by + 3;
        C[i].r = 31;
      }
    }
    for (let i = 0; i < 5; i++) {
      const c = C[i], pad2 = i === 0 ? 10 : 7;
      c.hit.x = c.x - c.r - pad2; c.hit.y = c.y - c.r - pad2;
      c.hit.w = c.hit.h = (c.r + pad2) * 2;
    }

    /* ---- the thumb cluster ----
     * The cast circles are round and the jump flank is a rectangle behind them,
     * so every near miss — and the whole band BELOW the big circle, which is
     * where a thumb naturally lands — was a jump instead of a cast. Nobody with
     * a thumb parked on the circles ever means "jump", so the cluster swallows
     * the whole region and near misses snap to the nearest circle.
     * Portrait: a disc around the arc centre. Landscape: the row's box, both
     * carried to the bottom edge of the screen. */
    if (portrait) {
      L.cluster.kind = 'disc';
      L.cluster.x = C[0].x; L.cluster.y = C[0].y;
      L.cluster.r = 112 * L.circleScale + 27 * L.circleScale + 22;
    } else {
      L.cluster.kind = 'rect';
      let x0 = Infinity, y0 = Infinity;
      for (let i = 0; i < 5; i++) { x0 = Math.min(x0, C[i].x - C[i].r); y0 = Math.min(y0, C[i].y - C[i].r); }
      L.cluster.x = x0 - 18; L.cluster.y = y0 - 18;
      L.cluster.w = w - L.cluster.x; L.cluster.h = h - L.cluster.y;
    }

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

    /* ---- toasts ---- */
    if (portrait) {
      L.toast.x = l; L.toast.y = L.focus.y + L.focus.h + 22; L.toast.dir = 1;
      L.toast.w = Math.min(260, w - l - r);
    } else {
      L.toast.x = l; L.toast.y = h - b - 30; L.toast.dir = -1;
      L.toast.w = 280;
    }

    L.bubbleClamp.x = l + 8;
    L.bubbleClamp.y = t + (portrait ? 80 : 56);
    L.bubbleClamp.w = w - l - r - 16;
    L.bubbleClamp.h = (portrait ? h - b - 300 : h - b - 130) - L.bubbleClamp.y;
    if (L.bubbleClamp.h < 80) L.bubbleClamp.h = 80;

    return L;
  };

  /** Index of the cast circle under a CSS-pixel point, or -1. */
  L.circleAt = function (x, y) {
    for (let i = 0; i < 5; i++) {
      const c = L.circles[i];
      const dx = x - c.x, dy = y - c.y, rr = c.r + (i === 0 ? 10 : 7);
      if (dx * dx + dy * dy <= rr * rr) return i;
    }
    return -1;
  };

  /** True if a point is inside the thumb cluster, circle or not. */
  L.inCluster = function (x, y) {
    const k = L.cluster;
    if (k.kind === 'disc') {
      const dx = x - k.x, dy = y - k.y;
      return dx * dx + dy * dy <= k.r * k.r;
    }
    return x >= k.x && y >= k.y && x <= k.x + k.w && y <= k.y + k.h;
  };

  /**
   * Cluster hit test: circle index, -2 for "inside the cluster but not on a
   * circle" (swallow it — it is not a jump), or -1 for "not ours".
   *
   * Nearest-wins rather than first-wins, so the generous slack on neighbouring
   * circles splits the gap between them down the middle instead of letting
   * whichever is earlier in the array claim it.
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
    return L.inCluster(x, y) ? -2 : -1;
  };

  return L;
}
