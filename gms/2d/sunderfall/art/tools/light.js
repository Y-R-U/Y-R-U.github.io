// Bake FORM into a cutout: directional key, cool fill, rim, cavity occlusion, contact
// darkening — plus the cast shadows and light pools that stop art floating.
//
// The rule this module exists to enforce: **one key per location, everything obeys it.**
// A cutout that has the same value on both edges reads as a sticker no matter how well it
// is drawn. What is baked here is form, not the dynamic light: keyAmt stays moderate so the
// runtime's 256-light buffer still has somewhere to go. Runtime lighting multiplies what is
// already there; it cannot invent an occluded crevice or a dark side.
//
// Screen space throughout: +x right, +y DOWN. `dir` is the direction the light TRAVELS,
// so an upper-left key is roughly [0.62, 0.78].
const { Img, blur, resize, mapPixels } = require('./img.js');

/** The one global key. Props are lit to this everywhere so the kit stays coherent. */
const KEY = {
  dir: [0.62, 0.785],            // upper-left, 38 degrees off vertical
  warm: [1.00, 0.86, 0.62],      // key colour — moonlit-warm, deliberately not orange
  cool: [0.46, 0.62, 0.92],      // everything that is not the key goes cool
};

const norm = ([x, y]) => { const m = Math.hypot(x, y) || 1; return [x / m, y / m]; };

/** Separable box blur over a scalar Float32 field. */
function boxF(src, w, h, radius, passes = 2) {
  if (radius < 1) return Float32Array.from(src);
  let cur = Float32Array.from(src);
  const tmp = new Float32Array(w * h);
  const win = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += cur[y * w + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / win;
        sum -= cur[y * w + Math.min(w - 1, Math.max(0, x - radius))];
        sum += cur[y * w + Math.min(w - 1, Math.max(0, x + radius + 1))];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        cur[y * w + x] = sum / win;
        sum -= tmp[Math.min(h - 1, Math.max(0, y - radius)) * w + x];
        sum += tmp[Math.min(h - 1, Math.max(0, y + radius + 1)) * w + x];
      }
    }
  }
  return cur;
}

const alphaField = img => {
  const f = new Float32Array(img.w * img.h);
  for (let i = 0; i < f.length; i++) f[i] = img.data[i * 4 + 3] / 255;
  return f;
};

/**
 * How much of the light direction the surface faces, in -1..1, from a blurred alpha field.
 * +1 = squarely facing the key, -1 = squarely away, 0 = deep inside the form where a
 * silhouette carries no information. Saturating on gradient magnitude is what makes the
 * middle of a wide trunk stay neutral instead of picking up gradient noise.
 */
function facing(field, w, h, radius, L) {
  // 3 passes, not 2: a two-pass box blur leaves visible piecewise-linear plateaus in the
  // gradient, which show up as blocky banding across any large flat form.
  const F = boxF(field, w, h, radius, 3);
  const t = new Float32Array(w * h);
  const gScale = 0.5 / Math.max(1, radius);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
    const ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
    const gx = (F[y * w + xp] - F[y * w + xm]) * 0.5;
    const gy = (F[yp * w + x] - F[ym * w + x]) * 0.5;
    const mag = Math.hypot(gx, gy);
    if (mag < 1e-6) continue;
    // outward normal is -grad (alpha increases inward)
    const nx = -gx / mag, ny = -gy / mag;
    t[y * w + x] = (nx * -L[0] + ny * -L[1]) * Math.min(1, mag / gScale);
  }
  return { t, F };
}

/**
 * sculpt(img, opts) -> Img
 *
 * opts:
 *  dir         light travel direction, default KEY.dir
 *  key/keyAmt  key colour multiplier and its gain on the lit side
 *  fill/fillAmt cool colour the shadow side mixes toward
 *  shadowSide  how far the anti-key side goes toward black (0..1)
 *  rim         narrow highlight on the key-facing contour
 *  cavity      crevice occlusion from a luminance high-pass
 *  contact     bottom-edge darkening, i.e. where the thing meets the ground
 *  broad/edge  blur radii as a fraction of min(w,h) for the broad form and the rim
 */
