/**
 * PLACEHOLDER RENDERER — Canvas2D, one rectangle per cell.
 *
 * This exists so the game boots and can be integration-tested while lane A
 * builds the real WebGL2 density-field renderer. It draws exactly the pixel
 * look the project exists to avoid. DELETE IT BEFORE SHIPPING; main.js only
 * falls back here when js/gfx/renderer.js is absent, and says so loudly.
 */
import { forEachCell } from '../sim/pieces.js';
import { EMPTY } from '../sim/materials.js';
import { F_CLEARING } from '../sim/grid.js';

const TINT = ['#000', '#e8b465', '#5fb7d4', '#c86b8a', '#7fc98a', '#b89ae0'];

export async function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  return {
    placeholder: true,
    resize(w, h, d) { dpr = d; },
    setBiome() {},
    stats() { return { fps: 0, gpuMs: 0, gpuSupported: false, tier: 'placeholder' }; },
    dispose() {},
    draw(world, opts) {
      const v = opts.view, b = v.board, g = world.g;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0c14';
      ctx.fillRect(0, 0, v.w, v.h);
      const s = b.scale;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = '#12151f';
      ctx.fillRect(0, 0, b.w, b.h);
      for (let y = 0; y < g.rows; y++) {
        for (let x = 0; x < g.cols; x++) {
          const i = y * g.cols + x;
          if (g.mat[i] === EMPTY) continue;
          ctx.fillStyle = (g.flags[i] & F_CLEARING) ? '#fff' : (TINT[g.tint[i]] || '#888');
          ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
        }
      }
      if (world.piece) {
        forEachCell(world.piece, (x, y, tint) => {
          if (y < 0) return;
          ctx.fillStyle = TINT[tint] || '#888';
          ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
        });
      }
      ctx.restore();
    },
  };
}
