// Shared plumbing for the gfx debug pages. Deliberately does NOT touch js/core/
// — that module belongs to the next phase, and these pages must not become the
// thing that defines its API by accident.

import { createRenderer } from '../../js/gfx/renderer.js';

export function qp(name, dflt) {
  const v = new URLSearchParams(location.search).get(name);
  if (v === null) return dflt;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

export async function mount(opts = {}) {
  const w = qp('w', opts.w || 390);
  const h = qp('h', opts.h || 844);
  const dpr = qp('dpr', opts.dpr || 1);
  const worldH = qp('worldH', opts.worldH || 1000);

  const canvas = document.getElementById('gl');
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const R = await createRenderer(canvas, { preserveDrawingBuffer: true });
  R.resize(w, h, dpr, worldH);
  return { R, canvas, gl: R.gl, w, h, dpr, worldH };
}

/** Everything off, so a measurement reads geometry rather than the grade. */
export function flatGrade(R) {
  const fx = R.fx;
  fx.bloom = 0; fx.vignetteAmt = 0; fx.grain = 0;
  fx.exposure = 1; fx.saturation = 1; fx.contrast = 1;
  fx.shadowTint = [1, 1, 1]; fx.highTint = [1, 1, 1];
  fx.setRays(0, 0, 0);
}

/**
 * Reads the default framebuffer. Must be called in the same task as R.end(),
 * before the browser composites, or the buffer is gone unless the context was
 * made with preserveDrawingBuffer (mount() always does).
 */
export function readback(R) {
  const gl = R.gl;
  const w = R.pixelW, h = R.pixelH;
  const px = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { px, w, h };
}

/** gl y is bottom-up; everything else here is top-down screen space. */
export function pixelAt(img, x, y) {
  const gy = img.h - 1 - Math.round(y);
  const o = (gy * img.w + Math.round(x)) * 4;
  return [img.px[o], img.px[o + 1], img.px[o + 2], img.px[o + 3]];
}

/**
 * Weighted centroid, top-down device pixels. `weight(r,g,b)` returns 0 to skip.
 * Weighted rather than binary so a marker's antialiased rim does not bias the
 * result by a fraction of a pixel, which at these scales is a whole world unit.
 */
export function centroid(img, weight) {
  let sx = 0, sy = 0, w = 0, n = 0;
  for (let gy = 0; gy < img.h; gy++) {
    for (let x = 0; x < img.w; x++) {
      const o = (gy * img.w + x) * 4;
      const k = weight(img.px[o], img.px[o + 1], img.px[o + 2]);
      // +0.5: a pixel's position is its CENTRE, and a half-pixel bias here is
      // a whole world unit once divided by scale at zoom 0.78
      if (k > 0) { sx += (x + 0.5) * k; sy += (img.h - 0.5 - gy) * k; w += k; n++; }
    }
  }
  return w === 0 ? null : { x: sx / w, y: sy / w, n, weight: w };
}

/** Mean absolute difference over a box, 0..1, averaged over rgb. */
export function meanAbsDiff(a, b, box) {
  const x0 = Math.max(0, box.x0 | 0), x1 = Math.min(a.w, box.x1 | 0);
  const y0 = Math.max(0, box.y0 | 0), y1 = Math.min(a.h, box.y1 | 0);
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    const gy = a.h - 1 - y;
    for (let x = x0; x < x1; x++) {
      const o = (gy * a.w + x) * 4;
      sum += Math.abs(a.px[o] - b.px[o]) + Math.abs(a.px[o + 1] - b.px[o + 1]) + Math.abs(a.px[o + 2] - b.px[o + 2]);
      n += 3;
    }
  }
  return n === 0 ? 0 : sum / n / 255;
}

/** Copies a box out of a readback so it survives the next frame. */
export function crop(img, box) {
  const x0 = Math.max(0, box.x0 | 0), x1 = Math.min(img.w, box.x1 | 0);
  const y0 = Math.max(0, box.y0 | 0), y1 = Math.min(img.h, box.y1 | 0);
  const w = x1 - x0, h = y1 - y0;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((img.h - 1 - (y0 + y)) * img.w + x0) * 4;
    px.set(img.px.subarray(src, src + w * 4), y * w * 4);
  }
  return { px, w, h, flipped: true };
}

/** Normalised cross-correlation peak offset of two 1-D rows. */
export function bestShift(a, b, maxShift) {
  let best = 0, bestScore = -Infinity;
  for (let s = -maxShift; s <= maxShift; s++) {
    let sum = 0, n = 0;
    for (let i = 0; i < a.length; i++) {
      const k = i + s;
      if (k < 0 || k >= b.length) continue;
      sum += a[i] * b[k]; n++;
    }
    if (n < a.length * 0.5) continue;
    const score = sum / n;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

export function overlay(lines) {
  let el = document.getElementById('hud');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'hud';
    document.body.appendChild(el);
  }
  el.textContent = Array.isArray(lines) ? lines.join('\n') : lines;
}