function sculpt(img, o = {}) {
  const {
    dir = KEY.dir, key = KEY.warm, keyAmt = 0.40,
    fill = KEY.cool, fillAmt = 0.40,
    shadowSide = 0.55, rim = 0.48, rimColor = null,
    cavity = 0.55, contact = 0.46, contactH = 0.14,
    broad = 0.32, edge = 0.035, gain = 1,
    // A silhouette-normal term alone only lights a band the width of the blur radius, so a
    // wide form stays neutral through the middle and still reads flat. `planar` is a plain
    // ramp across the whole object along the light axis — that is the term that guarantees
    // a big tree is not the same value on its left and right edges.
    planar = 0.5,
  } = o;
  const { w, h } = img;
  if (w < 4 || h < 4) return img.clone();
  const L = norm(dir);
  const rc = rimColor || key;
  const A = alphaField(img);

  const rBroad = Math.max(3, Math.round(Math.min(w, h) * broad));
  const rEdge = Math.max(2, Math.round(Math.min(w, h) * edge));
  const { t: tBroad } = facing(A, w, h, rBroad, L);
  const { t: tEdge, F: Aedge } = facing(A, w, h, rEdge, L);

  // cavity: alpha-weighted local mean of luminance, so the silhouette edge does not
  // register as one enormous crevice
  const rCav = Math.max(2, Math.round(Math.min(w, h) * 0.055));
  const lum = new Float32Array(w * h), lumA = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) {
    const l = img.data[i*4] * 0.299 + img.data[i*4+1] * 0.587 + img.data[i*4+2] * 0.114;
    lum[i] = l; lumA[i] = l * A[i];
  }
  const lb = boxF(lumA, w, h, rCav, 2), ab = boxF(A, w, h, rCav, 2);

  // contact: the bottom of the alpha bbox, per column, so a prop with feet darkens at
  // the feet rather than across a rectangle
  const colBot = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--)
    if (A[y * w + x] > 0.35) { colBot[x] = y; break; }
  const cH = Math.max(2, Math.round(h * contactH));

  // planar ramp: centroid and half-extent measured along the light axis
  let sx = 0, sy = 0, sa = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = A[y * w + x]; if (a < 0.4) continue;
    sx += x * a; sy += y * a; sa += a;
  }
  const cx = sa ? sx / sa : w / 2, cy = sa ? sy / sa : h / 2;
  let ext = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A[y * w + x] < 0.4) continue;
    const d = Math.abs((x - cx) * -L[0] + (y - cy) * -L[1]);
    if (d > ext) ext = d;
  }
  const extInv = 1 / (ext * 0.86);

  const out = img.clone();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = i * 4;
    if (!out.data[p + 3]) continue;
    const pl = Math.max(-1, Math.min(1, ((x - cx) * -L[0] + (y - cy) * -L[1]) * extInv));
    const tb = Math.max(-1, Math.min(1, tBroad[i] * (1 - planar) + pl * planar));
    const pos = Math.max(0, tb), neg = Math.max(0, -tb);

    let cav = 1;
    if (ab[i] > 0.02) {
      const hp = lum[i] - lb[i] / ab[i];
      if (hp < 0) cav = 1 + cavity * Math.max(-1, hp / 80);
    }
    let cont = 1;
    if (colBot[x] >= 0) {
      const d = colBot[x] - y;
      if (d < cH) cont = 1 - contact * (1 - d / cH) ** 1.4;
    }

    const m = (1 - shadowSide * neg) * cav * cont * gain;
    let c = [out.data[p] * m, out.data[p+1] * m, out.data[p+2] * m];
    for (let k = 0; k < 3; k++) c[k] *= 1 + keyAmt * pos * key[k];
    if (neg > 0.01) {
      const l2 = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
      const f = fillAmt * neg;
      for (let k = 0; k < 3; k++) c[k] += (l2 * fill[k] * 1.35 - c[k]) * f;
    }
    if (rim > 0) {
      const band = Math.max(0, 4 * Aedge[i] * (1 - Aedge[i]));
      const rv = rim * band * Math.max(0, tEdge[i]) ** 1.4 * 210;
      for (let k = 0; k < 3; k++) c[k] += rv * rc[k];
    }
    out.data[p] = Math.max(0, Math.min(255, c[0]));
    out.data[p+1] = Math.max(0, Math.min(255, c[1]));
    out.data[p+2] = Math.max(0, Math.min(255, c[2]));
  }
  return out;
}

