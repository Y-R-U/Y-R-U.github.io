// Canvas sizing, DPR, safe areas, and the one number the balance depends on:
// how many world units of WIDTH are visible. That is fixed (D7) so a stage
// plays identically on a small phone, a big phone and a tablet.

export const VIEW_WIDTH = 420;   // world units always visible across
const MAX_DPR = 2.5;

export function makeViewport(canvas, opts = {}) {
  const forcedDpr = opts.dpr || 0;
  const probe = document.getElementById('safe-probe');
  const cbs = [];

  const vp = {
    w: 1, h: 1, dpr: 1, bw: 1, bh: 1, zoom: 1,
    safe: { top: 0, bottom: 0, left: 0, right: 0 },

    resize() {
      const w = window.innerWidth || document.documentElement.clientWidth;
      const h = window.innerHeight || document.documentElement.clientHeight;
      const dpr = forcedDpr || Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      const changed = bw !== vp.bw || bh !== vp.bh;

      vp.w = w; vp.h = h; vp.dpr = dpr; vp.bw = bw; vp.bh = bh;
      vp.zoom = w / VIEW_WIDTH;

      if (probe) {
        const cs = getComputedStyle(probe);
        vp.safe.top = parseFloat(cs.paddingTop) || 0;
        vp.safe.bottom = parseFloat(cs.paddingBottom) || 0;
        vp.safe.left = parseFloat(cs.paddingLeft) || 0;
        vp.safe.right = parseFloat(cs.paddingRight) || 0;
      }

      if (changed) {
        canvas.width = bw;
        canvas.height = bh;
        for (const fn of cbs) fn(vp);
      }
    },

    // world units visible vertically - varies with aspect, unlike width
    get viewHeight() { return VIEW_WIDTH * (vp.h / vp.w); },

    onresize(fn) { cbs.push(fn); },
  };

  vp.resize();
  window.addEventListener('resize', vp.resize);
  window.addEventListener('orientationchange', () => setTimeout(vp.resize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', vp.resize);

  return vp;
}
