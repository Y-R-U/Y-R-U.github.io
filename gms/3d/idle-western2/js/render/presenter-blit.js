// Default presenter: every view owns a 2D canvas ({alpha:true} over the element's CSS poster). The host renders the
// view into the bottom-left of the offscreen WebGL buffer and we copy that region. Last good frame survives GPU loss.
export function createBlitPresenter() {
  return {
    name: 'blit',
    direct: false,
    rendererOptions: { alpha: false },
    attach(view, onLost) {
      const c = document.createElement('canvas');
      c.className = 'view-canvas';
      c.width = c.height = 0;
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      view.el.appendChild(c);
      view.canvas = c;
      view.ctx = c.getContext('2d', { alpha: true });
      view.live = false;
      c.addEventListener('contextlost', () => { view.live = false; view.dirty = true; view.blankSince = performance.now(); onLost?.(view); });
      c.addEventListener('contextrestored', () => { view.dirty = true; });
    },
    detach(view) {
      view.canvas?.remove();
      view.canvas = view.ctx = null;
      view.live = false;
    },
    release(view) {
      if (!view.canvas || !view.live) return;
      view.canvas.width = view.canvas.height = 0;
      view.live = false;
      view.blankSince = performance.now();
    },
    frameSize(views, d, out) {
      let w = 1, h = 1;
      for (const v of views) { const k = v.d || d; if (v.w * k > w) w = v.w * k; if (v.h * k > h) h = v.h * k; }
      out.W = Math.ceil(w);
      out.H = Math.ceil(h);
    },
    viewport(view, d) {
      d = view.d || d;
      view.vx = 0;
      view.vy = 0;
      view.pw = Math.max(1, Math.round(view.w * d));
      view.ph = Math.max(1, Math.round(view.h * d));
      return true;
    },
    beginFrame() {},
    present(view, renderer) {
      const c = view.canvas, pw = view.pw, ph = view.ph;
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
      const src = renderer.domElement;
      view.ctx.drawImage(src, 0, src.height - ph, pw, ph, 0, 0, pw, ph);
      view.live = true;
    },
    sample(view, sctx) {
      if (!view.canvas || !view.canvas.width) return { lum: 0, alpha: 0 };
      sctx.clearRect(0, 0, 8, 8);
      sctx.drawImage(view.canvas, 0, 0, 8, 8);
      return lumOf(sctx.getImageData(0, 0, 8, 8).data);
    },
    onLoss() {},
    onRestore() {},
    onRecreate() {},
  };
}

export function lumOf(px) {
  let l = 0, a = 0;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) { l += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255; a += px[i + 3]; }
  return { lum: l / n, alpha: Math.round(a / n) };
}
