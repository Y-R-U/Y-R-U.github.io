#!/usr/bin/env node
// Edge padding. Flux never fills the mannequin silhouette to the last pixel, so the outermost
// texels of every island are white background — and those are exactly the texels the folded side
// strips sample. Untreated, every limb gets a white sliver down its side and the model looks
// broken in a way the texture sheet does not.
//
// So: flood the white background in from the border, then grow the painted colours outward into
// it. Standard texture-atlas dilation, and the single largest quality win in this pipeline.
//
//   node tools/skin/dilate.mjs art/skins/knight_s11.png            (in place, keeps _raw)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Canvas, readPNG } from './raster.mjs';

const BG_MIN = 232;       // a pixel this pale on every channel, reachable from the border, is paper
const BG_SPREAD = 26;     // …and this close to neutral

export function dilate(buf, passes = 20) {
  const { w, h, d } = readPNG(buf);
  const bg = new Uint8Array(w * h);
  const pale = i => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    return Math.min(r, g, b) >= BG_MIN && Math.max(r, g, b) - Math.min(r, g, b) <= BG_SPREAD;
  };

  // Border flood, so a white highlight inside the armour is not mistaken for paper.
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !pale(i)) continue;
    bg[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }

  let filled = 0;
  const grown = new Uint8Array(w * h);
  for (let pass = 0; pass < passes; pass++) {
    const grow = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bg[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (bg[j]) continue;
        r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
      }
      if (n) grow.push(i, r / n, g / n, b / n);
    }
    if (!grow.length) break;
    for (let k = 0; k < grow.length; k += 4) {
      const i = grow[k];
      d[i * 4] = grow[k + 1]; d[i * 4 + 1] = grow[k + 2]; d[i * 4 + 2] = grow[k + 3];
      bg[i] = 0;
      grown[i] = 1;
      filled++;
    }
  }

  // Growth propagates each source texel outward in a straight ray, so an outline and a highlight
  // side by side come out as a comb of alternating light and dark teeth — and the folded side
  // strips run that comb down the limb, which is far more visible than a flat band would be.
  // Blurring the grown region only (never the drawing) turns the comb into a wash of the edge's
  // own average colour, which is what the side of a limb should look like anyway.
  const src = Uint8ClampedArray.from(d);
  for (let pass = 0; pass < 4; pass++) {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!grown[i]) continue;
      let r = 0, g = 0, b = 0;
      for (const j of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1, i]) {
        r += src[j * 4]; g += src[j * 4 + 1]; b += src[j * 4 + 2];
      }
      d[i * 4] = r / 9; d[i * 4 + 1] = g / 9; d[i * 4 + 2] = b / 9;
    }
    src.set(d);
  }

  const cv = new Canvas(w, h);
  cv.d.set(d);
  return { buf: cv.png(), filled, w, h };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of process.argv.slice(2)) {
    if (!existsSync(f)) { console.error(`missing ${f}`); continue; }
    const src = readFileSync(f);
    const raw = f.replace(/\.png$/, '_raw.png');
    if (!existsSync(raw)) writeFileSync(raw, src);
    const r = dilate(src);
    writeFileSync(f, r.buf);
    console.log(`${f}: grew ${r.filled} px`);
  }
}
