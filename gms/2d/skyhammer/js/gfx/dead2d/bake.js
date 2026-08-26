// ============================================================================
// DEAD CODE — Canvas-2D renderer, superseded by the Three.js 2.5D renderer
// (CONTRACTS §14, DECISIONS D12-D16). NOTHING LIVE IMPORTS THIS FILE.
// Kept only because the procedural CLOUD and SKY bakes transfer to 3D as
// textures on planes at negative z. See docs/ART_NOTES.md before reusing.
// Palettes moved on and were restructured: these modules expect the OLD flat
// palette shape (pal.cloudTop, pal.earth, ...), not the current js/gfx/palette.js.
// ============================================================================
// Offscreen-canvas and colour helpers. Everything repeated in SKYHAMMER is baked through here once.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c) {
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  return g;
}

/** Local seeded rng. gfx must not depend on core/ (different owner, may not exist yet). */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    f,
    range: (a, b) => a + f() * (b - a),
    int: (n) => Math.floor(f() * n),
    pick: (a) => a[Math.floor(f() * a.length)],
    sign: () => (f() < 0.5 ? -1 : 1),
  };
}

export function hexRgb(h) {
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export function shade(h, k) {
  const c = hexRgb(h);
  return k >= 0 ? rgbHex(c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k)
                : rgbHex(c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k));
}

export function rgba(h, a) {
  const c = hexRgb(h);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function lum(h) {
  const c = hexRgb(h);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

/** Seamless value-noise tile, drawn as greyscale. Used to break up flats. */
export function noiseTile(size, seed, oct = 3) {
  const c = makeCanvas(size, size), g = ctx2d(c);
  const img = g.createImageData(size, size);
  const R = rng(seed);
  const grids = [];
  for (let o = 0; o < oct; o++) {
    const n = 4 << o, gd = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) gd[i] = R.f();
    grids.push({ n, gd });
  }
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, tot = 0;
      for (const { n, gd } of grids) {
        const fx = (x / size) * n, fy = (y / size) * n;
        const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
        const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
        const tx = sm(fx - Math.floor(fx)), ty = sm(fy - Math.floor(fy));
        const a = gd[y0 * n + x0], b = gd[y0 * n + x1], cc = gd[y1 * n + x0], d = gd[y1 * n + x1];
        v += (a + (b - a) * tx + (cc - a + (d - b - cc + a) * tx) * ty) * amp;
        tot += amp; amp *= 0.5;
      }
      v /= tot;
      const i = (y * size + x) * 4, k = Math.round(v * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A soft radial sprite: white core fading to nothing. The workhorse of every glow in the game. */
export function radialSprite(size, stops) {
  const c = makeCanvas(size, size), g = ctx2d(c);
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [t, col] of stops) grd.addColorStop(t, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Turn an alpha-only mask into a coloured sprite with a top-lit / warm-underside gradient. */
export function tintMask(mask, topCol, botCol, edgeLift = 0.22) {
  const w = mask.width, h = mask.height;
  const c = makeCanvas(w, h), g = ctx2d(c);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, topCol);
  grd.addColorStop(1, botCol);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0);
  if (edgeLift > 0) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = edgeLift;
    g.drawImage(mask, 0, -h * 0.055, w, h);
    g.globalAlpha = 1;
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Same noise, but written into the ALPHA channel over black. Used to mottle masks. */
export function noiseAlphaTile(size, seed, oct = 3, gain = 1) {
  const src = noiseTile(size, seed, oct);
  const sg = ctx2d(src);
  const img = sg.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i];
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
    img.data[i + 3] = Math.min(255, v * gain);
  }
  const c = makeCanvas(size, size);
  ctx2d(c).putImageData(img, 0, 0);
  return c;
}