/**
 * A local emitter's effect ON a neighbouring object: warm gain on the side facing the
 * light, with inverse-square-ish falloff. `lx,ly` are in the image's own pixel space and
 * may sit outside it. This is defect #2 — a glow that lights nothing advertises that
 * there is no lighting system.
 */
function pointRelight(img, o = {}) {
  const { lx = 0, ly = 0, radius = 200, color = [1, 0.72, 0.38], strength = 0.9, wrap = 0.35 } = o;
  const { w, h } = img;
  const A = alphaField(img);
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.10));
  const F = boxF(A, w, h, r, 2);
  const out = img.clone();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = i * 4;
    if (!out.data[p + 3]) continue;
    const dx = lx - x, dy = ly - y;
    const d = Math.hypot(dx, dy);
    const fall = Math.max(0, 1 - d / radius) ** 2;
    if (fall < 0.004) continue;
    const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
    const ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
    const gx = (F[y * w + xp] - F[y * w + xm]) * 0.5, gy = (F[yp * w + x] - F[ym * w + x]) * 0.5;
    const mag = Math.hypot(gx, gy) || 1e-6;
    const nx = -gx / mag, ny = -gy / mag;
    const lam = Math.max(0, (nx * dx + ny * dy) / (d || 1));
    const k = fall * strength * (wrap + (1 - wrap) * Math.min(1, mag / (0.5 / r) ) * lam);
    for (let c = 0; c < 3; c++)
      out.data[p + c] = Math.min(255, out.data[p + c] * (1 + k * color[c] * 0.55) + k * color[c] * 66);
  }
  return out;
}

/**
 * Project a cutout's silhouette onto the ground as a cast shadow.
 * Returns { img, ax, ay } where (ax,ay) is the prop's own foot position inside the
 * returned image, so it draws at exactly the prop's anchor.
 */
function castShadow(img, o = {}) {
  const { dir = KEY.dir, squash = 0.30, len = 1.0, soft = 0.055, alpha = 0.62, color = [4, 7, 11] } = o;
  const L = norm(dir);
  const { w, h } = img;
  const shear = (L[0] / Math.max(0.2, L[1])) * len;
  const spanX = Math.abs(shear) * h;
  const pad = Math.max(6, Math.round(Math.min(w, h) * soft * 3));
  const outW = Math.ceil(w + spanX) + pad * 2;
  const outH = Math.ceil(h * squash) + pad * 2;
  const ax = pad + (shear >= 0 ? 0 : Math.ceil(spanX));
  const ay = outH - pad;
  const acc = new Float32Array(outW * outH);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = img.data[(y * w + x) * 4 + 3] / 255;
    if (a < 0.02) continue;
    const above = h - y;
    const dx = Math.round(ax + x + above * shear);
    const dy = Math.round(ay - above * squash);
    if (dx < 0 || dx >= outW || dy < 0 || dy >= outH) continue;
    const i = dy * outW + dx;
    if (a > acc[i]) acc[i] = a;
  }
  const sh = new Img(outW, outH);
  for (let i = 0; i < acc.length; i++) {
    sh.data[i*4] = color[0]; sh.data[i*4+1] = color[1]; sh.data[i*4+2] = color[2];
    sh.data[i*4+3] = Math.round(Math.min(1, acc[i]) * 255);
  }
  const rb = Math.max(2, Math.round(Math.min(w, h) * soft));
  const blurred = blur(sh, rb, 3);
  return { img: mapPixels(blurred, (r, g, b, a) => [color[0], color[1], color[2], a * alpha]), ax, ay };
}

