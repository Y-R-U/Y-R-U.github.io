import { clamp } from './math.js';

export const REF_WORLD_W_LANDSCAPE = 1920;
export const REF_WORLD_W_PORTRAIT = 820;

/**
 * Owns css size, device pixel ratio, orientation and notch insets.
 * Portrait is not a squeezed landscape — it shows a narrower slice of world,
 * which is why worldW is a mode-dependent constant rather than derived.
 */
export function createViewport(canvas, bus, opts = {}) {
  // ?dpr=1 exists so software-rendered headless captures stay tractable.
  const forced = parseFloat(new URLSearchParams(location.search).get('dpr'));
  const maxDpr = Number.isFinite(forced) ? forced : (opts.maxDpr ?? 2);

  // A probe element is the only reliable way to read env(safe-area-inset-*).
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
  document.body.appendChild(probe);

  const view = {
    mode: 'landscape',
    w: 1, h: 1,
    dpr: 1,
    pw: 1, ph: 1,             // framebuffer pixels
    worldW: REF_WORLD_W_LANDSCAPE,
    worldH: REF_WORLD_W_LANDSCAPE * 9 / 16,
    scale: 1,                 // css px per world unit (before camera zoom)
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    cam: null,                // set by whoever is rendering; used by toWorld
  };

  function readSafe() {
    const cs = getComputedStyle(probe);
    view.safe.top = parseFloat(cs.paddingTop) || 0;
    view.safe.right = parseFloat(cs.paddingRight) || 0;
    view.safe.bottom = parseFloat(cs.paddingBottom) || 0;
    view.safe.left = parseFloat(cs.paddingLeft) || 0;
  }

  let onResizeCb = null;

  function apply(force) {
    const rect = canvas.getBoundingClientRect();
    let w = Math.max(1, Math.round(rect.width || window.innerWidth));
    let h = Math.max(1, Math.round(rect.height || window.innerHeight));
    const dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
    const mode = h > w * 1.05 ? 'portrait' : 'landscape';

    const changed = force || w !== view.w || h !== view.h || dpr !== view.dpr || mode !== view.mode;
    if (!changed) return false;

    const modeChanged = mode !== view.mode;
    view.w = w; view.h = h; view.dpr = dpr; view.mode = mode;
    view.pw = Math.max(1, Math.round(w * dpr));
    view.ph = Math.max(1, Math.round(h * dpr));
    view.worldW = mode === 'portrait' ? REF_WORLD_W_PORTRAIT : REF_WORLD_W_LANDSCAPE;
    view.scale = w / view.worldW;
    view.worldH = h / view.scale;

    canvas.width = view.pw;
    canvas.height = view.ph;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    readSafe();
    if (onResizeCb) onResizeCb(view);
    bus.emit('view:change', { mode: view.mode, w, h, dpr, modeChanged, view });
    return true;
  }

  /** Camera-aware screen<->world. Falls back to centre-of-screen if no camera set. */
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

  /** World units per css pixel at the current camera zoom — handy for UI sizing. */
  view.worldPerPx = () => 1 / (view.scale * ((view.cam && view.cam.zoom) || 1));

  view.setCamera = (cam) => { view.cam = cam; };
  view.onResize = (fn) => { onResizeCb = fn; };
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
    new ResizeObserver(schedule).observe(canvas);
  }

  apply(true);
  return view;
}
