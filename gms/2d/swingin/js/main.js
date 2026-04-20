// ============================================================
//  MAIN — bootstrap, game loop, top-level draw orchestration
// ============================================================

import { W, H } from './config.js';
import { game, camera, shake, tickShake, world } from './state.js';
import { update } from './physics.js';
import { initInput } from './input.js';
import { drawBackground, drawGround, drawAnchor, drawCollectible, drawFly } from './draw-world.js';
import { drawFrogSprite, drawTongue, drawAimLine } from './draw-frog.js';
import { drawParticles } from './draw-particles.js';
import { drawHUD } from './ui-hud.js';
import {
  drawMenu, drawTutorial, drawShop,
  drawLevelComplete, drawGameOver,
} from './ui-screens.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = W;
canvas.height = H;

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H, 1.5);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

initInput(canvas);

let lastTime = 0;
let paused = false;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    paused = true;
  } else {
    paused = false;
    lastTime = 0;
  }
});

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (!paused) {
    update(dt);
    tickShake(dt);
  }
  draw();

  requestAnimationFrame(gameLoop);
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  if (game.state === 'menu') { drawMenu(ctx); return; }
  if (game.state === 'tutorial') { drawTutorial(ctx); return; }
  if (game.state === 'shop') { drawShop(ctx); return; }

  ctx.save();

  if (shake.timer > 0) {
    ctx.translate(
      (Math.random() - 0.5) * shake.intensity * shake.timer,
      (Math.random() - 0.5) * shake.intensity * shake.timer
    );
  }

  drawBackground(ctx);
  drawGround(ctx);

  for (const a of world.anchors) {
    const sx = a.x - camera.x;
    if (sx > -50 && sx < W + 50) drawAnchor(ctx, a);
  }

  for (const c of world.collectibles) drawCollectible(ctx, c);

  drawFly(ctx);
  drawAimLine(ctx);
  drawTongue(ctx);
  drawFrogSprite(ctx);
  drawParticles(ctx);

  ctx.restore();

  drawHUD(ctx);

  if (game.state === 'levelcomplete') drawLevelComplete(ctx);
  if (game.state === 'gameover') drawGameOver(ctx);
}

requestAnimationFrame(gameLoop);
