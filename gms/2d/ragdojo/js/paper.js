// The sheet of paper the whole game happens on. Baked once into an offscreen canvas.

import { rnd, stroke, circle } from './ink.js';

export const PAPER_CREAM = '#f7f2e3';

function fibreNoise(ctx, w, h, seed) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let s = seed | 0;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = ((s >> 16) & 255) - 128;
    const v = n * 0.055;
    d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.85;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * @param {number} w @param {number} h  sheet size in world units
 * @param {object} opts  ruled: line spacing, ruleTop, margin: x of the red margin rule
 */
export function makeSheet(w, h, seed = 7, opts = {}) {
  const rule = opts.rule ?? 46;
  const ruleTop = opts.ruleTop ?? 96;
  const marginX = opts.margin ?? 132;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  g.fillStyle = PAPER_CREAM;
  g.fillRect(0, 0, w, h);

  // Low-frequency tonal blotches — real paper is never one flat colour.
  for (let i = 0; i < 46; i++) {
    const x = rnd(seed + i * 3) * w, y = rnd(seed + i * 5 + 1) * h;
    const r = 90 + rnd(seed + i * 7) * 320;
    const dark = rnd(seed + i * 11) > 0.45;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(196,180,146,0.10)' : 'rgba(255,253,244,0.13)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  fibreNoise(g, w, h, seed * 991 + 17);

  // Loose fibres sitting on the surface.
  g.save();
  for (let i = 0; i < 240; i++) {
    const x = rnd(seed + 900 + i * 3) * w, y = rnd(seed + 901 + i * 5) * h;
    const a = rnd(seed + 902 + i * 7) * 6.283, len = 3 + rnd(seed + 903 + i) * 9;
    g.globalAlpha = 0.05 + rnd(seed + 904 + i) * 0.07;
    g.strokeStyle = '#9a9078';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.restore();

  // Ruled lines.
  g.save();
  g.globalCompositeOperation = 'multiply';
  for (let y = ruleTop, i = 0; y < h - 24; y += rule, i++) {
    stroke(g, [[10, y], [w - 10, y]], {
      w: 1.7, passes: 1, wob: 0.55, step: 34, seed: seed + i * 131,
      col: 'rgba(118,158,196,0.72)', a: 0.85,
    });
  }
  // Red margin rule.
  stroke(g, [[marginX, 8], [marginX, h - 8]], {
    w: 1.8, passes: 1, wob: 0.6, step: 40, seed: seed + 77, col: 'rgba(214,120,132,0.7)', a: 0.9,
  });
  stroke(g, [[marginX + 5, 8], [marginX + 5, h - 8]], {
    w: 1.4, passes: 1, wob: 0.6, step: 40, seed: seed + 78, col: 'rgba(214,120,132,0.45)', a: 0.8,
  });
  g.restore();

  // Punched holes down the left edge.
  g.save();
  for (let i = 0; i < 3; i++) {
    const hy = h * (0.22 + i * 0.28);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(120,112,96,0.30)';
    g.beginPath(); g.arc(52, hy, 17, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(88,82,70,0.55)';
    g.beginPath(); g.arc(52, hy + 1.5, 15.5, 0, 6.283); g.fill();
    g.globalAlpha = 0.5;
    circle(g, 52, hy, 16, { w: 1.2, passes: 1, wob: 0.9, seed: seed + i * 41, col: 'rgba(90,84,70,0.5)' });
    g.globalAlpha = 1;
  }
  g.restore();

  // Edge shading — the sheet lifts very slightly off the desk.
  const edge = 26;
  const band = (x, y, bw, bh, x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(140,126,100,0.22)');
    gr.addColorStop(1, 'rgba(140,126,100,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, bw, bh);
  };
  band(0, 0, edge, h, 0, 0, edge, 0);
  band(w - edge, 0, edge, h, w, 0, w - edge, 0);
  band(0, 0, w, edge, 0, 0, 0, edge);
  band(0, h - edge, w, edge, 0, h, 0, h - edge);

  return c;
}

/** Desk surface behind the sheet, plus the sheet's drop shadow. */
export function drawDesk(ctx, vw, vh, sheet, seed = 3) {
  const gr = ctx.createLinearGradient(0, 0, vw, vh);
  gr.addColorStop(0, '#3b3428');
  gr.addColorStop(0.5, '#4a4133');
  gr.addColorStop(1, '#332d23');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = '#1d1913';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * vh + rnd(seed + i) * 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(vw * 0.3, y + rnd(seed + i * 3) * 12 - 6, vw * 0.7, y + rnd(seed + i * 5) * 12 - 6, vw, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function sheetShadow(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  ctx.restore();
}
