// ============================================================
//  HUD — timer, coins, level indicator, controls hint
// ============================================================

import { W, H } from './config.js';
import { game, getEffective } from './state.js';
import { roundRect } from './draw-utils.js';

export function drawHUD(ctx) {
  const timerMax = getEffective('timerBoost');
  const timerPct = game.timer / timerMax;

  // Timer bar background
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, 10, 10, 200, 20, 10);
  ctx.fill();

  // Timer bar fill
  const timerColor = timerPct > 0.3 ? '#6bcb77' : (timerPct > 0.15 ? '#ffd93d' : '#ff6b6b');
  ctx.fillStyle = timerColor;
  roundRect(ctx, 10, 10, 200 * timerPct, 20, 10);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(game.timer) + 's', 110, 24);

  // Coins
  ctx.fillStyle = '#ffd93d';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('\u2b25 ' + game.coins, 220, 26);

  // Level
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Level ' + game.level, W - 15, 26);

  // Controls hint
  if (game.timer > timerMax - 3 && game.level <= 2) {
    const isTouch = (typeof window !== 'undefined') &&
      ('ontouchstart' in window || (navigator.maxTouchPoints | 0) > 0);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      isTouch
        ? 'Tap to shoot tongue \u2022 Tap again to let go'
        : 'Click to shoot tongue \u2022 Release to let go',
      W / 2, H - 20);
  }
}
