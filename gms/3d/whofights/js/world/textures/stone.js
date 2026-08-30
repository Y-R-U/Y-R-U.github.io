// Masonry generator. One code path, three reads — the differences all come from zones.js
// (blockShape, blockW/H, jointDepth, chipping, roughness, roughVariance).

import { rng, fields, clamp, lerp, smoothstep, hexRgb, mixRgb } from './noise.js';

const SHAPE = {
  rounded: { joint: 0.42, edgeNoise: 0.30, bulge: 0.34, strength: 1.2, plateau: 0.55 },
  square: { joint: 0.15, edgeNoise: 0.45, bulge: 0.06, strength: 2.1, plateau: 0.18 },
  jagged: { joint: 0.22, edgeNoise: 1.35, bulge: 0.10, strength: 2.9, plateau: 0.22 },
};

export function stone(S, st, tileM, seed = 7) {
  const f = fields();
  const sh = SHAPE[st.blockShape] || SHAPE.square;
  const rand = rng(seed);

  const cols = Math.max(2, Math.round(tileM / st.blockW));
  let rows = Math.max(2, Math.round(tileM / st.blockH));
  if (rows % 2) rows++;
  const cw = S / cols, ch = S / rows;

  const rowOff = new Float32Array(rows);
  const spanOf = new Int16Array(rows * cols);
  const spans = [];
  for (let r = 0; r < rows; r++) {
    rowOff[r] = ((r % 2) * 0.5 + (rand() - 0.5) * 0.14) * cw;
    let c = 0;
    while (c < cols) {
      const len = rand() < 0.16 && c + 2 <= cols ? 2 : 1;
      const idx = spans.length;
      spans.push({
        c0: c, len,
        tone: rand(), lift: rand() * 2 - 1, hue: rand() - 0.5,
        chipA: rand() < st.chipping ? [rand(), rand(), 0.14 + rand() * 0.2] : null,
        chipB: rand() < st.chipping * 0.6 ? [rand(), rand(), 0.1 + rand() * 0.14] : null,
      });
      for (let k = 0; k < len; k++) spanOf[r * cols + c + k] = idx;
      c += len;
    }
  }

  const base = hexRgb(st.base), dark = hexRgb(st.dark), mortar = hexRgb(st.mortar);
  const blockCol = [0, 0, 0], out = [0, 0, 0];
  const rgba = new Uint8ClampedArray(S * S * 4);
  const height = new Float32Array(S * S);
  const jw = sh.joint * ch;
  const relief = st.jointDepth;

  for (let py = 0; py < S; py++) {
    const r = Math.min(rows - 1, Math.floor(py / ch));
    const fy = py / ch - r;
    for (let px = 0; px < S; px++) {
      const u0 = px / S, v0 = py / S;
      const gn = f.grain.at(u0 * 3.1, v0 * 3.1);
      const fn = f.fine.at(u0, v0);
      const cn = f.coarse.at(u0, v0);

      let xu = (px - rowOff[r]) / cw;
      xu -= Math.floor(xu / cols) * cols;
      const c = Math.min(cols - 1, Math.floor(xu));
      const sp = spans[spanOf[r * cols + c]];
      const u = (xu - sp.c0) / sp.len;

      let d = Math.min(Math.min(u, 1 - u) * sp.len * cw, Math.min(fy, 1 - fy) * ch);
      d += (fn - 0.5) * jw * sh.edgeNoise;

      let t = clamp(d / jw, 0, 1);
      let p;
      if (st.blockShape === 'rounded') {
        p = t * t * (3 - 2 * t);
        p = p * 0.62 + 0.38 * Math.sqrt(p);
      } else if (st.blockShape === 'jagged') {
        p = smoothstep(0, 0.28, t);
        p *= 0.82 + 0.18 * Math.round(f.warp.at(u0 * 2.4, v0 * 2.4) * 3) / 3;
      } else {
        p = smoothstep(0, 0.26, t);
      }
      p += sh.bulge * Math.sin(Math.PI * u) * Math.sin(Math.PI * fy) * p;

      for (const chip of [sp.chipA, sp.chipB]) {
        if (!chip) continue;
        const dx = (u - chip[0]) * sp.len * cw / ch, dy = fy - chip[1];
        const cd = Math.sqrt(dx * dx + dy * dy) / chip[2] + (fn - 0.5) * 0.5;
        if (cd < 1) p *= 0.48 + 0.52 * smoothstep(0.3, 1, cd);
      }

      let h = p * relief + sp.lift * 0.09 * relief * p;
      h += (gn - 0.5) * 0.055 * (0.35 + p);
      h += (fn - 0.5) * 0.03 * (1 - p);
      height[py * S + px] = h;

      const toneVar = clamp(sp.tone * 0.8 + cn * 0.4 - 0.1, 0, 1);
      mixRgb(dark, base, 0.28 + toneVar * 0.72, blockCol);
      mixRgb(mortar, blockCol, smoothstep(0.04, 0.42, p), out);

      const ao = lerp(0.28, 1, smoothstep(0, 0.72, p));
      const streak = 1 - 0.11 * smoothstep(0.5, 0.95, f.warp.at(u0 * 0.7, v0 * 2.6)) * (1 - p * 0.4);
      const grain = 0.88 + 0.24 * gn + 0.08 * (fn - 0.5);
      const k = ao * streak * grain;
      // A course of identical blocks reads as wallpaper; each block gets its own warm/cool cast.
      const warm = 1 + sp.hue * 0.14, cool = 1 - sp.hue * 0.14;

      let rough = st.roughness + (gn - 0.5) * 2 * st.roughVariance + (1 - p) * 0.14;
      rough -= sh.plateau * 0.22 * p;

      const i = (py * S + px) * 4;
      rgba[i] = out[0] * k * warm;
      rgba[i + 1] = out[1] * k;
      rgba[i + 2] = out[2] * k * cool;
      rgba[i + 3] = clamp(rough, 0.12, 1) * 255;
    }
  }

  return { rgba, height, strength: sh.strength * relief };
}
