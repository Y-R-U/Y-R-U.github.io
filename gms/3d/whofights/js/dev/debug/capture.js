// Screenshots at an arbitrary size, and the phone-shaped reframe of the live game.
//
// Both do the same thing: give #stage a fixed size and let app.resize() carry it through the aa
// target, the post chain and the fov. Nothing here reaches into the renderer directly, so a
// capture goes down exactly the path a real frame does.

const FRAMED = ['stage', 'touch', 'game'];

export const SIZES = [
  { id: 'phone-l', label: 'Phone landscape', w: 844, h: 390 },
  { id: 'phone-p', label: 'Phone portrait', w: 390, h: 844 },
  { id: 'tablet-l', label: 'Tablet landscape', w: 1180, h: 820 },
  { id: 'hd', label: 'Desktop 720p', w: 1280, h: 720 },
  { id: 'fhd', label: 'Desktop 1080p', w: 1920, h: 1080 },
];

// A capture is a real frame at real pixel dimensions, so a 4× DPR on a 1920 shot is 33 megapixels
// and some drivers simply return a blank canvas. Clamp and say so.
export const MAX_PIXELS = 16e6;

export function fitDpr(w, h, dpr) {
  const want = Math.max(0.5, Math.min(4, +dpr || 1));
  const max = Math.sqrt(MAX_PIXELS / Math.max(1, w * h));
  const used = Math.min(want, max);
  return { dpr: Math.round(used * 100) / 100, clamped: used < want - 1e-6, px: Math.round(w * used) * Math.round(h * used) };
}

function stage() { return document.getElementById('stage'); }

function sizeStage(w, h) {
  const s = stage();
  if (!s) return null;
  const prev = s.getAttribute('style') || '';
  s.style.right = 'auto';
  s.style.bottom = 'auto';
  s.style.width = `${w}px`;
  s.style.height = `${h}px`;
  return prev;
}

function restoreStage(prev) {
  const s = stage();
  if (!s) return;
  if (prev) s.setAttribute('style', prev); else s.removeAttribute('style');
}

// Synchronous from resize to restore: nothing paints in between, so the oversized stage is never
// seen even when the shot is four times the window.
export function capture(app, { w, h, dpr = 1 }) {
  if (!app?.renderer) return { ok: false, error: 'no renderer' };
  const fit = fitDpr(w, h, dpr);
  const q = app.quality;
  const prev = { cap: app.dprCap, scale: q?.get('renderScale') ?? 1 };
  const prevStyle = sizeStage(w, h);
  try {
    // The renderer's pixel ratio is min(devicePixelRatio, dprCap) × renderScale, so a shot
    // denser than the display can only be reached through the scale term. Both are written
    // straight into the settings object and put back in the finally, so no knob listener fires
    // and the quality panel never shows a value the capture invented.
    app.dprCap = 4;
    if (q) q.settings.renderScale = fit.dpr / Math.min(devicePixelRatio || 1, 4);
    app.resize();
    if (app.renderPath) app.renderPath(); else app.renderer.render(app.scene, app.camera);
    const url = app.renderer.domElement.toDataURL('image/png');
    const px = { w: app.renderer.domElement.width, h: app.renderer.domElement.height };
    return { ok: true, url, px, dpr: fit.dpr, clamped: fit.clamped };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    restoreStage(prevStyle);
    app.dprCap = prev.cap;
    if (q) q.settings.renderScale = prev.scale;
    app.resize();
  }
}

let framed = null;

export function frame(app, size) {
  unframe(app);
  if (!size) return null;
  const root = document.documentElement;
  root.style.setProperty('--wfdbg-w', `${size.w}px`);
  root.style.setProperty('--wfdbg-h', `${size.h}px`);
  ensureFrameCSS();
  root.classList.add('wfdbg-framed');
  framed = size;
  app?.resize();
  dispatchEvent(new Event('resize'));
  return size;
}

export function unframe(app) {
  document.documentElement.classList.remove('wfdbg-framed');
  framed = null;
  app?.resize();
  dispatchEvent(new Event('resize'));
}

export const framedAs = () => framed;

function ensureFrameCSS() {
  if (document.getElementById('wf-dbg-frame-css')) return;
  const s = document.createElement('style');
  s.id = 'wf-dbg-frame-css';
  // Every full-window game layer moves together, or the touch pads and the HUD stay at window
  // size and the preview lies about where a thumb can reach.
  s.textContent = `
    html.wfdbg-framed body { background:#0a0d12; }
    ${FRAMED.map(id => `html.wfdbg-framed #${id}`).join(', ')} {
      position: fixed; left: 50%; top: 50%; right: auto; bottom: auto;
      width: var(--wfdbg-w); height: var(--wfdbg-h);
      transform: translate(-50%, -50%);
      overflow: hidden;
    }
    html.wfdbg-framed #stage { outline: 1px solid rgba(120,190,255,.45); box-shadow: 0 0 0 9999px rgba(6,9,13,.82); }`;
  document.head.append(s);
}
