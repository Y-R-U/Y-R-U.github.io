import { clamp } from './math.js';
import { VIEW_PROFILE } from './viewprofile.js';

/**
 * Owns css size, device pixel ratio, orientation and notch insets.
 *
 * Change from the Sunderfall original: **both orientations fit to HEIGHT**
 * (ARCHITECTURE §3.2). `worldH` is the mode constant read out of VIEW_PROFILE
 * and `worldW` is derived. A width fit gives a landscape phone a 23 px aeroplane
 * and makes the aircraft a different physical size in the two orientations,
 * which is the single thing that would have made the portrait pivot expensive.
 *
 * `view.worldW` / `view.worldH` are the extents at **zoom 1**. R.worldW /
 * R.worldH are the extents at the CURRENT zoom (P1_NOTES §5.2) — different
 * quantities with the same names, and the camera solver needs the zoom-1 pair.
 */
/**
 * The one definition of "which way up is this". Exported because a harness page
 * that picks its own worldH has to pick the same PROFILE the game would, and a
 * second copy of `1.05` is exactly the shape D131 caught in `js/ui/hud.js`.
 */
export const modeFor = (w, h) => (h > w * 1.05 ? 'portrait' : 'landscape');

export function createViewport(canvas, bus, opts = {}) {
  // ?dpr=1 exists so software-rendered headless captures stay tractable. Keep it.
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const forced = parseFloat(q.get('dpr'));
  const maxDpr = Number.isFinite(forced) ? forced : (opts.maxDpr ?? 2);
  const lockMode = q.get('mode') === 'portrait' || q.get('mode') === 'landscape' ? q.get('mode') : null;

  // A probe element is the only reliable way to read env(safe-area-inset-*).
  // index.html ships #safe-probe already styled; fall back to our own if absent.
  let probe = document.getElementById('safe-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }

  const view = {
    mode: 'portrait',
    w: 1, h: 1,
    dpr: 1,
    pw: 1, ph: 1,             // framebuffer pixels
    worldH: VIEW_PROFILE.portrait.worldH,   // the FITTED axis, at zoom 1
    worldW: 1,                              // derived, at zoom 1
    scale: 1,                 // css px per world unit, before camera zoom
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    profile: VIEW_PROFILE.portrait,
    cam: null,
  };

  function readSafe() {
    const cs = getComputedStyle(probe);
    view.safe.top = parseFloat(cs.paddingTop) || 0;
    view.safe.right = parseFloat(cs.paddingRight) || 0;
    view.safe.bottom = parseFloat(cs.paddingBottom) || 0;
    view.safe.left = parseFloat(cs.paddingLeft) || 0;
  }

  const resizeCbs = [];

  /**
   * MEASURE THE CONTAINER, NOT THE CANVAS.
   *
   * The ported version measured `canvas.getBoundingClientRect()` — but this
   * function then writes `canvas.style.width/height` in px, so from the second
   * call onward it was reading back its own last answer. Rotating the device
   * changed `innerWidth`/`innerHeight` and the canvas rect did not move, so
   * `view:change` never fired and the layout stayed portrait forever. Caught by
   * tools/orient.mjs, which counts view:change events; a screenshot at either
   * orientation looks perfectly correct on its own.
   *
   * The canvas's size is this module's OUTPUT. Its input is the container.
   */
  // ?viewbug=canvas restores the broken version, so tools/orient.mjs can show
  // its view:change criterion going red. Never ship a build that sets it.
  const measure = opts.measure || (q.get('viewbug') === 'canvas' ? (() => canvas.getBoundingClientRect()) : () => {
    const host = canvas.parentElement;
    const r = host ? host.getBoundingClientRect() : null;
    if (r && r.width > 0 && r.height > 0) return r;
    return { width: window.innerWidth, height: window.innerHeight };
  });

  function apply(force) {
    const rect = measure();
    let w = Math.max(1, Math.round(rect.width || window.innerWidth));
    let h = Math.max(1, Math.round(rect.height || window.innerHeight));
    const dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
    const mode = lockMode || modeFor(w, h);

    const changed = force || w !== view.w || h !== view.h || dpr !== view.dpr || mode !== view.mode;
    if (!changed) return false;

    const modeChanged = mode !== view.mode;
    view.w = w; view.h = h; view.dpr = dpr; view.mode = mode;
    view.profile = VIEW_PROFILE[mode];
    view.pw = Math.max(1, Math.round(w * dpr));
    view.ph = Math.max(1, Math.round(h * dpr));

    view.worldH = view.profile.worldH;
    view.scale = h / view.worldH;      // FIT TO HEIGHT, both orientations
    view.worldW = w / view.scale;

    canvas.width = view.pw;
    canvas.height = view.ph;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    readSafe();
    for (let i = 0; i < resizeCbs.length; i++) resizeCbs[i](view);
    if (bus) bus.emit('view:change', { mode: view.mode, w, h, dpr, modeChanged, view });
    return true;
  }

  /* Camera-aware screen<->world. The returned objects are SHARED — copy the
     values if you keep them past the current statement (§10 rule 9). */
  const _wp = { x: 0, y: 0 };
  view.toWorld = (sx, sy, out) => {
    const cam = view.cam;
    const z = (cam && cam.zoom) || 1;
    const s = view.scale * z;
    const cx = cam ? cam.x : 0, cy = cam ? cam.y : 0;
    const o = out || _wp;
    o.x = (sx - view.w * 0.5) / s + cx;
    o.y = (sy - view.h * 0.5) / s + cy;
    return o;
  };

  const _sp = { x: 0, y: 0 };
  view.toScreen = (wx, wy, out) => {
    const cam = view.cam;
    const z = (cam && cam.zoom) || 1;
    const s = view.scale * z;
    const cx = cam ? cam.x : 0, cy = cam ? cam.y : 0;
    const o = out || _sp;
    o.x = (wx - cx) * s + view.w * 0.5;
    o.y = (wy - cy) * s + view.h * 0.5;
    return o;
  };

  view.worldPerPx = () => 1 / (view.scale * ((view.cam && view.cam.zoom) || 1));

  view.setCamera = (cam) => { view.cam = cam; };
  view.onResize = (fn) => { resizeCbs.push(fn); return () => { const i = resizeCbs.indexOf(fn); if (i >= 0) resizeCbs.splice(i, 1); }; };
  view.refresh = () => apply(true);

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; apply(false); });
  };

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', () => {
    // iOS reports stale dimensions right after the event fires.
    schedule();
    setTimeout(() => apply(true), 120);
    setTimeout(() => apply(true), 400);
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule, { passive: true });
  }
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(schedule).observe(canvas.parentElement || document.body);
  }

  apply(true);
  return view;
}
