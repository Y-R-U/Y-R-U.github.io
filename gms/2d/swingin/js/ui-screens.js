// ============================================================
//  SCREEN OVERLAYS — menu, tutorial, shop, level complete, game over
// ============================================================

import { W, H, UPGRADE_MAX, UPGRADE_COSTS, UPGRADE_NAMES, UPGRADE_DESCS } from './config.js';
import { game, mouse, upgrades, getEffective, resetGame, world } from './state.js';
import { generateLevel } from './level.js';
import { drawParticles } from './draw-particles.js';
import { roundRect } from './draw-utils.js';

// Button collections — populated each frame, consumed by input
export let menuButtons = [];
export let shopButtons = [];
export let levelCompleteButtons = [];
export let gameOverButtons = [];
export let tutorialButton = null;

// ---- MENU --------------------------------------------------

export function drawMenu(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a5c2e');
  grad.addColorStop(1, '#0d2b15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Decorative leaves
  ctx.fillStyle = 'rgba(90, 180, 100, 0.1)';
  for (let i = 0; i < 12; i++) {
    ctx.save();
    ctx.translate(
      Math.sin(Date.now() * 0.0003 + i) * 30 + (i % 4) * 250 + 50,
      Math.cos(Date.now() * 0.0004 + i * 0.7) * 20 + (Math.floor(i / 4)) * 200 + 50
    );
    ctx.rotate(i * 0.5 + Date.now() * 0.0001);
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Title
  ctx.fillStyle = '#4a8c3f';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("SWINGIN'", W / 2 + 3, 143);
  ctx.fillStyle = '#88ff88';
  ctx.fillText("SWINGIN'", W / 2, 140);

  ctx.fillStyle = '#c8e6a0';
  ctx.font = '20px sans-serif';
  ctx.fillText('A Frog Tongue Swinging Adventure', W / 2, 180);

  // Frog mascot
  drawMenuFrog(ctx);

  // Buttons
  menuButtons = [];

  const playBtn = makeButton(W / 2 - 100, 380, 200, 50);
  drawButton(ctx, playBtn, 'PLAY', 'bold 24px sans-serif', true);
  playBtn.action = () => {
    resetGame();
    if (!game.tutorialShown) {
      game.state = 'tutorial';
      game.tutorialShown = true;
    } else {
      generateLevel(game.level);
      game.state = 'playing';
    }
  };
  menuButtons.push(playBtn);

  const helpBtn = makeButton(W / 2 - 80, 445, 160, 40);
  drawGhostButton(ctx, helpBtn, 'How to Play', '16px sans-serif');
  helpBtn.action = () => { game.state = 'tutorial'; };
  menuButtons.push(helpBtn);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('v1.0 \u2022 Y-R-U Games', W / 2, H - 15);
}

function drawMenuFrog(ctx) {
  ctx.save();
  ctx.translate(W / 2, 280);
  ctx.scale(3, 3);
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8e6a0';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath(); ctx.arc(-6, -10, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -10, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-6, -10, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -10, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-5, -10, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(7, -10, 2.5, 0, Math.PI * 2); ctx.fill();
  // Tongue
  ctx.strokeStyle = '#e84057';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const tongueLen = 20 + Math.sin(Date.now() * 0.003) * 8;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.quadraticCurveTo(14 + tongueLen * 0.5, -10, 14 + tongueLen, -5 + Math.sin(Date.now() * 0.005) * 5);
  ctx.stroke();
  ctx.fillStyle = '#ff5070';
  ctx.beginPath();
  ctx.arc(14 + tongueLen, -5 + Math.sin(Date.now() * 0.005) * 5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2d5a28';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(8, -1, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
}

// ---- TUTORIAL ----------------------------------------------

export function drawTutorial(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#88ff88';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('How to Play', W / 2, 60);

  const instructions = [
    ['Click / Tap', 'Shoot your tongue at the nearest anchor point'],
    ['Release', 'Let go of the anchor to launch yourself'],
    ['Aim', 'Move your mouse toward where you want to swing'],
    ['Collect', 'Grab bugs mid-air for coins to buy upgrades'],
    ['Goal', 'Reach and eat the fly at the end of each level!'],
    ['Timer', 'Beat each level before time runs out'],
  ];

  ctx.textAlign = 'left';
  for (let i = 0; i < instructions.length; i++) {
    const y = 110 + i * 55;
    ctx.fillStyle = '#6bcb77';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(instructions[i][0], W / 2 - 250, y);
    ctx.fillStyle = '#ccc';
    ctx.font = '15px sans-serif';
    ctx.fillText(instructions[i][1], W / 2 - 120, y);
  }

  // Mini diagram
  drawTutorialDiagram(ctx);

  const btn = makeButton(W / 2 - 80, 520, 160, 45);
  drawButton(ctx, btn, 'Got it!', 'bold 20px sans-serif', true);
  btn.action = () => {
    game.tutorialShown = true;
    if (game.level === 1 && !world.anchors.length) generateLevel(game.level);
    game.state = 'playing';
  };
  tutorialButton = btn;
}

function drawTutorialDiagram(ctx) {
  ctx.save();
  ctx.translate(W / 2, 460);
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.ellipse(-100, 0, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-104, -8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-96, -8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-103, -8, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-95, -8, 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e84057';
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(-88, 0);
  ctx.lineTo(60, -30);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(42, -30);
  ctx.lineTo(78, -33);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(60, -30, 40, 0.5, 2.0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  const arrowAngle = 2.0;
  const axx = 60 + Math.cos(arrowAngle) * 40;
  const ayy = -30 + Math.sin(arrowAngle) * 40;
  ctx.moveTo(axx, ayy);
  ctx.lineTo(axx + 8, ayy - 5);
  ctx.lineTo(axx + 3, ayy + 7);
  ctx.fill();
  ctx.restore();
}

// ---- SHOP --------------------------------------------------

export function drawShop(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#88ff88';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('UPGRADE SHOP', W / 2, 50);

  ctx.fillStyle = '#ffd93d';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('\u2b25 ' + game.coins + ' coins', W / 2, 82);

  shopButtons = [];
  const keys = Object.keys(upgrades);
  const startY = 110;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const y = startY + i * 75;
    const lvl = upgrades[key];
    const maxed = lvl >= UPGRADE_MAX;
    const cost = maxed ? 0 : UPGRADE_COSTS[key](lvl);
    const canAfford = game.coins >= cost && !maxed;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, W / 2 - 300, y, 600, 65, 10);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(UPGRADE_NAMES[key], W / 2 - 280, y + 25);

    ctx.fillStyle = '#aaa';
    ctx.font = '13px sans-serif';
    ctx.fillText(UPGRADE_DESCS[key], W / 2 - 280, y + 45);

    // Level pips
    for (let j = 0; j < UPGRADE_MAX; j++) {
      ctx.fillStyle = j < lvl ? '#6bcb77' : 'rgba(255,255,255,0.15)';
      roundRect(ctx, W / 2 - 20 + j * 18, y + 18, 14, 14, 3);
      ctx.fill();
    }

    // Current stat
    ctx.fillStyle = '#88ff88';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    const val = getEffective(key);
    let valText = '';
    switch (key) {
      case 'tongueLength': valText = val + 'px'; break;
      case 'timerBoost': valText = val + 's'; break;
      case 'swingPower': valText = (val * 100).toFixed(0) + '%'; break;
      case 'tongueSpeed': valText = val.toFixed(1); break;
      case 'magnetRadius': valText = val + 'px'; break;
    }
    ctx.fillText(valText, W / 2 + 75, y + 55);

    if (!maxed) {
      const btn = makeButton(W / 2 + 180, y + 10, 100, 45);
      const hover = isHover(btn);
      ctx.fillStyle = canAfford ? (hover ? '#6bcb77' : '#4a8c3f') : 'rgba(255,255,255,0.1)';
      roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
      ctx.fill();
      ctx.fillStyle = canAfford ? '#fff' : '#666';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('\u2b25 ' + cost, btn.x + btn.w / 2, btn.y + 28);

      if (canAfford) {
        btn.action = () => { game.coins -= cost; upgrades[key]++; };
        shopButtons.push(btn);
      }
    } else {
      ctx.fillStyle = '#6bcb77';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MAX', W / 2 + 230, y + 38);
    }
  }

  const contBtn = makeButton(W / 2 - 100, H - 65, 200, 50);
  drawButton(ctx, contBtn, 'Next Level \u25b6', 'bold 20px sans-serif', true);
  contBtn.action = () => { generateLevel(game.level); game.state = 'playing'; };
  shopButtons.push(contBtn);
}

// ---- LEVEL COMPLETE ----------------------------------------

export function drawLevelComplete(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);

  drawParticles(ctx);

  ctx.fillStyle = '#88ff88';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Level ' + game.level + ' Complete!', W / 2, 180);

  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Time remaining: ' + Math.ceil(game.timer) + 's', W / 2, 240);

  const timeBonus = Math.floor(game.timer);
  ctx.fillStyle = '#ffd93d';
  ctx.fillText('Time bonus: +' + timeBonus + ' coins', W / 2, 275);
  ctx.fillText('Total coins: ' + game.coins, W / 2, 310);

  levelCompleteButtons = [];

  const shopBtn = makeButton(W / 2 - 100, 360, 200, 50);
  const shopHover = isHover(shopBtn);
  ctx.fillStyle = shopHover ? '#ffd93d' : '#e6b800';
  roundRect(ctx, shopBtn.x, shopBtn.y, shopBtn.w, shopBtn.h, 12);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Upgrades', W / 2, shopBtn.y + 33);
  shopBtn.action = () => {
    game.coins += timeBonus;
    game.totalCoins += timeBonus;
    game.level++;
    game.state = 'shop';
  };
  levelCompleteButtons.push(shopBtn);

  const skipBtn = makeButton(W / 2 - 80, 425, 160, 40);
  drawGhostButton(ctx, skipBtn, 'Skip to next level', '16px sans-serif');
  skipBtn.action = () => {
    game.coins += timeBonus;
    game.totalCoins += timeBonus;
    game.level++;
    generateLevel(game.level);
    game.state = 'playing';
  };
  levelCompleteButtons.push(skipBtn);
}

// ---- GAME OVER ---------------------------------------------

export function drawGameOver(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#ff6b6b';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Game Over', W / 2, 180);

  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Reached Level ' + game.level, W / 2, 230);
  ctx.fillStyle = '#ffd93d';
  ctx.fillText('Total bugs collected: ' + game.totalCoins, W / 2, 265);

  drawSadFrog(ctx);

  gameOverButtons = [];

  const retryBtn = makeButton(W / 2 - 100, 420, 200, 50);
  drawButton(ctx, retryBtn, 'Try Again', 'bold 22px sans-serif', true);
  retryBtn.action = () => { generateLevel(game.level); game.state = 'playing'; };
  gameOverButtons.push(retryBtn);

  const menuBtn = makeButton(W / 2 - 80, 485, 160, 40);
  drawGhostButton(ctx, menuBtn, 'Main Menu', '16px sans-serif');
  menuBtn.action = () => { game.state = 'menu'; };
  gameOverButtons.push(menuBtn);
}

function drawSadFrog(ctx) {
  ctx.save();
  ctx.translate(W / 2, 340);
  ctx.scale(2.5, 2.5);
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8e6a0';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-6, -10, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -10, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-6, -9, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -9, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2d5a28';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(6, 6, 5, Math.PI + 0.5, Math.PI * 2 - 0.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
  ctx.beginPath();
  ctx.ellipse(8, -4, 1.5, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- HELPERS -----------------------------------------------

function makeButton(x, y, w, h) {
  return { x, y, w, h, action: null };
}

function isHover(btn) {
  return mouse.x >= btn.x && mouse.x <= btn.x + btn.w &&
         mouse.y >= btn.y && mouse.y <= btn.y + btn.h;
}

function drawButton(ctx, btn, label, font, primary) {
  const hover = isHover(btn);
  ctx.fillStyle = primary ? (hover ? '#6bcb77' : '#4a8c3f') : (hover ? '#555' : '#333');
  roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h * 0.65);
}

function drawGhostButton(ctx, btn, label, font) {
  const hover = isHover(btn);
  ctx.fillStyle = hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
  roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
  ctx.fill();
  ctx.fillStyle = '#c8e6a0';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h * 0.65);
}
