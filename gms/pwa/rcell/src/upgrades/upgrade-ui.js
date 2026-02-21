// upgrade-ui.js — Upgrade card rendering & selection UI
const UpgradeUI = (() => {
  let currentPicks = [];
  let onSelect = null;
  let visible = false;
  let rerollsLeft = 0;
  let animT = 0;
  let lockTimer = 0;        // seconds remaining before taps are accepted
  const LOCK_DURATION = 1.0; // 1 second lock after screen opens
  const CARD_W = 260;
  const CARD_H = 160;
  const CARD_GAP = 16;

  // Card layout: stacked vertically on portrait mobile
  function getCardRects(count, canvasW, canvasH) {
    const rects = [];
    const totalH = count * CARD_H + (count - 1) * CARD_GAP;
    const startY = (canvasH - totalH) / 2;
    const x = (canvasW - CARD_W) / 2;
    for (let i = 0; i < count; i++) {
      rects.push({ x, y: startY + i * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H });
    }
    return rects;
  }

  function show(picks, rerolls, callback) {
    currentPicks = picks;
    onSelect = callback;
    visible = true;
    rerollsLeft = rerolls || 0;
    animT = 0;
    lockTimer = LOCK_DURATION;
  }

  function hide() {
    visible = false;
    currentPicks = [];
  }

  function isVisible() { return visible; }

  function draw(ctx, canvasW, canvasH, dt) {
    if (!visible) return;
    animT = Math.min(1, animT + dt * 4);
    if (lockTimer > 0) lockTimer = Math.max(0, lockTimer - dt);
    const alpha = animT;

    // Dim backdrop
    ctx.save();
    ctx.globalAlpha = 0.75 * alpha;
    ctx.fillStyle = '#050d1a';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalAlpha = alpha;

    // Title
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 22px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL UP — Choose Upgrade', canvasW / 2, canvasH * 0.12);

    const rects = getCardRects(currentPicks.length, canvasW, canvasH);

    currentPicks.forEach((upgrade, i) => {
      const r = rects[i];
      drawCard(ctx, upgrade, r, i);
    });

    // Lock indicator — fades out as the lock expires
    if (lockTimer > 0) {
      const lockPct = lockTimer / LOCK_DURATION;
      ctx.fillStyle = `rgba(255,209,102,${0.7 * lockPct})`;
      ctx.font = `bold ${14 + 4 * lockPct}px "Exo 2", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('tap to select…', canvasW / 2, canvasH * 0.12 + 28);
    }

    // Reroll button
    if (rerollsLeft > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      const btnY = rects[rects.length - 1].y + CARD_H + 20;
      roundRect(ctx, canvasW / 2 - 60, btnY, 120, 38, 8);
      ctx.fill();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1;
      roundRect(ctx, canvasW / 2 - 60, btnY, 120, 38, 8);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.font = '14px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Reroll (${rerollsLeft})`, canvasW / 2, btnY + 24);
    }

    ctx.restore();
  }

  function drawCard(ctx, upgrade, r, index) {
    const { x, y, w, h } = r;
    const catColors = {
      offensive: '#4af0b0', defensive: '#44aaff', mobility: '#ffd166', utility: '#a78bfa'
    };
    const accent = catColors[upgrade.category] || '#4af0b0';

    // Card background
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();

    // Card border
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();

    // Category bar
    ctx.fillStyle = accent;
    ctx.globalAlpha *= 0.8;
    roundRect(ctx, x, y, w, 6, { tl: 12, tr: 12, bl: 0, br: 0 });
    ctx.fill();
    ctx.globalAlpha = 1;

    // Icon
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.fillText(upgrade.icon || '⚗', x + w / 2, y + 48);

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(upgrade.name, x + w / 2, y + 80);

    // Description
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px "Nunito", sans-serif';
    wrapText(ctx, upgrade.description, x + w / 2, y + 100, w - 24, 18);

    // Category label
    ctx.fillStyle = accent;
    ctx.font = '10px "Exo 2", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(InGameUpgrades.getTierLabel(upgrade.category).toUpperCase(), x + w - 10, y + h - 10);
  }

  function wrapText(ctx, text, cx, startY, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let y = startY;
    ctx.textAlign = 'center';
    for (const word of words) {
      const test = line + (line ? ' ' : '') + word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, cx, y);
        line = word;
        y += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, y);
  }

  function roundRect(ctx, x, y, w, h, radii) {
    const r = typeof radii === 'number'
      ? { tl: radii, tr: radii, bl: radii, br: radii }
      : radii;
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    ctx.lineTo(x + r.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.quadraticCurveTo(x, y, x + r.tl, y);
    ctx.closePath();
  }

  function handleTap(tapX, tapY, canvasW, canvasH) {
    if (!visible) return false;
    if (lockTimer > 0) return false;  // too soon — ignore accidental taps
    const rects = getCardRects(currentPicks.length, canvasW, canvasH);

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (tapX >= r.x && tapX <= r.x + r.w && tapY >= r.y && tapY <= r.y + r.h) {
        const selected = currentPicks[i];
        hide();
        if (onSelect) onSelect(selected);
        return true;
      }
    }

    // Check reroll button
    if (rerollsLeft > 0) {
      const btnY = rects[rects.length - 1].y + CARD_H + 20;
      if (tapX >= canvasW / 2 - 60 && tapX <= canvasW / 2 + 60 &&
          tapY >= btnY && tapY <= btnY + 38) {
        rerollsLeft--;
        const count = currentPicks.length;
        currentPicks = InGameUpgrades.getRandomPicks(count);
        return true;
      }
    }

    return false;
  }

  return { show, hide, isVisible, draw, handleTap };
})();
