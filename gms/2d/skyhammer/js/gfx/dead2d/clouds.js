// ============================================================================
// DEAD CODE — Canvas-2D renderer, superseded by the Three.js 2.5D renderer
// (CONTRACTS §14, DECISIONS D12-D16). NOTHING LIVE IMPORTS THIS FILE.
// Kept only because the procedural CLOUD and SKY bakes transfer to 3D as
// textures on planes at negative z. See docs/ART_NOTES.md before reusing.
// Palettes moved on and were restructured: these modules expect the OLD flat
// palette shape (pal.cloudTop, pal.earth, ...), not the current js/gfx/palette.js.
// ============================================================================
// 16 procedurally painted cloud sprites, baked once at boot as alpha masks and re-tinted per
// palette, drawn in 3 parallax bands. This is the single biggest contributor to the look.

import { makeCanvas, ctx2d, rng, noiseAlphaTile, tintMask, mix } from './bake.js';
import { registerBaker, getPlate } from './plates.js';

const N_SPRITES = 16;
const MW = 384, MH = 132;

// wide + flat, soft edged, low contrast. Never a fluffy cumulus ball.
function bakeMask(seed, noise) {
  const c = makeCanvas(MW, MH), g = ctx2d(c);
  const R = rng(seed);
  const blobs = 9 + R.int(6);
  const spread = R.range(0.62, 0.94);
  const baseY = MH * R.range(0.52, 0.60);

  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < blobs; i++) {
    const u = (i + R.range(-0.3, 0.3)) / (blobs - 1);
    const cx = MW * (0.5 + (u - 0.5) * spread);
    const edge = 1 - Math.abs(u - 0.5) * 2;
    const rr = MW * R.range(0.055, 0.13) * (0.45 + edge * 0.9);
    const cy = baseY - rr * R.range(0.15, 0.85) * (0.35 + edge);
    const sq = R.range(0.42, 0.62);
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.72)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.translate(cx, cy); g.scale(1, sq); g.translate(-cx, -cy);
    g.fillStyle = grd;
    g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    g.restore();
  }

  // flatten the base into a soft shelf
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, baseY + MH * 0.03, 0, MH);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut;
  g.fillRect(0, 0, MW, MH);

  // one pass of low-amplitude value noise
  g.globalAlpha = 0.16;
  const o = R.int(128);
  for (let x = -o; x < MW; x += 128) for (let y = -o; y < MH; y += 128) g.drawImage(noise, x, y);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return c;
}

let MASKS = null;
function masks() {
  if (!MASKS) {
    const noise = noiseAlphaTile(128, 0x51e7 ^ 0x9e3, 3, 1.0);
    MASKS = [];
    for (let i = 0; i < N_SPRITES; i++) MASKS.push(bakeMask(0x51e7 + i * 977, noise));
  }
  return MASKS;
}

// Plate `cloud` is INDEXED 0..15 and already palette-tinted; a generated replacement must carry
// its own soft alpha. Never tinted again at draw time.
registerBaker('cloud', (pal, palKey, variant, i) =>
  tintMask(masks()[i], pal.cloudTop, mix(pal.cloudBot, pal.haze, 0.25), 0.2 + (i % 3) * 0.05));

const BANDS = [
  { p: 0.06, tile: 3700, n: 16, yLo: 420, yHi: 1350, sLo: 2.4, sHi: 4.2, a: 0.62 },
  { p: 0.18, tile: 4900, n: 14, yLo: 300, yHi: 980,  sLo: 1.7, sHi: 3.0, a: 0.80 },
  { p: 0.55, tile: 6100, n: 9, yLo: 180, yHi: 860,  sLo: 0.7, sHi: 1.35, a: 0.9 },
];

export function makeClouds(seed = 0x51e7) {
  let pal = null, key = '';

  const layout = BANDS.map((b, bi) => {
    const R = rng(seed + 4001 * (bi + 1));
    const out = [];
    for (let i = 0; i < b.n; i++) {
      out.push({
        wx: R.f() * b.tile,
        wy: R.range(b.yLo, b.yHi),
        s: R.range(b.sLo, b.sHi),
        m: R.int(N_SPRITES),
        a: R.range(0.72, 1),
        flip: R.f() < 0.5,
      });
    }
    out.sort((a, c2) => a.wy - c2.wy);
    return out;
  });

  return {
    setPalette(p, k) { pal = p; key = k; },

    /** band: 0 far, 1 mid, 2 near. density scales opacity for weather. */
    draw(ctx, view, band, density = 1) {
      const b = BANDS[band], list = layout[band];
      const TW = b.tile * view.scale;
      const W = view.W;
      ctx.globalCompositeOperation = 'source-over';
      for (const c of list) {
        const sp = getPlate('cloud', pal, key, '', c.m);
        const w = MW * c.s * view.scale * 0.5;
        const h = MH * c.s * view.scale * 0.5;
        const sy = view.bgY(c.wy, b.p) - h * 0.5;
        if (sy > view.H + h || sy < -h * 2) continue;
        let base = (c.wx - view.camX * b.p) * view.scale;
        base = ((base % TW) + TW) % TW;
        if (base > w) base -= TW;
        const alt = 1 - Math.min(1, Math.max(0, (c.wy - b.yLo) / (b.yHi - b.yLo))) * 0.35;
        ctx.globalAlpha = Math.min(1, b.a * c.a * alt * pal.cloudA * density);
        for (let x = base; x < W + w; x += TW) {
          if (c.flip) {
            ctx.save();
            ctx.translate(x + w, sy);
            ctx.scale(-1, 1);
            ctx.drawImage(sp, -w, 0, w, h);
            ctx.restore();
          } else {
            ctx.drawImage(sp, x - w * 0.5, sy, w, h);
          }
        }
      }
      ctx.globalAlpha = 1;
    },
  };
}
