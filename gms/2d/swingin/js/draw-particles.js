// ============================================================
//  PARTICLE RENDERING
// ============================================================

import { game, camera } from './state.js';
import { particles } from './particles.js';

export function drawParticles(ctx) {
  for (const p of particles) {
    const sx = p.x - (game.state === 'playing' ? camera.x : 0);
    const sy = p.y - (game.state === 'playing' ? camera.y : 0);
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
