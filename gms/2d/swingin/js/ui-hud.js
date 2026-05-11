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

  // Saves remaining — little fish icons
  const iconY = 46;
  let iconX = W - 15;
  ctx.textAlign = 'right';
  for (let i = game.maxSaves - 1; i >= 0; i--) {
    drawSaveIcon(ctx, iconX, iconY, i < game.saves);
    iconX -= 22;
  }

  drawSavesLabel(ctx);

  // Controls hint
  if (game.timer > timerMax - 3 && game.level <= 2) {
    const isTouch = (typeof window !== 'undefined') &&
      ('ontouchstart' in window || (navigator.maxTouchPoints | 0) > 0);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      isTouch
        ? 'Tap to grab \u2022 Hold to pull up \u2022 Release to launch'
        : 'Click to grab \u2022 Hold to pull up \u2022 Release to launch',
      W / 2, H - 20);
  }
}

function drawSaveIcon(ctx, x, y, active) {
  ctx.save();
  ctx.translate(x - 8, y);
  ctx.fillStyle = active ? '#e6883a' : 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-11, -3);
  ctx.lineTo(-11, 3);
  ctx.closePath();
  ctx.fill();
  if (active) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(4, -1, 1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawSavesLabel(ctx) {
  if (game.saves >= game.maxSaves) return;
  // Subtle "saves" label when at least one has been used.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('saves', W - 15 - game.maxSaves * 22, 46 + 2);
}
