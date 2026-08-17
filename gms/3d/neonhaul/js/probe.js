// §2.7's pixel readback, lifted out of main.js at P2 so the boot file stays boot code.
//
// Screenshots alone miss this whole class of bug: "is the fog band at 90-260 m", "is there blue
// in the daysmog frame", "did ACES actually run", "did the LOD cross-fade spread the swap" are
// all questions about NUMBERS in the composed frame. The readback runs INSIDE the frame, right
// after composer.render and before the browser composites — `service()` is called from the loop,
// never from the promise — and the canvas is a plain 8-bit sRGB surface, so what comes back is
// exactly what a viewer sees.
//
// `renderer` needs preserveDrawingBuffer, which main.js only sets under ?debug.

export const LUMA = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export function makeProbe(renderer, camera, THREE) {
  let probeReq = null, probeCanvas = null;

  function servicePendingProbe() {
    if (!probeReq) return;
    const req = probeReq;
    probeReq = null;
    try { req.resolve(readbackFrame(req)); } catch (e) { req.resolve({ error: String(e && e.message || e) }); }
  }

  function readbackFrame(req) {
    const cv = renderer.domElement;
    const w = cv.width, h = cv.height;
    if (!probeCanvas) probeCanvas = document.createElement('canvas');
    if (probeCanvas.width !== w || probeCanvas.height !== h) { probeCanvas.width = w; probeCanvas.height = h; }
    const g = probeCanvas.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h);
    g.drawImage(cv, 0, 0);
    const img = g.getImageData(0, 0, w, h).data;

    const at = (x0, y0, r) => {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = Math.max(0, y0 - r); y <= Math.min(h - 1, y0 + r); y++)
        for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
          const i = (y * w + x) * 4;
          sr += img[i]; sg += img[i + 1]; sb += img[i + 2]; n++;
        }
      if (!n) return null;
      const rgb = [sr / n / 255, sg / n / 255, sb / n / 255];
      return { rgb: rgb.map(v => +v.toFixed(5)), lum: +LUMA(rgb[0], rgb[1], rgb[2]).toFixed(5), n };
    };

    const out = { w, h, points: [], grid: null };

    const v = new THREE.Vector3();
    for (const p of (req.points || [])) {
      v.set(p[0], p[1], p[2]).project(camera);
      const px = Math.round((v.x * 0.5 + 0.5) * w), py = Math.round((-v.y * 0.5 + 0.5) * h);
      const on = v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      out.points.push(Object.assign({ world: p, px, py, onScreen: on }, at(px, py, req.r ?? 5) || {}));
    }

    if (req.grid) {
      const [nx, ny] = req.grid;
      const cells = [];
      let sr = 0, sg = 0, sb = 0, worstBlue = 0, worstCell = null;
      for (let cy = 0; cy < ny; cy++) {
        for (let cx = 0; cx < nx; cx++) {
          const x0 = Math.floor(cx * w / nx), x1 = Math.floor((cx + 1) * w / nx);
          const y0 = Math.floor(cy * h / ny), y1 = Math.floor((cy + 1) * h / ny);
          let r = 0, gg = 0, b = 0, n = 0;
          for (let y = y0; y < y1; y += 2)
            for (let x = x0; x < x1; x += 2) {
              const i = (y * w + x) * 4;
              r += img[i]; gg += img[i + 1]; b += img[i + 2]; n++;
            }
          const c = [r / n / 255, gg / n / 255, b / n / 255];
          sr += c[0]; sg += c[1]; sb += c[2];
          // "no blue in frame" as a number: how far the blue channel runs ahead of the warmer of
          // the other two. The daysmog fog colour 0x4a4b50 is itself 1.067, so anything near that
          // is the palette, and anything well above it is a blue sky creeping in.
          const ratio = c[2] / Math.max(1e-4, Math.max(c[0], c[1]));
          if (c[2] > 0.02 && ratio > worstBlue) { worstBlue = ratio; worstCell = { cx, cy, rgb: c.map(x2 => +x2.toFixed(4)) }; }
          cells.push({ cx, cy, rgb: c.map(x2 => +x2.toFixed(4)), lum: +LUMA(c[0], c[1], c[2]).toFixed(4) });
        }
      }
      const n = cells.length;
      const mean = [sr / n, sg / n, sb / n];
      out.grid = {
        nx, ny, cells,
        mean: mean.map(x2 => +x2.toFixed(5)),
        meanLum: +LUMA(mean[0], mean[1], mean[2]).toFixed(5),
        blueRatioMean: +(mean[2] / Math.max(1e-4, Math.max(mean[0], mean[1]))).toFixed(4),
        blueRatioMax: +worstBlue.toFixed(4),
        blueWorstCell: worstCell,
      };
    }
    return out;
  }

  function probe(opts = {}) {
    return new Promise(resolve => {
      if (probeReq) probeReq.resolve({ error: 'superseded' });
      probeReq = { points: opts.points || [], grid: opts.grid || null, r: opts.r, resolve };
      const req = probeReq;
      setTimeout(() => { if (probeReq === req) { probeReq = null; resolve({ error: 'probe timed out (loop parked?)' }); } }, 4000);
    });
  }

  return { probe, service: servicePendingProbe };
}
