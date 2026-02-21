// hud.js — Health bar, XP bar, timer, wave counter
const HUD = (() => {
  const BAR_H = 14;
  const BAR_MARGIN = 12;
  const BAR_RADIUS = 7;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function draw(ctx, canvasW, canvasH, playerState, xpSystem, waveNum, totalWaves, gameTime, score) {
    if (!playerState) return;
    ctx.save();

    const barW = canvasW - BAR_MARGIN * 2;

    // HP Bar
    const hpPct = Math.max(0, playerState.hp / playerState.maxHp);
    ctx.fillStyle = 'rgba(5,13,26,0.7)';
    roundRect(ctx, BAR_MARGIN, BAR_MARGIN, barW, BAR_H, BAR_RADIUS);
    ctx.fill();

    // HP fill
    const hpColor = hpPct > 0.5 ? '#4af0b0' : hpPct > 0.25 ? '#ffd166' : '#ff4466';
    ctx.fillStyle = hpColor;
    if (hpPct > 0) {
      roundRect(ctx, BAR_MARGIN, BAR_MARGIN, barW * hpPct, BAR_H, BAR_RADIUS);
      ctx.fill();
    }

    // Shield indicators
    if (playerState.shieldCharges > 0) {
      for (let i = 0; i < playerState.shieldCharges; i++) {
        ctx.beginPath();
        ctx.arc(BAR_MARGIN + 10 + i * 16, BAR_MARGIN + BAR_H / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#44aaff';
        ctx.fill();
      }
    }

    // HP label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Exo 2", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${Math.ceil(playerState.hp)}/${playerState.maxHp}`, BAR_MARGIN + 4, BAR_MARGIN + BAR_H - 3);

    // XP Bar
    const xpPct = xpSystem ? Math.min(1, xpSystem.getXPProgress()) : 0;
    const level = xpSystem ? xpSystem.getLevel() : 1;
    const xpY = BAR_MARGIN * 2 + BAR_H;

    ctx.fillStyle = 'rgba(5,13,26,0.7)';
    roundRect(ctx, BAR_MARGIN, xpY, barW, BAR_H - 2, BAR_RADIUS);
    ctx.fill();

    ctx.fillStyle = '#a78bfa';
    if (xpPct > 0) {
      roundRect(ctx, BAR_MARGIN, xpY, barW * xpPct, BAR_H - 2, BAR_RADIUS);
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Exo 2", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`LVL ${level}`, BAR_MARGIN + 4, xpY + BAR_H - 5);

    if (xpSystem && level < xpSystem.getMaxLevel()) {
      const xpForNext = xpSystem.getXPForNextLevel() - xpSystem.getXPForCurrentLevel();
      const xpCur = xpSystem.getXP() - xpSystem.getXPForCurrentLevel();
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.floor(xpCur)}/${xpForNext} XP`, BAR_MARGIN + barW - 4, xpY + BAR_H - 5);
    }

    // Wave counter (top right)
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(5,13,26,0.7)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(canvasW - 90, BAR_MARGIN, 80, 30, 6) : roundRect(ctx, canvasW - 90, BAR_MARGIN, 80, 30, 6);
    ctx.fill();

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 13px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${waveNum + 1}/${totalWaves}`, canvasW - 50, BAR_MARGIN + 19);

    // Timer (bottom center)
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    ctx.fillStyle = 'rgba(5,13,26,0.6)';
    roundRect(ctx, canvasW / 2 - 35, canvasH - 36, 70, 24, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, canvasW / 2, canvasH - 19);

    // Score (bottom left)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px "Exo 2", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score || 0}`, BAR_MARGIN, canvasH - 20);

    // Armor pips
    if (playerState.armor > 0) {
      for (let i = 0; i < playerState.armor; i++) {
        ctx.beginPath();
        ctx.arc(BAR_MARGIN + 8 + i * 14, xpY + BAR_H + 8, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#888888';
        ctx.fill();
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // Draw wave start banner
  function drawWaveBanner(ctx, canvasW, canvasH, waveNum, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 36px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 20;
    ctx.fillText(`WAVE ${waveNum + 1}`, canvasW / 2, canvasH / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '18px "Nunito", sans-serif';
    const BOSS_WAVE_INDICES = new Set([9, 14, 19, 24]);
    if (BOSS_WAVE_INDICES.has(waveNum)) {
      const label = waveNum === 24 ? 'FINAL BOSS' : 'BOSS ENCOUNTER';
      ctx.fillText(label, canvasW / 2, canvasH / 2 + 36);
    }
    ctx.restore();
  }

  return { draw, drawWaveBanner };
})();
