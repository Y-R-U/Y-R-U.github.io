/**
 * Owns css size, DPR and the letterboxed board rect.
 *
 * MEASURE THE CONTAINER, NOT THE CANVAS. This function writes canvas.style
 * width/height, so reading the canvas rect back means it is reading its own last
 * answer and a rotation never registers. The canvas size is this module's
 * OUTPUT; its input is the container.
 */
export function createViewport(canvas, opts = {}) {
  const q = new URLSearchParams(location.search);
  const forced = parseFloat(q.get('dpr'));
  const maxDpr = Number.isFinite(forced) ? forced : (opts.maxDpr ?? 2);

  let probe = document.getElementById('safe-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'safe-probe';
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }

  const view = {
    w: 1, h: 1, dpr: 1, pw: 1, ph: 1,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    board: { x: 0, y: 0, w: 1, h: 1, scale: 1 },   // css px
    cols: opts.cols || 112, rows: opts.rows || 224,
  };

  const cbs = [];
  view.onResize = (fn) => { cbs.push(fn); return () => { const i = cbs.indexOf(fn); if (i >= 0) cbs.splice(i, 1); }; };

  function readSafe() {
    const cs = getComputedStyle(probe);
    view.safe.top = parseFloat(cs.paddingTop) || 0;
    view.safe.right = parseFloat(cs.paddingRight) || 0;
    view.safe.bottom = parseFloat(cs.paddingBottom) || 0;
    view.safe.left = parseFloat(cs.paddingLeft) || 0;
  }

  function apply(force) {
    const host = canvas.parentElement;
    const r = host ? host.getBoundingClientRect() : null;
    const w = Math.max(1, Math.round((r && r.width) || window.innerWidth));
    const h = Math.max(1, Math.round((r && r.height) || window.innerHeight));
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), maxDpr);
    if (!force && w === view.w && h === view.h && dpr === view.dpr) return false;

    view.w = w; view.h = h; view.dpr = dpr;
    view.pw = Math.max(1, Math.round(w * dpr));
    view.ph = Math.max(1, Math.round(h * dpr));
    canvas.width = view.pw; canvas.height = view.ph;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    readSafe();

    // Fit the board's aspect inside the safe area, biased to the top so the
    // thumb arcs at the bottom stay clear of the play field.
    const aspect = view.cols / view.rows;
    const availW = w - view.safe.left - view.safe.right;
    const availH = h - view.safe.top - view.safe.bottom;
    let bw = availW, bh = bw / aspect;
    if (bh > availH) { bh = availH; bw = bh * aspect; }
    view.board.w = bw; view.board.h = bh;
    view.board.x = view.safe.left + (availW - bw) / 2;
    view.board.y = view.safe.top + Math.min((availH - bh) / 2, (availH - bh) * 0.35);
    view.board.scale = bw / view.cols;

    for (const fn of cbs) fn(view);
    return true;
  }

  view.refresh = () => apply(true);
  view.setBoard = (cols, rows) => { view.cols = cols; view.rows = rows; apply(true); };
  /** css px -> grain coords. */
  view.toGrain = (sx, sy) => ({
    x: (sx - view.board.x) / view.board.scale,
    y: (sy - view.board.y) / view.board.scale,
  });

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(false); }); };
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', () => {
    schedule();
    setTimeout(() => apply(true), 120);   // iOS reports stale dimensions here
    setTimeout(() => apply(true), 400);
  }, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(canvas.parentElement || document.body);

  apply(true);
  return view;
}
