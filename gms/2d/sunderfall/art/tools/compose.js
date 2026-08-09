// Build a horizontally-tiling parallax band out of keyed cutouts.
//
// Anything placed near the right edge is drawn a second time at x - W, so the strip
// loops seamlessly by construction. No cross-fade, no ghosting.
const { Img, resize, composite, grade, mapPixels } = require('./img.js');
const { fbm, rng } = require('./raster.js');

function flipX(img) {
  const out = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const s = (y * img.w + (img.w - 1 - x)) * 4, d = (y * img.w + x) * 4;
    out.data[d] = img.data[s]; out.data[d+1] = img.data[s+1];
    out.data[d+2] = img.data[s+2]; out.data[d+3] = img.data[s+3];
  }
  return out;
}

class Band {
  /**
   * `authorW` lets the recipes be written in one fixed coordinate space while the
   * texture is rendered at whatever resolution the budget allows: x and scale are
   * multiplied by w/authorW, so raising the output size never moves anything.
   */
  constructor(w, h, authorW) { this.img = new Img(w, h); this.k = authorW ? w / authorW : 1; }

  /**
   * place(src, opts)
   *   x, y      anchor position; y is the BOTTOM of the element unless anchor:'top'
   *   scale     uniform scale applied to the source
   *   flip      mirror horizontally
   *   alpha     global multiplier
   *   fog       0..1 blend toward `fogColor`
   *   fogColor  [r,g,b]
   *   dark      0..1 multiply toward black (foreground occluders)
   *   sat       saturation multiplier
   */
  place(src, opts = {}) {
    const { x = 0, y = 0, scale = 1, flip = false, alpha = 1, anchor = 'bottom',
            fog = 0, fogColor = [90, 110, 125], dark = 0, sat = 1, tint = null, gamma = 1 } = opts;
    const k = this.k;
    let im = src;
    if (flip) im = flipX(im);
    if (scale * k !== 1) im = resize(im, Math.max(1, Math.round(im.w * scale * k)), Math.max(1, Math.round(im.h * scale * k)));
    if (fog || dark || sat !== 1 || tint || gamma !== 1) {
      im = grade(im, {
        saturation: sat, tint, gamma,
        mix: fog ? { color: fogColor, amount: fog } : null,
      });
      if (dark) im = grade(im, { tint: [1 - dark, 1 - dark, 1 - dark] });
    }
    const dx = Math.round(x * k - im.w / 2);
    const dy = Math.round(anchor === 'top' ? y * k : y * k - im.h);
    composite(this.img, im, dx, dy, alpha);
    // wrap copies so the strip loops
    if (dx + im.w > this.img.w) composite(this.img, im, dx - this.img.w, dy, alpha);
    if (dx < 0) composite(this.img, im, dx + this.img.w, dy, alpha);
    return this;
  }

  /** Vertical depth haze: opaque-ish fog rising from `from` to `to` (0..1 of height). */
  haze(color, amount, from = 1, to = 0.35, seed = 1) {
    const n = fbm(seed, 6, 4);
    const { w, h } = this.img;
    this.img = mapPixels(this.img, (r, g, b, a, x, y) => {
      if (!a) return null;
      const v = y / h;
      let t = (v - to) / (from - to);
      t = Math.max(0, Math.min(1, t));
      t = t * t * (3 - 2 * t);
      const wob = 0.75 + 0.5 * n(x / w, y / h);
      const k = Math.min(1, t * amount * wob);
      return [r + (color[0] - r) * k, g + (color[1] - g) * k, b + (color[2] - b) * k, a];
    });
    return this;
  }

  /** Soft tileable mist ribbons painted into the band as translucent light. */
  mist(color, opts = {}) {
    const { amount = 0.5, seed = 3, cells = 5, yCentre = 0.72, ySpread = 0.3, octaves = 4 } = opts;
    const n = fbm(seed, cells, octaves);
    const { w, h } = this.img;
    const out = this.img;
    for (let y = 0; y < h; y++) {
      const dv = Math.abs(y / h - yCentre) / ySpread;
      const prof = Math.exp(-dv * dv * 2.2);
      if (prof < 0.004) continue;
      for (let x = 0; x < w; x++) {
        const v = n(x / w, y / h * 0.55);
        const k = Math.max(0, (v - 0.42) / 0.58) * prof * amount;
        if (k <= 0.002) continue;
        const i = (y * w + x) * 4;
        const da = out.data[i+3] / 255;
        const oa = k + da * (1 - k);
        for (let c = 0; c < 3; c++)
          out.data[i+c] = Math.round((color[c] * k + out.data[i+c] * da * (1 - k)) / oa);
        out.data[i+3] = Math.round(oa * 255);
      }
    }
    return this;
  }

  /**
   * Warm key light bloom centred at (cx,cy) in 0..1 space — the one warm source per scene.
   *
   * WRAPS IN X. A glow whose radius runs past the strip edge is clipped there, and because
   * the strip tiles that clip becomes a hard vertical seam straight down the middle of the
   * screen — it looks exactly like a torn texture. Every full-strip operation in this file
   * has to be periodic in x for the same reason.
   */
  glow(color, cx, cy, radius, strength) {
    const { w, h } = this.img;
    const px = cx * w, py = cy * h, r = radius * w;
    this.img = mapPixels(this.img, (rr, gg, bb, a, x, y) => {
      if (!a) return null;
      let ax = Math.abs(x - px);
      if (ax > w / 2) ax = w - ax;
      const d = Math.hypot(ax, (y - py) * 1.4) / r;
      const k = Math.max(0, 1 - d);
      const s = k * k * strength;
      if (s <= 0.002) return null;
      return [rr + color[0] * s, gg + color[1] * s, bb + color[2] * s, a];
    });
    return this;
  }

  /** Randomly scatter one of `srcs` along the strip. */
  scatter(srcs, count, seed, optFn) {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const src = srcs[Math.floor(r() * srcs.length) % srcs.length];
      this.place(src, optFn(r, i, this.img.w, this.img.h));
    }
    return this;
  }
}

module.exports = { Band, flipX };
