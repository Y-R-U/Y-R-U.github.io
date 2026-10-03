import { lumOf } from './presenter-blit.js?v=20261004c';

// Escape hatch (?presenter=overlay): the WebGL canvas itself is fixed full-screen behind the page (z-index -1) and
// each view is scissored into its on-screen rect. No copies, but it reads rects every frame, lags compositor scroll by
// a frame, loses rounded corners, and a lost context blanks every view at once (posters come back while lost).
export function createOverlayPresenter({ debug = false } = {}) {
  let canvas = null, prepared = false;
  const posters = new Set();
  const px = new Uint8Array(16 * 4);

  function prepPage() {
    if (prepared) return;
    prepared = true;
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)') document.documentElement.style.backgroundColor = bg;
    document.documentElement.classList.add('il2-overlay');
    const st = document.createElement('style');
    st.textContent = '.il2-direct{background:transparent!important}.il2-direct::before{content:none!important}';
    document.head.appendChild(st);
  }

  function clearAncestors(el) {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      p.style.backgroundColor = 'transparent';
      p.style.backgroundImage = 'none';
    }
  }

  return {
    name: 'overlay',
    direct: true,
    rendererOptions: { alpha: true },
    attach(view) {
      prepPage();
      clearAncestors(view.el);
      view.el.classList.add('il2-direct');
      posters.add(view.el);
      view.live = true;
    },
    detach(view) {
      view.el.classList.remove('il2-direct');
      posters.delete(view.el);
    },
    release() {},
    frameSize(views, d, out) {
      out.W = Math.ceil(innerWidth * d);
      out.H = Math.ceil(innerHeight * d);
    },
    viewport(view, d) {
      const r = view.el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || !r.width || !r.height) return false;
      view.vx = Math.round(r.left * d);
      view.vy = Math.round((innerHeight - r.bottom) * d);
      view.pw = Math.max(1, Math.round(r.width * d));
      view.ph = Math.max(1, Math.round(r.height * d));
      return true;
    },
    beginFrame(renderer) {
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.setScissorTest(true);
    },
    present(view, renderer) {
      if (!debug || (view.presented % 15) !== 0) return;
      const gl = renderer.getContext();
      gl.readPixels(view.vx + (view.pw >> 1), view.vy + (view.ph >> 1), 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px);
      view.lastSample = lumOf(px);
    },
    sample(view) {
      return view.lastSample || { lum: 0, alpha: 0 };
    },
    onLoss() {
      if (canvas) canvas.style.visibility = 'hidden';
      for (const el of posters) el.classList.remove('il2-direct');
    },
    onRestore() {
      if (canvas) canvas.style.visibility = '';
      for (const el of posters) el.classList.add('il2-direct');
    },
    onRecreate(renderer) {
      canvas?.remove();
      canvas = renderer.domElement;
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block';
      document.body.prepend(canvas);
      this.onRestore();
    },
  };
}
