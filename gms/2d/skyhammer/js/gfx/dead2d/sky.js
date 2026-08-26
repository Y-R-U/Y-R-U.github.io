// ============================================================================
// DEAD CODE — Canvas-2D renderer, superseded by the Three.js 2.5D renderer
// (CONTRACTS §14, DECISIONS D12-D16). NOTHING LIVE IMPORTS THIS FILE.
// Kept only because the procedural CLOUD and SKY bakes transfer to 3D as
// textures on planes at negative z. See docs/ART_NOTES.md before reusing.
// Palettes moved on and were restructured: these modules expect the OLD flat
// palette shape (pal.cloudTop, pal.earth, ...), not the current js/gfx/palette.js.
// ============================================================================
// The sky: gradient strip + hot horizon bloom + sun glow + (night only) stars.
// Pixels come from plates.js so a generated plate can replace any of them later. ART.md §3 layer 1.

import { makeCanvas, ctx2d, radialSprite, rgba, mix, shade, rng } from './bake.js';
import { registerBaker, getPlate } from './plates.js';

const SKY_TOP = 2600, SKY_BOT = -400, SPAN = SKY_TOP - SKY_BOT;
const HORIZON_T = 730;   // world y the palette's first stop sits at (viewport top at rest)
const BAND = 900;        // world units the palette gradient spans

const posOf = (wy) => (SKY_TOP - wy) / SPAN;
const deepOf = (pal) => mix(shade(pal.sky[0][1], -0.55), '#0d1730', 0.45);

registerBaker('sky', (pal) => {
  const W = 4, H = 1400;
  const c = makeCanvas(W, H), g = ctx2d(c);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, deepOf(pal));
  grd.addColorStop(posOf(1670), mix(pal.sky[0][1], deepOf(pal), 0.5));
  for (const [t, col] of pal.sky) grd.addColorStop(posOf(HORIZON_T - t * BAND), col);
  grd.addColorStop(1, pal.sky[pal.sky.length - 1][1]);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  if (pal.bloomK > 0.01) {
    const b = g.createLinearGradient(0, 0, 0, H);
    b.addColorStop(posOf(900), rgba(pal.bloom, 0));
    b.addColorStop(posOf(360), rgba(pal.bloom, pal.bloomK * 0.22));
    b.addColorStop(posOf(60), rgba(pal.bloom, pal.bloomK * 0.62));
    b.addColorStop(1, rgba(pal.bloom, pal.bloomK * 0.55));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = b;
    g.fillRect(0, 0, W, H);
  }
  return c;
});

registerBaker('stars', () => {
  const S = 512;
  const c = makeCanvas(S, S), g = ctx2d(c);
  const R = rng(0x5747);
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = R.range(0.25, 1);
    g.fillStyle = R.f() < 0.12 ? '#ffd9b0' : '#ffffff';
    g.beginPath(); g.arc(R.f() * S, R.f() * S, R.range(0.4, 1.5), 0, 6.2832); g.fill();
  }
  return c;
});

registerBaker('sun', () => radialSprite(256, [
  [0, 'rgba(255,255,255,0.95)'], [0.12, 'rgba(255,244,214,0.75)'],
  [0.32, 'rgba(255,214,150,0.28)'], [0.62, 'rgba(255,190,130,0.07)'], [1, 'rgba(255,180,120,0)'],
]));

export function makeSky() {
  let pal = null, key = '';

  return {
    setPalette(p, k) { pal = p; key = k; },
    horizonY(view) { return view.syFlat(0); },

    draw(ctx, view) {
      const W = view.W, H = view.H;
      const strip = getPlate('sky', pal, key);
      const top = view.syFlat(SKY_TOP), bot = view.syFlat(SKY_BOT);
      if (top > 0) { ctx.fillStyle = deepOf(pal); ctx.fillRect(0, 0, W, Math.ceil(top) + 1); }
      ctx.drawImage(strip, 0, 0, strip.width, strip.height, 0, top, W, bot - top);
      if (bot < H) { ctx.fillStyle = pal.sky[pal.sky.length - 1][1]; ctx.fillRect(0, Math.floor(bot), W, H - bot + 1); }

      if (pal.star > 0.02) {
        const stars = getPlate('stars', pal, '');
        const fade = Math.min(1, Math.max(0, (view.camY + 400) / 1400)) * 0.55 + 0.45;
        ctx.globalAlpha = pal.star * fade;
        const ox = ((view.bgOff(0.03) % 512) + 512) % 512;
        const oy = view.bgY(2200, 0.05);
        for (let x = -ox; x < W; x += 512) {
          for (let y = oy; y < H && y < oy + 1024; y += 512) ctx.drawImage(stars, x, y);
        }
        ctx.globalAlpha = 1;
      }

      if (pal.sunK > 0.02) {
        const sun = getPlate('sun', pal, '');
        const r = H * 1.15;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pal.sunK;
        ctx.drawImage(sun, pal.sunX * W - r / 2, view.bgY(210, 0.08) - r / 2, r, r);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  };
}
