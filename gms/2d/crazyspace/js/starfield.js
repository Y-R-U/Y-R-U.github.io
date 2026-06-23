// starfield.js — multi-layer parallax background using repeating patterns.

import { PALETTE } from './config.js';
import { rand, TAU } from './util.js';

const T = 512; // tile size

function starTile(count, maxSize, color) {
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const ctx = c.getContext('2d');
  for (let i = 0; i < count; i++) {
    const x = rand(T), y = rand(T), s = rand(0.4, maxSize), a = rand(0.25, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.fill();
    if (s > maxSize * 0.7) {
      ctx.globalAlpha = a * 0.4;
      ctx.beginPath(); ctx.arc(x, y, s * 2.5, 0, TAU); ctx.fill();
    }
  }
  return c;
}

export class Starfield {
  constructor() {
    this.layers = [
      { tile: starTile(70, 1.1, '#5566aa'), p: 0.18, pat: null },
      { tile: starTile(55, 1.6, '#8ea0ff'), p: 0.38, pat: null },
      { tile: starTile(34, 2.4, '#dfe8ff'), p: 0.62, pat: null },
    ];
    // soft colored nebulae placed in world space
    this.nebulae = [];
    for (let i = 0; i < 5; i++) {
      this.nebulae.push({
        x: rand(-1000, 4000), y: rand(-1000, 4000),
        r: rand(600, 1300), p: rand(0.25, 0.5),
        color: ['#1b2a6b', '#3a1a5e', '#0b3a4a', '#5e1a3a'][i % 4],
      });
    }
  }

  render(ctx, cam, W, H) {
    // base gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PALETTE.bg1);
    g.addColorStop(1, PALETTE.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // nebulae (additive, parallax)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nebulae) {
      const sx = (n.x - cam.x * n.p) * cam.zoom + W / 2;
      const sy = (n.y - cam.y * n.p) * cam.zoom + H / 2;
      const r = n.r * cam.zoom;
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      rg.addColorStop(0, n.color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // star layers
    for (const L of this.layers) {
      if (!L.pat) L.pat = ctx.createPattern(L.tile, 'repeat');
      let tx = (-cam.x * L.p) % T; if (tx > 0) tx -= T;
      let ty = (-cam.y * L.p) % T; if (ty > 0) ty -= T;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.fillStyle = L.pat;
      ctx.fillRect(0, 0, W - tx + T, H - ty + T);
      ctx.restore();
    }
  }
}