/** Multiply a shadow image onto a view (dst is opaque). */
function shadowOnto(dst, sh, dx, dy, tint = [0.10, 0.13, 0.20], clipTop = -1e9) {
  for (let y = 0; y < sh.h; y++) {
    const vy = dy + y;
    if (vy < 0 || vy >= dst.h || vy < clipTop) continue;
    for (let x = 0; x < sh.w; x++) {
      const vx = dx + x;
      if (vx < 0 || vx >= dst.w) continue;
      const a = sh.data[(y * sh.w + x) * 4 + 3] / 255;
      if (a < 0.004) continue;
      const i = (vy * dst.w + vx) * 4;
      for (let c = 0; c < 3; c++) dst.data[i + c] = dst.data[i + c] * (1 - a * (1 - tint[c]));
    }
  }
}

/**
 * An emitter's falloff pool on the surface it stands on. Additive, heavily squashed,
 * with a soft elliptical falloff — this is what a light looks like when it is a light
 * rather than a decal.
 */
function pool(dst, cx, cy, rx, ry, color, strength, o = {}) {
  // `wrap` for anything painted into a horizontally tiling band — a clipped falloff at the
  // strip edge becomes a hard vertical seam on screen.
  const { power = 2.2, clipTop = -1e9, wrap = false } = o;
  const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(dst.h - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    if (y < clipTop) continue;
    for (let x = x0; x <= x1; x++) {
      const px = wrap ? ((x % dst.w) + dst.w) % dst.w : x;
      if (px < 0 || px >= dst.w) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d >= 1) continue;
      const k = (1 - d) ** power * strength;
      const i = (y * dst.w + px) * 4;
      for (let c = 0; c < 3; c++) dst.data[i + c] = Math.min(255, dst.data[i + c] + color[c] * k);
    }
  }
}

/** Radial glow in air (not on a surface) — round, weaker, for the emitter itself. */
function halo(dst, cx, cy, r, color, strength, power = 2.6, wrap = false) {
  pool(dst, cx, cy, r, r, color, strength, { power, wrap });
}

/**
 * Progressive edge softness with distance. Uniform razor edges at every depth flatten the
 * stack independently of the fog; the far band should lose its contour, the foreground
 * occluder must keep it.
 */
function soften(img, radius, amount = 1) {
  if (radius < 1 || amount <= 0) return img;
  const b = blur(img, Math.round(radius), 2);
  return mapPixels(img, (r, g, b2, a, x, y) => {
    const i = (y * img.w + x) * 4;
    return [
      r + (b.data[i] - r) * amount,
      g + (b.data[i+1] - g) * amount,
      b2 + (b.data[i+2] - b2) * amount,
      a + (b.data[i+3] - a) * amount,
    ];
  });
}

/**
 * Step the atmosphere into discrete value plateaus instead of one smooth airbrush.
 * `stops` are [0..1 of height, mixAmount] pairs; between stops the value is held, and the
 * transition is short. Three bands read as three depths; a gradient reads as a gradient.
 */
function bandedHaze(img, color, stops, o = {}) {
  const { hardness = 0.16, jitter = null } = o;
  const h = img.h;
  return mapPixels(img, (r, g, b, a, x, y) => {
    if (!a) return null;
    let v = y / h;
    if (jitter) v += jitter(x / img.w) / h;
    let amt = stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [y0, a0] = stops[i], [y1, a1] = stops[i + 1];
      if (v <= y0) { amt = a0; break; }
      if (v >= y1) { amt = a1; continue; }
      const mid = (y0 + y1) / 2, half = (y1 - y0) / 2;
      let t = (v - (mid - half * hardness)) / (2 * half * hardness);
      t = Math.max(0, Math.min(1, t));
      t = t * t * (3 - 2 * t);
      amt = a0 + (a1 - a0) * t;
      break;
    }
    return [r + (color[0] - r) * amt, g + (color[1] - g) * amt, b + (color[2] - b) * amt, a];
  });
}

module.exports = { KEY, sculpt, pointRelight, castShadow, shadowOnto, pool, halo, soften,
                   bandedHaze, boxF, alphaField, norm };
