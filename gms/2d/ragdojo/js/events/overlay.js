// Text written into an event picture in ink — the player's name on a blank scroll, sign or
// banner. The manifest gives each picture an optional overlay in image FRACTIONS:
//   { x, y, w, h, rot (degrees), text: "{NAME}", layout: "stack" | "lines" }
// "stack" writes one letter under the next (a hanging scroll); "lines" writes the text's
// lines across (a sign; "\n" breaks a line). Long names shrink, then get cut.
// Pure canvas + ink.js, so the art review page draws exactly what the game draws.

import { rnd, INK } from '../ink.js';

export const LAYOUTS = ['stack', 'lines'];
const FONT = '"Caveat", "Patrick Hand", cursive';
const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : null);

/** A safe overlay or null. Shared by the game, the review tool and its server. */
export function cleanOverlay(o) {
  if (!o || typeof o !== 'object') return null;
  const x = num(o.x, 0, 1), y = num(o.y, 0, 1), w = num(o.w, 0.02, 1), h = num(o.h, 0.02, 1);
  if ([x, y, w, h].includes(null) || x + w > 1.0001 || y + h > 1.0001) return null;
  const text = String(o.text ?? '{NAME}').slice(0, 40);
  if (!text.trim()) return null;
  return { x, y, w, h, rot: num(o.rot ?? 0, -20, 20) ?? 0, text, layout: LAYOUTS.includes(o.layout) ? o.layout : 'stack' };
}

export function cleanName(name) {
  const n = String(name ?? '').toUpperCase().replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim();
  return n || 'YOU';
}

export const overlayText = (ov, name) => ov.text.replaceAll('{NAME}', cleanName(name)).toUpperCase();

/**
 * Lay the text out inside a w×h box: the letters/lines and the font size. Shrinks to fit;
 * below `minFrac` of the box height it stops shrinking and cuts the text instead.
 */
export function layoutOverlay(g, ov, name, w, h) {
  const text = overlayText(ov, name);
  if (ov.layout === 'stack') {
    let letters = [...text.replace(/\s+/g, '')];
    const min = h / 9;
    let size = Math.min(w * 0.82, (h / Math.max(1, letters.length)) * 1.08);
    if (size < min) { letters = letters.slice(0, Math.max(1, Math.floor((h * 1.08) / min))); size = Math.min(w * 0.82, (h / letters.length) * 1.08); }
    return { kind: 'stack', items: letters, size, step: h / letters.length };
  }
  let lines = text.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (!lines.length) lines = [cleanName(name)];
  const min = h / 7;
  let size = (h / lines.length) * 0.8;
  const width = (s, px) => { g.font = `700 ${px}px ${FONT}`; return g.measureText(s).width; };
  for (const s of lines) size = Math.min(size, size * (w * 0.92) / Math.max(1, width(s, size)));
  if (size < min) {
    size = min;
    lines = lines.map((s) => {
      if (width(s, size) <= w * 0.92) return s;
      let t = s;
      while (t.length > 1 && width(t + '…', size) > w * 0.92) t = t.slice(0, -1);
      return t + '…';
    });
  }
  return { kind: 'lines', items: lines, size, step: h / lines.length };
}

/** Write the overlay into an image-sized context (W×H = the picture's pixels). */
export function drawOverlay(g, W, H, ov, name) {
  ov = cleanOverlay(ov);
  if (!ov) return;
  const w = ov.w * W, h = ov.h * H;
  g.save();
  g.translate(ov.x * W + w / 2, ov.y * H + h / 2);
  g.rotate((ov.rot * Math.PI) / 180);
  const L = layoutOverlay(g, ov, name, w, h);
  g.font = `700 ${L.size}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = INK;
  L.items.forEach((s, i) => {
    const seed = i * 17 + s.length * 3;
    const cy = -h / 2 + L.step * (i + 0.5) + L.size * 0.04;
    // Two passes, the second faint and a hair off: a pen line rather than a printed one.
    for (const [a, dx] of [[0.92, 0], [0.32, 0.9]]) {
      g.save();
      g.globalAlpha = a;
      g.translate((rnd(seed) - 0.5) * L.size * 0.06 + dx, cy + (rnd(seed + 1) - 0.5) * L.size * 0.05);
      g.rotate((rnd(seed + 2) - 0.5) * 0.09);
      g.fillText(s, 0, 0);
      g.restore();
    }
  });
  g.restore();
}

/** The picture with its overlay baked in, as a canvas (or the image itself if it has none). */
export function composite(img, ov, name) {
  if (!cleanOverlay(ov)) return img;
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  drawOverlay(g, W, H, ov, name);
  return c;
}
