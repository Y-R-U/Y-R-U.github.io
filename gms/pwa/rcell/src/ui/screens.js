// screens.js — Main menu, death screen, win screen
const Screens = (() => {
  let animT = 0;
  let bgParticles = [];

  function initParticles(canvasW, canvasH) {
    bgParticles = [];
    for (let i = 0; i < 30; i++) {
      bgParticles.push({
        x: Math.random() * canvasW,
        y: Math.random() * canvasH,
        r: 1 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        alpha: 0.1 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function updateParticles(dt, canvasW, canvasH) {
    bgParticles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.phase += dt * 1.5;
      if (p.x < -10) p.x = canvasW + 10;
      if (p.x > canvasW + 10) p.x = -10;
      if (p.y < -10) p.y = canvasH + 10;
      if (p.y > canvasH + 10) p.y = -10;
    });
  }

  function drawBg(ctx, canvasW, canvasH, t) {
    ctx.fillStyle = '#050d1a';
    ctx.fillRect(0, 0, canvasW, canvasH);
    // Plasma particles
    bgParticles.forEach(p => {
      const alpha = p.alpha * (0.7 + 0.3 * Math.sin(p.phase + t));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(74,240,176,${alpha})`;
      ctx.fill();
    });
  }

  function drawButton(ctx, x, y, w, h, label, accent) {
    const r = 10;
    ctx.fillStyle = accent || 'rgba(74,240,176,0.15)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, r)
      : _roundRect(ctx, x - w / 2, y - h / 2, w, h, r);
    ctx.fill();
    ctx.strokeStyle = accent ? accent : '#4af0b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, r)
      : _roundRect(ctx, x - w / 2, y - h / 2, w, h, r);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  function _roundRect(ctx, x, y, w, h, r) {
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

  function hitTest(tapX, tapY, btnX, btnY, btnW, btnH) {
    return tapX >= btnX - btnW / 2 && tapX <= btnX + btnW / 2 &&
           tapY >= btnY - btnH / 2 && tapY <= btnY + btnH / 2;
  }

  // Main Menu
  const mainMenu = {
    buttons: {},
    draw(ctx, canvasW, canvasH, t, saveData) {
      animT += 0.016;
      updateParticles(0.016, canvasW, canvasH);
      drawBg(ctx, canvasW, canvasH, t);

      // Cell logo
      const cx = canvasW / 2, cy = canvasH * 0.28;
      const r = 52;
      const wobble = (angle) => r + 6 * Math.sin(3 * angle + t * 2);
      ctx.beginPath();
      const N = 32;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const rr = wobble(a);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(74,240,176,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#4af0b0';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#4af0b0';
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Title
      ctx.fillStyle = '#4af0b0';
      ctx.font = 'bold 42px "Exo 2", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#4af0b0';
      ctx.shadowBlur = 15;
      ctx.fillText('RCELL', canvasW / 2, canvasH * 0.48);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '14px "Nunito", sans-serif';
      ctx.fillText('IMMUNE DEFENCE ROGUELITE', canvasW / 2, canvasH * 0.54);

      // Stats
      if (saveData && saveData.totalRuns > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '12px "Nunito", sans-serif';
        ctx.fillText(`Runs: ${saveData.totalRuns}  |  Best Wave: ${saveData.bestWave}  |  DNA: ${saveData.dnaPoints}`, canvasW / 2, canvasH * 0.6);
      }

      // Buttons
      const btnY1 = canvasH * 0.68;
      const btnY2 = canvasH * 0.78;
      drawButton(ctx, canvasW / 2, btnY1, 180, 48, 'PLAY', 'rgba(74,240,176,0.2)');
      drawButton(ctx, canvasW / 2, btnY2, 180, 44, 'META UPGRADES', 'rgba(167,139,250,0.2)');

      this.buttons = {
        play: { x: canvasW / 2, y: btnY1, w: 180, h: 48 },
        meta: { x: canvasW / 2, y: btnY2, w: 180, h: 44 }
      };

      // Footer
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '11px "Nunito", sans-serif';
      ctx.fillText('Drag to move · Auto-shoot · Survive!', canvasW / 2, canvasH - 20);
    },
    handleTap(tapX, tapY) {
      if (hitTest(tapX, tapY, this.buttons.play?.x, this.buttons.play?.y, 180, 48)) return 'play';
      if (hitTest(tapX, tapY, this.buttons.meta?.x, this.buttons.meta?.y, 180, 44)) return 'meta';
      return null;
    }
  };

  // Death Screen
  const deathScreen = {
    buttons: {},
    dnaEarned: 0,
    waveReached: 0,
    score: 0,
    draw(ctx, canvasW, canvasH, t) {
      drawBg(ctx, canvasW, canvasH, t);

      // Red tint overlay
      ctx.fillStyle = 'rgba(255,0,0,0.08)';
      ctx.fillRect(0, 0, canvasW, canvasH);

      ctx.textAlign = 'center';

      ctx.fillStyle = '#ff4466';
      ctx.font = 'bold 36px "Exo 2", sans-serif';
      ctx.shadowColor = '#ff4466';
      ctx.shadowBlur = 20;
      ctx.fillText('INFECTED', canvasW / 2, canvasH * 0.22);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '16px "Nunito", sans-serif';
      ctx.fillText('The pathogen overwhelmed you.', canvasW / 2, canvasH * 0.32);

      // Stats box
      const bx = canvasW / 2 - 120, bw = 240, bh = 110, by = canvasH * 0.38;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      _roundRect(ctx, bx, by, bw, bh, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      _roundRect(ctx, bx, by, bw, bh, 12);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '14px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Wave Reached: ${this.waveReached + 1}`, canvasW / 2, by + 28);
      ctx.fillText(`Score: ${this.score}`, canvasW / 2, by + 52);
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 16px "Exo 2", sans-serif';
      ctx.fillText(`+ ${this.dnaEarned} DNA`, canvasW / 2, by + 80);

      const btnY1 = canvasH * 0.67;
      const btnY2 = canvasH * 0.77;
      const btnY3 = canvasH * 0.87;
      drawButton(ctx, canvasW / 2, btnY1, 180, 44, 'PLAY AGAIN', 'rgba(74,240,176,0.2)');
      drawButton(ctx, canvasW / 2, btnY2, 180, 44, 'META UPGRADES', 'rgba(167,139,250,0.2)');
      drawButton(ctx, canvasW / 2, btnY3, 180, 40, 'MAIN MENU', 'rgba(255,255,255,0.05)');

      this.buttons = {
        retry: { x: canvasW / 2, y: btnY1, w: 180, h: 44 },
        meta: { x: canvasW / 2, y: btnY2, w: 180, h: 44 },
        menu: { x: canvasW / 2, y: btnY3, w: 180, h: 40 }
      };
    },
    handleTap(tapX, tapY) {
      if (hitTest(tapX, tapY, this.buttons.retry?.x, this.buttons.retry?.y, 180, 44)) return 'retry';
      if (hitTest(tapX, tapY, this.buttons.meta?.x, this.buttons.meta?.y, 180, 44)) return 'meta';
      if (hitTest(tapX, tapY, this.buttons.menu?.x, this.buttons.menu?.y, 180, 40)) return 'menu';
      return null;
    }
  };

  // Win Screen
  const winScreen = {
    buttons: {},
    score: 0,
    dnaEarned: 0,
    draw(ctx, canvasW, canvasH, t) {
      drawBg(ctx, canvasW, canvasH, t);
      ctx.textAlign = 'center';

      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 36px "Exo 2", sans-serif';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 25;
      ctx.fillText('PATHOGEN ELIMINATED', canvasW / 2, canvasH * 0.22);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '16px "Nunito", sans-serif';
      ctx.fillText('The immune system prevails!', canvasW / 2, canvasH * 0.32);

      const bx = canvasW / 2 - 120, bw = 240, bh = 90, by = canvasH * 0.38;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      _roundRect(ctx, bx, by, bw, bh, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px "Nunito", sans-serif';
      ctx.fillText(`Score: ${this.score}`, canvasW / 2, by + 28);
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 16px "Exo 2", sans-serif';
      ctx.fillText(`+ ${this.dnaEarned} DNA`, canvasW / 2, by + 60);

      const btnY1 = canvasH * 0.65;
      const btnY2 = canvasH * 0.75;
      drawButton(ctx, canvasW / 2, btnY1, 180, 44, 'PLAY AGAIN', 'rgba(74,240,176,0.2)');
      drawButton(ctx, canvasW / 2, btnY2, 180, 44, 'META UPGRADES', 'rgba(167,139,250,0.2)');

      this.buttons = {
        retry: { x: canvasW / 2, y: btnY1, w: 180, h: 44 },
        meta: { x: canvasW / 2, y: btnY2, w: 180, h: 44 }
      };
    },
    handleTap(tapX, tapY) {
      if (hitTest(tapX, tapY, this.buttons.retry?.x, this.buttons.retry?.y, 180, 44)) return 'retry';
      if (hitTest(tapX, tapY, this.buttons.meta?.x, this.buttons.meta?.y, 180, 44)) return 'meta';
      return null;
    }
  };

  return { mainMenu, deathScreen, winScreen, initParticles, updateParticles, drawBg };
})();
