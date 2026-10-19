// Orientation / form-factor switch (docs/LANDSCAPE.md §1). Sets <html data-orient data-form> (+ class l-short) synchronously
// in the resize handler, so CSS and the engine's ResizeObserver see the new layout in the same frame. Nothing remounts.
export const ORIENT = { enter: 1.15, exit: 1.05, phoneShort: 500, short: 480 };

export function createOrient({ getSetting = () => 'auto' } = {}) {
  const root = document.documentElement;
  const Q = new URLSearchParams(location.search);
  const force = /^(landscape|portrait)$/.test(Q.get('orient') || '') ? Q.get('orient') : null;
  // ?insets=t,r,b,l overrides the safe-area tokens (CDP can't emulate notches)
  const ins = (Q.get('insets') || '').split(',').map(Number);
  if (ins.length === 4 && ins.every((n) => n >= 0)) ['--sat', '--sar', '--sab', '--sal'].forEach((k, i) => root.style.setProperty(k, ins[i] + 'px'));
  const coarse = matchMedia('(pointer: coarse)');
  const fns = new Set();
  const st = { mode: null, form: null, short: false, w: 0, h: 0 };

  function measure() {
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width * (vv.scale || 1) : innerWidth) || innerWidth;
    const h = Math.round(vv ? vv.height * (vv.scale || 1) : innerHeight) || innerHeight;
    return { w, h };
  }

  function refresh() {
    const { w, h } = measure();
    if (!w || !h) return st;
    const a = w / h, s = Math.min(w, h);
    const form = s < ORIENT.phoneShort ? 'phone' : coarse.matches ? 'tablet' : 'desktop';
    let mode;
    if (force) mode = force;
    else if (form !== 'phone' && getSetting() === 'portrait') mode = 'portrait';
    else if (st.mode === 'landscape') mode = a <= ORIENT.exit ? 'portrait' : 'landscape';
    else mode = a >= ORIENT.enter ? 'landscape' : 'portrait';
    const short = mode === 'landscape' && h < ORIENT.short;
    const prev = st.mode;
    const changed = mode !== st.mode || form !== st.form || short !== st.short;
    Object.assign(st, { mode, form, short, w, h });
    if (!changed) return st;
    root.dataset.orient = mode;
    root.dataset.form = form;
    root.classList.toggle('l-short', short);
    const detail = { mode, form, short, w, h, prev };
    for (const fn of fns) try { fn(detail); } catch (e) { console.error('[orient]', e); }
    dispatchEvent(new CustomEvent('vp:orient', { detail }));
    return st;
  }

  addEventListener('resize', refresh);
  addEventListener('orientationchange', refresh);
  window.visualViewport?.addEventListener('resize', refresh);
  coarse.addEventListener?.('change', refresh);
  refresh();

  const api = {
    get mode() { return st.mode; }, get form() { return st.form; }, get short() { return st.short; },
    get w() { return st.w; }, get h() { return st.h; }, get landscape() { return st.mode === 'landscape'; },
    forced: force,
    on(fn) { fns.add(fn); return () => fns.delete(fn); },
    refresh,
  };
  return api;
}

// screens import this instead of main.js (main creates it before anything else)
let current = null;
export function initOrient(opts) { current = createOrient(opts); return current; }
export const orient = {
  get mode() { return current?.mode || 'portrait'; }, get form() { return current?.form || 'phone'; },
  get short() { return !!current?.short; }, get landscape() { return current?.mode === 'landscape'; },
  on(fn) { return current ? current.on(fn) : () => {}; },
  refresh() { return current?.refresh(); },
};
